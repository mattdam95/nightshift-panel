import { expect, test } from "@playwright/test";
import { hora } from "../web/src/formato.js";
import type { DetalleTarea, ResultadoTarea } from "../src/contrato/api.js";
import type { Etapa, Evento } from "../src/contrato/eventos.js";

/**
 * Aceptación de la vista `#/tarea/<owner>/<repo>/<n>` (spec: Detalle de tarea: vista).
 *
 * El endpoint `GET /api/tareas/:owner/:repo/:n` es otro issue («Detalle de tarea: API»): la vista se
 * prueba contra un pedido simulado con `page.route` y un `DetalleTarea` construido a mano (la vista lo
 * pide con `obtener` de `web/src/api.ts`).
 *
 * De solo lectura: no escribe en `.e2e/` (comparte un solo server y una sola copia de datos con las
 * demás specs).
 */

const RUTA_3 = "**/api/tareas/demo/panel/3";
const RUTA_4 = "**/api/tareas/demo/panel/4";

const ev = (ts: string, etapa: Etapa, tipo: string, datos: Record<string, unknown> = {}): Evento => ({
  ts,
  maquina: etapa === "revision" ? "mac" : "pc",
  tarea: "demo/panel#3",
  etapa,
  tipo,
  datos,
});

const SPEC =
  "## Objetivo\n\n" +
  "El reloj de la noche muestra la hora actual en la vista del detalle.\n\n" +
  "## Criterios de aceptación\n\n" +
  "- [ ] La hora se actualiza cada minuto\n" +
  "- [ ] Cabe en 375 px de ancho";

const resultadoOk: ResultadoTarea = {
  tarea: "demo/panel#3",
  repo: "demo/panel",
  numero: 3,
  titulo: "Reloj de la noche",
  estado: "lista",
  motivo: "verificación OK y el revisor aprueba",
  inicio: "2026-09-27T01:00:21.000Z",
  fin: "2026-09-27T01:03:36.000Z",
  turnos: 5,
  tokens: 1110,
  llamadas: 4,
  rondasAgente: 2,
  testsAceptacion: ["pnpm lint", "pnpm test"],
  verificacion: {
    ok: true,
    pasos: [
      { comando: "pnpm install --frozen-lockfile", ok: true },
      { comando: "pnpm lint", ok: true },
      { comando: "pnpm test", ok: true },
    ],
  },
  revision: { estado: "aprobar", problemas: [], rondas: 1 },
  notaAgente: "Solo toqué el reloj; nada más cambió.",
  avisos: ["El turno 2 duró más de lo previsto"],
  pr: "https://github.com/demo/panel/pull/4",
};

const detalleOk: DetalleTarea = {
  id: "demo/panel#3",
  fecha: "2026-09-27",
  resultado: resultadoOk,
  eventos: [],
  spec: SPEC,
};

test("tarea: muestra título, estado, duración, turnos, tokens, pasos de verificación, veredicto, nota, avisos y link a la PR", async ({
  page,
}) => {
  await page.route(RUTA_3, (route) => route.fulfill({ json: detalleOk }));

  await page.goto("/#/tarea/demo/panel/3");

  await expect(page.getByTestId("vista-tarea")).toBeVisible();
  await expect(page.getByTestId("tarea-titulo")).toHaveText("Reloj de la noche");
  await expect(page.getByTestId("tarea-estado")).toContainText("lista");
  await expect(page.getByTestId("tarea-duracion")).toContainText("3 min 15 s");
  await expect(page.getByTestId("tarea-turnos")).toContainText("5");
  await expect(page.getByTestId("tarea-tokens")).toContainText(/1[.,]?110/);

  const pasos = page.getByTestId("paso-verificacion");
  await expect(pasos).toHaveCount(3);
  await expect(pasos.nth(0)).toHaveAttribute("data-ok", "true");
  await expect(pasos.nth(0)).toContainText("pnpm install --frozen-lockfile");
  await expect(pasos.nth(1)).toHaveAttribute("data-ok", "true");
  await expect(pasos.nth(1)).toContainText("pnpm lint");
  await expect(pasos.nth(2)).toHaveAttribute("data-ok", "true");
  await expect(pasos.nth(2)).toContainText("pnpm test");

  await expect(page.getByTestId("veredicto")).toContainText("aprobar");
  await expect(page.getByTestId("nota-agente")).toBeVisible();
  await expect(page.getByTestId("nota-agente")).toContainText("Solo toqué el reloj; nada más cambió.");
  await expect(page.getByTestId("avisos-tarea")).toBeVisible();
  await expect(page.getByTestId("avisos-tarea")).toContainText("El turno 2 duró más de lo previsto");

  const link = page.getByTestId("link-pr");
  await expect(link).toBeVisible();
  await expect(link).toHaveAttribute("href", "https://github.com/demo/panel/pull/4");
  await expect(link).toHaveAttribute("target", "_blank");
  expect((await link.getAttribute("rel")) ?? "").toContain("noopener");
});

