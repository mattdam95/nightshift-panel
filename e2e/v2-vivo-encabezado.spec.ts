import { expect, test, type Page } from "@playwright/test";
import type { EstadoPc, SnapshotVivo } from "../src/contrato/api.js";
import { estadoInicial, type NocheVivo } from "../src/contrato/vivo.js";

/**
 * En vivo V2 (parte 1): encabezado, acciones de vidrio, estado vacío y listas agrupadas.
 * El snapshot de `/api/vivo` se simula con `page.route` y el stream se corta, como en acciones.spec.ts.
 */

const estadoPc: EstadoPc = {
  ts: "2026-09-27T02:00:00Z",
  corriendo: true,
  pausado: false,
  actual: null,
  ultimaNoche: "2026-09-27",
};

const NOCHE_ACTIVA: NocheVivo = { inicio: "2026-09-27T01:00:00.000Z", hasta: null, activa: true };

const snapshot = (cola: string[] = []): SnapshotVivo => ({
  vivo: { ...estadoInicial(), noche: NOCHE_ACTIVA, cola },
  pc: "conectada",
  estadoPc,
  ultimoId: null,
});

async function cargarVivo(page: Page, snap: SnapshotVivo): Promise<void> {
  await page.route("**/api/vivo", (route) => route.fulfill({ status: 200, contentType: "application/json", json: snap }));
  await page.route("**/api/stream*", (route) => route.abort());
  await page.goto("/#/vivo");
  await expect(page.getByTestId("estado-conexion")).toHaveAttribute("data-pc", "conectada");
}

test("v2 en vivo: el h1 es «En vivo» y el estado de la noche pasa a un subtítulo (p) con el mismo texto", async ({ page }) => {
  await cargarVivo(page, snapshot());

  const vista = page.getByTestId("vista-vivo");
  await expect(vista.locator("h1")).toHaveText("En vivo");
  const subtitulo = page.getByTestId("titulo-noche");
  expect(await subtitulo.evaluate((el) => el.tagName)).toBe("P");
  await expect(subtitulo).toContainText("Noche en curso");
});

test("v2 en vivo: pausar es una cápsula en la misma fila que el subtítulo", async ({ page }) => {
  await cargarVivo(page, snapshot());

  const pausar = page.getByTestId("accion-pausar");
  const yPausar = (await pausar.boundingBox())!.y;
  const ySubtitulo = (await page.getByTestId("titulo-noche").boundingBox())!.y;
  expect(Math.abs(yPausar - ySubtitulo)).toBeLessThan(30);
  const radio = await pausar.evaluate((el) => parseFloat(getComputedStyle(el).borderTopLeftRadius));
  expect(radio).toBeGreaterThanOrEqual(22);
});

test("v2 en vivo: Modo juego es una cápsula de vidrio amarilla", async ({ page }) => {
  await cargarVivo(page, snapshot());

  const juego = page.getByTestId("accion-juego");
  await expect(juego).toHaveClass(/vidrio-amarillo/);
  await expect(juego).toHaveCSS("color", "rgb(255, 214, 10)");
});

test("v2 en vivo: sin tarea en curso, el vacío es una tarjeta con ícono", async ({ page }) => {
  await cargarVivo(page, snapshot());

  const tarjeta = page.locator(".tarjeta", { hasText: "No hay ninguna tarea corriendo." });
  await expect(tarjeta).toHaveCount(1);
  await expect(tarjeta.locator("svg").first()).toBeVisible();
});

test("v2 en vivo: «En cola» es una lista agrupada con el número y el repo de cada tarea", async ({ page }) => {
  await cargarVivo(page, snapshot(["demo/panel#7"]));

  const lista = page.getByTestId("cola-vivo");
  expect(await lista.evaluate((el) => el.tagName)).toBe("UL");
  await expect(lista).toHaveClass(/grupo/);
  const fila = lista.locator("li");
  await expect(fila).toHaveCount(1);
  await expect(fila).toContainText("#7");
  await expect(fila).toContainText("demo/panel");
});

test("v2 en vivo: al tocar Modo juego la confirmación ocupa todo el ancho de la vista", async ({ page }) => {
  await cargarVivo(page, snapshot());

  await page.getByTestId("accion-juego").click();
  await expect(page.getByTestId("confirmacion")).toBeVisible();

  const vista = (await page.getByTestId("vista-vivo").boundingBox())!;
  const acciones = (await page.getByTestId("acciones").boundingBox())!;
  expect(Math.abs(acciones.width - vista.width)).toBeLessThanOrEqual(2);
});
