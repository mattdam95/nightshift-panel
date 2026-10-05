import { expect, test, type Page } from "@playwright/test";
import type { EstadoPc, SnapshotVivo } from "../src/contrato/api.js";
import { estadoInicial, type NocheVivo, type TareaTerminada } from "../src/contrato/vivo.js";

/**
 * Aceptación de los botones de acciones en la vista En vivo (spec: Acciones: botones y confirmación).
 *
 * No dependen del server real: el snapshot de `/api/vivo` se simula con `page.route`, el stream se
 * corta (abort) y los POST a `/api/acciones/*` se responden (o se cortan) ahí mismo.
 */

const estadoPc = (pausado: boolean): EstadoPc => ({
  ts: "2026-09-27T02:00:00Z",
  corriendo: true,
  pausado,
  actual: null,
  ultimaNoche: "2026-09-27",
});

const terminada = (id: string, estado: string): TareaTerminada => ({
  id,
  titulo: `Tarea ${id}`,
  estado,
  motivo: "ok",
  pr: null,
  inicio: "2026-09-27T01:00:00.000Z",
  fin: "2026-09-27T01:30:00.000Z",
});

const NOCHE_ACTIVA: NocheVivo = { inicio: "2026-09-27T01:00:00.000Z", hasta: null, activa: true };

const snapshot = (pausado: boolean, terminadas: TareaTerminada[] = [], noche: NocheVivo | null = NOCHE_ACTIVA): SnapshotVivo => ({
  vivo: { ...estadoInicial(), noche, terminadas },
  pc: "conectada",
  estadoPc: estadoPc(pausado),
  ultimoId: null,
});

/**
 * Carga la vista En vivo con el snapshot simulado. El stream se corta (abort) porque estos tests
 * no reciben eventos SSE; la espera se hace sobre el snapshot (data-pc), no sobre el stream.
 */
async function cargarVivo(page: Page, snap: SnapshotVivo): Promise<void> {
  await page.route("**/api/vivo", (route) => route.fulfill({ status: 200, contentType: "application/json", json: snap }));
  await page.route("**/api/stream*", (route) => route.abort());
  await page.goto("/#/vivo");
  await expect(page.getByTestId("estado-conexion")).toHaveAttribute("data-pc", "conectada");
}

/** La fila `terminada` de una tarea, buscando el id exacto en su enlace. */
function filaDe(page: Page, id: string) {
  return page.getByTestId("terminada").filter({ has: page.getByRole("link", { name: id, exact: true }) });
}

/** Toca el botón de acción y luego «Confirmar» (la confirmación tiene que estar abierta). */
async function confirmarAccion(page: Page, accion: string): Promise<void> {
  await page.getByTestId("acciones").getByTestId(`accion-${accion}`).click();
  await expect(page.getByTestId("confirmacion")).toBeVisible();
  await page.getByTestId("confirmar-accion").click();
}

test("acciones: pausar o reanudar en la tarjeta de acciones, y juego aparte", async ({ page }) => {
  let snap: SnapshotVivo = snapshot(false);
  await page.route("**/api/vivo", (route) => route.fulfill({ status: 200, contentType: "application/json", json: snap }));
  await page.route("**/api/stream*", (route) => route.abort());

  await page.goto("/#/vivo");
  await expect(page.getByTestId("estado-conexion")).toHaveAttribute("data-pc", "conectada");
  const acciones = page.getByTestId("acciones");
  await expect(acciones.getByTestId("accion-pausar")).toBeVisible();
  await expect(page.getByTestId("accion-juego")).toBeVisible();
  await expect(acciones.getByTestId("accion-pausar")).toHaveText("Pausar");
  await expect(page.getByTestId("accion-juego")).toHaveText("Modo juego");
  await expect(acciones.getByTestId("accion-reanudar")).toHaveCount(0);

  // Otra carga, ahora con la noche pausada.
  snap = snapshot(true);
  await page.reload();
  await expect(page.getByTestId("estado-conexion")).toHaveAttribute("data-pc", "conectada");
  await expect(acciones.getByTestId("accion-reanudar")).toBeVisible();
  await expect(page.getByTestId("accion-juego")).toBeVisible();
  await expect(acciones.getByTestId("accion-reanudar")).toHaveText("Reanudar");
  await expect(acciones.getByTestId("accion-pausar")).toHaveCount(0);
});

