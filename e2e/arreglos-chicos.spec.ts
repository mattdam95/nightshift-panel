import { expect, test } from "@playwright/test";
import type { DetalleTarea, Maquinas, ResultadoTarea } from "../src/contrato/api.js";

/**
 * Aceptación de los arreglos chicos (spec: barras de Máquinas y nota del agente).
 *
 * Cada test arma sus propios datos (no importa de otros specs) y simula los endpoints con
 * `page.route`, como `e2e/maquinas.spec.ts` y `e2e/tarea.spec.ts`.
 */

/** El `Maquinas` de ejemplo: PC conectada, VRAM 12/16 GiB (75 %), llm ok a 29.63 tok/s, Mac 18,4/24 GiB. */
const MAQUINAS: Maquinas = {
  ts: "2026-09-27T02:14:10.000Z",
  pc: {
    conexion: "conectada",
    gpu: { temperaturaC: 68, potenciaW: 187, vramUsadaGiB: 12, vramTotalGiB: 16 },
    llm: { salud: "ok", tokPorSegGeneracion: 29.63, tokPorSegPrompt: 400, peticionesEnCurso: 1 },
  },
  mac: {
    memoriaUsadaGiB: 18.4,
    memoriaTotalGiB: 24,
  },
};

/** El mismo ejemplo pero con el llm de la PC caído. */
const MAQUINAS_CAIDO: Maquinas = {
  ...MAQUINAS,
  pc: { ...MAQUINAS.pc, llm: { ...MAQUINAS.pc.llm, salud: "caido" } },
};

const SPEC =
  "## Objetivo\n\n" +
  "El reloj de la noche muestra la hora actual en la vista del detalle.\n\n" +
  "## Criterios de aceptación\n\n" +
  "- [ ] La hora se actualiza cada minuto\n" +
  "- [ ] Cabe en 375 px de ancho";

/** El `ResultadoTarea` de ejemplo con la nota del agente en dos líneas separadas por `\n`. */
const RESULTADO_OK: ResultadoTarea = {
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
  notaAgente: "Primera línea.\nSegunda línea.",
  avisos: ["El turno 2 duró más de lo previsto"],
  pr: "https://github.com/demo/panel/pull/4",
};

const DETALLE_OK: DetalleTarea = {
  id: "demo/panel#3",
  fecha: "2026-09-27",
  resultado: RESULTADO_OK,
  eventos: [],
  spec: SPEC,
};

/** Mockea `GET /api/maquinas` con `maquinas` y abre `#/maquinas` hasta que se ven las dos tarjetas. */
async function abrirMaquinas(page: import("@playwright/test").Page, maquinas: Maquinas): Promise<void> {
  await page.route("**/api/maquinas", (route) => route.fulfill({ json: maquinas }));
  await page.goto("/#/maquinas");
  await expect(page.getByTestId("vista-maquinas")).toBeVisible();
  await expect(page.getByTestId("maquina-pc")).toBeVisible();
  await expect(page.getByTestId("maquina-mac")).toBeVisible();
}

test("maquinas: la barra de VRAM se ve (mínimo 4 px de alto) y su relleno ocupa 75 % del ancho", async ({ page }) => {
  await abrirMaquinas(page, MAQUINAS);

  const barra = page.getByTestId("pc-vram-barra");
  await expect(barra).toHaveCount(1);
  const cajaBarra = (await barra.boundingBox()) ?? { width: 0, height: 0 };
  expect(cajaBarra.height).toBeGreaterThanOrEqual(4);

  const relleno = barra.locator(":scope > div");
  await expect(relleno).toHaveCount(1);
  const cajaRelleno = (await relleno.boundingBox()) ?? { width: 0 };
  const fraccion = cajaRelleno.width / cajaBarra.width;
  expect(fraccion).toBeGreaterThanOrEqual(0.73);
  expect(fraccion).toBeLessThanOrEqual(0.77);
});

test("maquinas: en oscuro, el punto de salud «ok» es verde (var(--ok))", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await abrirMaquinas(page, MAQUINAS);

  const punto = page.getByTestId("salud-llm").locator(".punto");
  await expect(punto).toHaveCount(1);
  await expect(punto).toHaveCSS("background-color", "rgb(63, 185, 80)");
});

test("maquinas: en oscuro, el punto de salud «caído» es rojo (var(--error))", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await abrirMaquinas(page, MAQUINAS_CAIDO);

  const punto = page.getByTestId("salud-llm").locator(".punto");
  await expect(punto).toHaveCount(1);
  await expect(punto).toHaveCSS("background-color", "rgb(248, 81, 73)");
});

test("tarea: la nota del agente con salto de línea se muestra en dos líneas (white-space: pre-wrap)", async ({ page }) => {
  await page.route("**/api/tareas/demo/panel/3", (route) => route.fulfill({ json: DETALLE_OK }));

  await page.goto("/#/tarea/demo/panel/3");
  await expect(page.getByTestId("nota-agente")).toBeVisible();
  await expect(page.getByTestId("nota-agente")).toHaveCSS("white-space", "pre-wrap");
});