test("tarea: la spec viene plegada y al tocar su resumen se ve su texto", async ({ page }) => {
  await page.route(RUTA_3, (route) => route.fulfill({ json: detalleOk }));

  await page.goto("/#/tarea/demo/panel/3");
  await expect(page.getByTestId("vista-tarea")).toBeVisible();

  const spec = page.getByTestId("spec");
  await expect(spec).toHaveCount(1);
  await expect(spec).toHaveJSProperty("open", false);

  await spec.locator("summary").click();
  await expect(spec).toHaveJSProperty("open", true);
  await expect(spec.locator("pre")).toContainText("El reloj de la noche muestra la hora actual en la vista del detalle.");
});

test("tarea: si la spec no se pudo traer, muestra spec-no-disponible y no la spec", async ({ page }) => {
  await page.route(RUTA_3, (route) => route.fulfill({ json: { ...detalleOk, spec: null } }));

  await page.goto("/#/tarea/demo/panel/3");
  await expect(page.getByTestId("vista-tarea")).toBeVisible();

  await expect(page.getByTestId("spec-no-disponible")).toBeVisible();
  await expect(page.getByTestId("spec")).toHaveCount(0);
});

test("tarea: los eventos salen en un grupo por etapa, cerrados; al abrir uno se ve la hora y el tipo", async ({ page }) => {
  const eventos = [
    ev("2026-09-27T01:00:21.000Z", "preparacion", "inicio", { rama: "agent/3-reloj", titulo: "Reloj de la noche" }),
    ev("2026-09-27T01:02:27.000Z", "verificacion", "paso", { comando: "pnpm test", ok: true }),
    ev("2026-09-27T01:03:12.000Z", "entrega", "pr", { url: "https://github.com/demo/panel/pull/4" }),
  ];
  await page.route(RUTA_3, (route) => route.fulfill({ json: { ...detalleOk, eventos } }));

  await page.goto("/#/tarea/demo/panel/3");
  await expect(page.getByTestId("vista-tarea")).toBeVisible();

  const grupos = page.getByTestId("etapa-eventos");
  await expect(grupos).toHaveCount(3);
  for (let i = 0; i < 3; i++) {
    await expect(grupos.nth(i)).toHaveJSProperty("open", false);
  }

  await grupos.first().locator("summary").click();
  await expect(grupos.first()).toHaveJSProperty("open", true);
  await expect(grupos.first()).toContainText(hora("2026-09-27T01:00:21.000Z"));
  await expect(grupos.first()).toContainText("inicio");
});

test("tarea: la tarea en curso (resultado null) muestra «En curso», sin duración, PR, nota ni avisos", async ({ page }) => {
  const enCurso: DetalleTarea = {
    id: "demo/panel#3",
    fecha: "2026-09-27",
    resultado: null,
    eventos: [
      ev("2026-09-27T01:00:21.000Z", "preparacion", "inicio", { rama: "agent/3-reloj", titulo: "Reloj de la noche" }),
      ev("2026-09-27T01:00:49.000Z", "tests", "turno", { n: 1, tokens: 120 }),
    ],
    spec: null,
  };
  await page.route(RUTA_3, (route) => route.fulfill({ json: enCurso }));

  await page.goto("/#/tarea/demo/panel/3");
  await expect(page.getByTestId("vista-tarea")).toBeVisible();

  await expect(page.getByTestId("tarea-titulo")).toHaveText("demo/panel#3");
  await expect(page.getByTestId("tarea-estado")).toContainText("En curso");
  await expect(page.getByTestId("tarea-duracion")).toHaveCount(0);
  await expect(page.getByTestId("link-pr")).toHaveCount(0);
  await expect(page.getByTestId("nota-agente")).toHaveCount(0);
  await expect(page.getByTestId("avisos-tarea")).toHaveCount(0);
  await expect(page.getByTestId("veredicto")).toContainText("Sin revisión");
});