test("acciones: reintentar solo aparece en las terminadas bloqueadas", async ({ page }) => {
  await cargarVivo(page, snapshot(false, [terminada("demo/panel#1", "bloqueada"), terminada("demo/panel#3", "lista")]));

  await expect(page.getByTestId("accion-reintentar")).toHaveCount(1);
  await expect(filaDe(page, "demo/panel#1").getByTestId("accion-reintentar")).toHaveCount(1);
  await expect(filaDe(page, "demo/panel#3").getByTestId("accion-reintentar")).toHaveCount(0);
});

test("acciones: cancelar cierra la confirmación sin mandar ningún pedido", async ({ page }) => {
  let posts = 0;
  await page.route("**/api/acciones/*", (route) => {
    posts += 1;
    return route.fulfill({ status: 200, contentType: "application/json", json: { ok: true, mensaje: "(simulado)" } });
  });
  await cargarVivo(page, snapshot(false));

  await page.getByTestId("acciones").getByTestId("accion-pausar").click();
  const confirmacion = page.getByTestId("confirmacion");
  await expect(confirmacion).toBeVisible();
  await expect(confirmacion).toContainText("Pausar la noche");
  expect(posts).toBe(0);

  await confirmacion.getByTestId("cancelar-accion").click();
  await expect(confirmacion).toHaveCount(0);
  expect(posts).toBe(0);
});

test("acciones: confirmar manda un solo POST con el cuerpo exacto y muestra el resultado", async ({ page }) => {
  const posts: { url: string; cuerpo: unknown }[] = [];
  await page.route("**/api/acciones/*", (route) => {
    posts.push({ url: route.request().url(), cuerpo: JSON.parse(route.request().postData() ?? "{}") });
    return route.fulfill({ status: 200, contentType: "application/json", json: { ok: true, mensaje: "(simulado) pausar" } });
  });
  await cargarVivo(page, snapshot(false));

  await confirmarAccion(page, "pausar");

  expect(posts).toHaveLength(1);
  expect(posts[0]!.url).toContain("/api/acciones/pausar");
  expect(posts[0]!.cuerpo).toEqual({ confirmar: true });

  await expect(page.getByTestId("confirmacion")).toHaveCount(0);
  const resultado = page.getByTestId("resultado-accion");
  await expect(resultado).toBeVisible();
  await expect(resultado).toContainText("(simulado) pausar");
  await expect(resultado).toHaveAttribute("data-ok", "true");
});

test("acciones: mientras el pedido está en curso todo queda deshabilitado y no se manda dos veces", async ({ page }) => {
  let posts = 0;
  await page.route("**/api/acciones/*", async (route) => {
    posts += 1;
    await new Promise((r) => setTimeout(r, 500));
    return route.fulfill({ status: 200, contentType: "application/json", json: { ok: true, mensaje: "(simulado) pausar" } });
  });
  await cargarVivo(page, snapshot(false));

  await page.getByTestId("acciones").getByTestId("accion-pausar").click();
  const confirmacion = page.getByTestId("confirmacion");
  await expect(confirmacion).toBeVisible();
  await confirmacion.getByTestId("confirmar-accion").click();

  // Mientras espera: la confirmación sigue visible con los botones deshabilitados.
  await expect(confirmacion.getByTestId("confirmar-accion")).toBeDisabled();
  await expect(confirmacion.getByTestId("cancelar-accion")).toBeDisabled();
  await expect(page.getByTestId("accion-juego")).toBeDisabled();
  await expect(confirmacion).toContainText("Enviando…");

  await expect(page.getByTestId("resultado-accion")).toBeVisible();
  await expect(confirmacion).toHaveCount(0);
  expect(posts).toBe(1);
});

test("acciones: reintentar confirma con la tarea en el cuerpo del POST", async ({ page }) => {
  const posts: { url: string; cuerpo: unknown }[] = [];
  await page.route("**/api/acciones/*", (route) => {
    posts.push({ url: route.request().url(), cuerpo: JSON.parse(route.request().postData() ?? "{}") });
    return route.fulfill({ status: 200, contentType: "application/json", json: { ok: true, mensaje: "(simulado) reintentar" } });
  });
  await cargarVivo(page, snapshot(false, [terminada("demo/panel#1", "bloqueada")]));

  await filaDe(page, "demo/panel#1").getByTestId("accion-reintentar").click();
  const confirmacion = page.getByTestId("confirmacion");
  await expect(confirmacion).toContainText("demo/panel#1");
  await confirmacion.getByTestId("confirmar-accion").click();

  expect(posts).toHaveLength(1);
  expect(posts[0]!.url).toContain("/api/acciones/reintentar");
  expect(posts[0]!.cuerpo).toEqual({ confirmar: true, tarea: "demo/panel#1" });
  await expect(page.getByTestId("resultado-accion")).toBeVisible();
});

test("acciones: con el botón lejos de arriba, la confirmación queda dentro del viewport", async ({ page }) => {
  // 12 terminadas: la bloqueada va primera en el arreglo, así aparece al final de la lista (lejos de arriba).
  const terminadas = [
    terminada("demo/panel#1", "bloqueada"),
    ...Array.from({ length: 11 }, (_, i) => terminada(`demo/panel#${101 + i}`, "lista")),
  ];
  await cargarVivo(page, snapshot(false, terminadas));
  await expect(page.getByTestId("terminada")).toHaveCount(12);

  const boton = filaDe(page, "demo/panel#1").getByTestId("accion-reintentar");
  await boton.scrollIntoViewIfNeeded();
  await boton.click();

  await expect(page.getByTestId("confirmacion")).toBeInViewport();
});

test("acciones: un POST que responde 400 muestra el error del server con data-ok=false", async ({ page }) => {
  await page.route("**/api/acciones/*", (route) =>
    route.fulfill({ status: 400, contentType: "application/json", json: { error: "falta confirmar: true" } }),
  );
  await cargarVivo(page, snapshot(false));

  await confirmarAccion(page, "pausar");

  const resultado = page.getByTestId("resultado-accion");
  await expect(resultado).toBeVisible();
  await expect(resultado).toContainText("falta confirmar: true");
  await expect(resultado).toHaveAttribute("data-ok", "false");
});

test("acciones: un POST que responde 500 sin cuerpo JSON muestra algún mensaje de error", async ({ page }) => {
  await page.route("**/api/acciones/*", (route) => route.fulfill({ status: 500 }));
  await cargarVivo(page, snapshot(false));

  await confirmarAccion(page, "pausar");

  const resultado = page.getByTestId("resultado-accion");
  await expect(resultado).toHaveAttribute("data-ok", "false");
  expect((await resultado.innerText()).trim()).not.toBe("");
});

test("acciones: si el POST no llega (red caída) muestra «No se pudo conectar con el panel»", async ({ page }) => {
  await page.route("**/api/acciones/*", (route) => route.abort());
  await cargarVivo(page, snapshot(false));

  await confirmarAccion(page, "pausar");

  const resultado = page.getByTestId("resultado-accion");
  await expect(resultado).toBeVisible();
  await expect(resultado).toContainText("No se pudo conectar con el panel");
  await expect(resultado).toHaveAttribute("data-ok", "false");
});

test("acciones: abrir otra confirmación reemplaza la anterior y borra el resultado", async ({ page }) => {
  await page.route("**/api/acciones/*", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", json: { ok: true, mensaje: "(simulado) pausar" } }),
  );
  await cargarVivo(page, snapshot(false));

  // Primer pedido (pausar) confirmado, con su resultado en pantalla.
  await confirmarAccion(page, "pausar");
  const resultado = page.getByTestId("resultado-accion");
  await expect(resultado).toBeVisible();
  await expect(resultado).toContainText("(simulado) pausar");

  // Segunda confirmación (juego): reemplaza a la anterior y borra el resultado.
  await page.getByTestId("accion-juego").click();
  const confirmacion = page.getByTestId("confirmacion");
  await expect(confirmacion).toHaveCount(1);
  await expect(confirmacion).toContainText("Modo juego");
  await expect(resultado).toHaveCount(0);
});