test("tarea: la revisión «cambios» muestra el veredicto y cada problema", async ({ page }) => {
  const cambios: DetalleTarea = {
    ...detalleOk,
    resultado: { ...resultadoOk, revision: { estado: "cambios", problemas: ["falta un test"], rondas: 1 } },
  };
  await page.route(RUTA_3, (route) => route.fulfill({ json: cambios }));

  await page.goto("/#/tarea/demo/panel/3");
  await expect(page.getByTestId("vista-tarea")).toBeVisible();

  await expect(page.getByTestId("veredicto")).toContainText("cambios");
  const problemas = page.getByTestId("problema");
  await expect(problemas).toHaveCount(1);
  await expect(problemas.first()).toContainText("falta un test");
});

test("tarea: si el pedido responde 404, muestra el error del server y sin título ni secciones", async ({ page }) => {
  await page.route(RUTA_3, (route) => route.fulfill({ status: 404, json: { error: "no hay datos de esa tarea" } }));

  await page.goto("/#/tarea/demo/panel/3");

  await expect(page.getByTestId("error-tarea")).toContainText("no hay datos de esa tarea");
  await expect(page.getByTestId("tarea-titulo")).toHaveCount(0);
  await expect(page.getByTestId("spec")).toHaveCount(0);
  await expect(page.getByTestId("verificacion-pasos")).toHaveCount(0);
});

test("tarea: si el pedido responde 500, mismo manejo", async ({ page }) => {
  await page.route(RUTA_3, (route) => route.fulfill({ status: 500, json: { error: "no hay datos de esa tarea" } }));

  await page.goto("/#/tarea/demo/panel/3");

  await expect(page.getByTestId("error-tarea")).toContainText("no hay datos de esa tarea");
  await expect(page.getByTestId("tarea-titulo")).toHaveCount(0);
});

test("tarea: si el pedido se aborta (red caída), muestra el error y sin título", async ({ page }) => {
  await page.route(RUTA_3, (route) => route.abort());

  await page.goto("/#/tarea/demo/panel/3");

  await expect(page.getByTestId("error-tarea")).toBeVisible();
  await expect(page.getByTestId("tarea-titulo")).toHaveCount(0);
});

test("tarea: con un número que no es número, muestra «Tarea inválida» sin hacer ningún pedido", async ({ page }) => {
  let peticiones = 0;
  await page.route("**/api/tareas/demo/panel/**", (route) => {
    peticiones += 1;
    return route.abort();
  });

  await page.goto("/#/tarea/demo/panel/abc");
  await expect(page.getByTestId("error-tarea")).toContainText("Tarea inválida");

  // Le damos tiempo a que salga un pedido que no debería existir.
  await page.waitForTimeout(500);
  expect(peticiones).toBe(0);
});

test("tarea: al cambiar de tarea se limpia lo anterior: si la nueva falla, sin título viejo y con el error", async ({ page }) => {
  await page.route(RUTA_3, (route) => route.fulfill({ json: detalleOk }));
  await page.route(RUTA_4, (route) => route.fulfill({ status: 500, json: { error: "no hay datos de esa tarea" } }));

  await page.goto("/#/tarea/demo/panel/3");
  await expect(page.getByTestId("tarea-titulo")).toHaveText("Reloj de la noche");

  await page.goto("/#/tarea/demo/panel/4");

  await expect(page.getByTestId("tarea-titulo")).toHaveCount(0);
  await expect(page.getByTestId("error-tarea")).toContainText("no hay datos de esa tarea");
});

test("tarea: a 375 px no hay scroll horizontal y el botón a la PR mide al menos 44 px de alto", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });

  const specLarga: DetalleTarea = { ...detalleOk, spec: "x".repeat(400) };
  await page.route(RUTA_3, (route) => route.fulfill({ json: specLarga }));

  await page.goto("/#/tarea/demo/panel/3");
  await expect(page.getByTestId("tarea-titulo")).toHaveText("Reloj de la noche");

  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);

  const link = page.getByTestId("link-pr");
  await expect(link).toBeVisible();
  expect((await link.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
});