test("acciones: a 375 px la confirmación abierta no causa scroll horizontal y los botones miden al menos 44 px", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.route("**/api/acciones/*", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", json: { ok: true, mensaje: "(simulado)" } }),
  );
  await cargarVivo(page, snapshot(false, [terminada("demo/panel#1", "bloqueada")]));

  await page.getByTestId("acciones").getByTestId("accion-pausar").click();
  await expect(page.getByTestId("confirmacion")).toBeVisible();

  const ancho = page.viewportSize()!.width;
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(ancho);

  const botones = [
    page.getByTestId("acciones").getByTestId("accion-pausar"),
    page.getByTestId("accion-juego"),
    page.getByTestId("confirmar-accion"),
    page.getByTestId("cancelar-accion"),
  ];
  for (const boton of botones) {
    await expect(boton).toBeVisible();
    expect((await boton.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
  }
});

test("acciones: sin noche no hay pausar, reanudar ni tarjeta de acciones, pero Modo juego sigue visible", async ({ page }) => {
  await cargarVivo(page, snapshot(false, [], null));

  await expect(page.getByTestId("accion-pausar")).toHaveCount(0);
  await expect(page.getByTestId("accion-reanudar")).toHaveCount(0);
  await expect(page.getByTestId("acciones")).toHaveCount(0);
  await expect(page.getByTestId("accion-juego")).toBeVisible();
  await expect(page.getByTestId("accion-juego")).toHaveText("Modo juego");
});

test("acciones: con noche activa pausar está dentro de la tarjeta, y con la noche pausada se alterna a reanudar", async ({ page }) => {
  let snap: SnapshotVivo = snapshot(false);
  await page.route("**/api/vivo", (route) => route.fulfill({ status: 200, contentType: "application/json", json: snap }));
  await page.route("**/api/stream*", (route) => route.abort());
  await page.goto("/#/vivo");
  await expect(page.getByTestId("estado-conexion")).toHaveAttribute("data-pc", "conectada");
  await expect(page.getByTestId("acciones").getByTestId("accion-pausar")).toBeVisible();
  await expect(page.getByTestId("accion-reanudar")).toHaveCount(0);

  snap = snapshot(true);
  await page.reload();
  await expect(page.getByTestId("estado-conexion")).toHaveAttribute("data-pc", "conectada");
  await expect(page.getByTestId("acciones").getByTestId("accion-reanudar")).toBeVisible();
  await expect(page.getByTestId("accion-pausar")).toHaveCount(0);
});

test("acciones: Modo juego está en la cabecera, con ícono, a la derecha y fuera de la tarjeta de acciones", async ({ page }) => {
  await cargarVivo(page, snapshot(false));

  const vista = page.getByTestId("vista-vivo");
  const juego = vista.locator("> header").getByTestId("accion-juego");
  await expect(juego).toBeVisible();
  await expect(juego.locator("svg")).toHaveCount(1);
  await expect(page.getByTestId("acciones").getByTestId("accion-juego")).toHaveCount(0);

  const cajaVista = (await vista.boundingBox())!;
  const cajaJuego = (await juego.boundingBox())!;
  expect(cajaVista.x + cajaVista.width - (cajaJuego.x + cajaJuego.width)).toBeLessThanOrEqual(24);
});

test("acciones: Modo juego se ve en el color de acento", async ({ page }) => {
  await cargarVivo(page, snapshot(false));

  const juego = page.getByTestId("accion-juego");
  // El color de acento tal como lo calcula el navegador, leído de una variable CSS.
  const acento = await page.evaluate(() => {
    const el = document.createElement("span");
    el.style.color = "var(--acento)";
    document.body.append(el);
    const color = getComputedStyle(el).color;
    el.remove();
    return color;
  });
  await expect(juego).toHaveCSS("color", acento);
});

test("acciones: Modo juego pide confirmación y manda el POST a /api/acciones/juego", async ({ page }) => {
  const posts: string[] = [];
  await page.route("**/api/acciones/*", (route) => {
    posts.push(route.request().url());
    return route.fulfill({ status: 200, contentType: "application/json", json: { ok: true, mensaje: "(simulado) juego" } });
  });
  await cargarVivo(page, snapshot(false));

  await page.getByTestId("accion-juego").click();
  await expect(page.getByTestId("confirmacion")).toContainText("Modo juego");
  expect(posts).toHaveLength(0);
  await page.getByTestId("confirmar-accion").click();

  await expect(page.getByTestId("resultado-accion")).toContainText("(simulado) juego");
  expect(posts).toHaveLength(1);
  expect(posts[0]).toContain("/api/acciones/juego");
});

test("acciones: sin noche, Modo juego abre la confirmación dentro de la tarjeta de acciones", async ({ page }) => {
  await cargarVivo(page, snapshot(false, [], null));
  await expect(page.getByTestId("acciones")).toHaveCount(0);

  await page.getByTestId("accion-juego").click();

  const acciones = page.getByTestId("acciones");
  await expect(acciones).toBeVisible();
  await expect(acciones.getByTestId("confirmacion")).toContainText("Modo juego");
});
