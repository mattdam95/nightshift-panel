import { expect, test } from "@playwright/test";
import type { DetalleTarea, ResultadoTarea } from "../src/contrato/api.js";
import type { Etapa, Evento } from "../src/contrato/eventos.js";

/**
 * Tarea V2: botón de volver y «PR #N» arriba, encabezado con id, título y chip de estado, números en tres
 * bloques y las secciones como listas agrupadas. `GET /api/tareas/demo/panel/3` se simula con `page.route`.
 */

const RUTA = "**/api/tareas/demo/panel/3";

const ev = (ts: string, etapa: Etapa, tipo: string): Evento => ({ ts, maquina: "pc", tarea: "demo/panel#3", etapa, tipo, datos: {} });

const resultado: ResultadoTarea = {
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
    ok: false,
    pasos: [
      { comando: "pnpm lint", ok: true },
      { comando: "pnpm test", ok: false },
    ],
  },
  revision: { estado: "aprobar", problemas: [], rondas: 1 },
  notaAgente: "Solo toqué el reloj; nada más cambió.",
  avisos: ["El turno 2 duró más de lo previsto"],
  pr: "https://github.com/demo/panel/pull/4",
};

const detalle: DetalleTarea = {
  id: "demo/panel#3",
  fecha: "2026-09-27",
  resultado,
  eventos: [ev("2026-09-27T01:00:21.000Z", "preparacion", "inicio"), ev("2026-09-27T01:02:27.000Z", "verificacion", "paso")],
  spec: "## Objetivo\n\nEl reloj de la noche.",
};

async function abrir(page: import("@playwright/test").Page, d: DetalleTarea = detalle): Promise<void> {
  await page.route(RUTA, (route) => route.fulfill({ json: d }));
  await page.goto("/#/tarea/demo/panel/3");
  await expect(page.getByTestId("tarea-titulo")).toHaveText("Reloj de la noche");
}

test("v2 tarea: «PR #4» está arriba del título como cápsula azul y no hay otro «Ver PR» abajo", async ({ page }) => {
  await abrir(page);

  const pr = page.getByTestId("link-pr");
  await expect(pr).toHaveClass(/vidrio-azul/);
  await expect(pr).toHaveText("PR #4");
  await expect(pr).toHaveAttribute("href", "https://github.com/demo/panel/pull/4");
  expect((await pr.boundingBox())!.y).toBeLessThan((await page.getByTestId("tarea-titulo").boundingBox())!.y);
  await expect(page.getByRole("link", { name: "Ver PR" })).toHaveCount(0);
});

test("v2 tarea: el encabezado muestra el id, el título de 28 px y el chip de estado «Lista» en verde con ícono", async ({ page }) => {
  await abrir(page);

  await expect(page.getByTestId("tarea-ref")).toHaveText("demo/panel#3");
  await expect(page.getByTestId("tarea-titulo")).toHaveCSS("font-size", "28px");
  const estado = page.getByTestId("tarea-estado");
  await expect(estado).toContainText("Lista");
  await expect(estado.locator('[data-testid="icono-estado"][data-estado="lista"]')).toHaveCount(1);
  await expect(estado).toHaveCSS("color", "rgb(48, 209, 88)");
});

test("v2 tarea: duración, turnos y tokens son tres bloques (.tile) en la misma fila", async ({ page }) => {
  await abrir(page);

  const ys: number[] = [];
  for (const id of ["tarea-duracion", "tarea-turnos", "tarea-tokens"]) {
    const tile = page.getByTestId(id).locator("xpath=ancestor::*[contains(@class,'tile')][1]");
    await expect(tile).toHaveCount(1);
    ys.push((await tile.boundingBox())!.y);
  }
  expect(Math.max(...ys) - Math.min(...ys)).toBeLessThanOrEqual(1);
  await expect(page.getByTestId("tarea-duracion")).toContainText("3 min 15 s");
});

test("v2 tarea: el veredicto dice «Aprobó» y la verificación usa íconos, no ✓ ni ✗", async ({ page }) => {
  await abrir(page);

  await expect(page.getByTestId("veredicto")).toContainText("Aprobó");
  const pasos = page.getByTestId("verificacion-pasos");
  await expect(pasos.locator('[data-testid="icono-estado"][data-estado="lista"]')).toHaveCount(1);
  await expect(pasos.locator('[data-testid="icono-estado"][data-estado="bloqueada"]')).toHaveCount(1);
  const texto = await pasos.innerText();
  expect(texto).not.toContain("✓");
  expect(texto).not.toContain("✗");
  await expect(page.getByTestId("paso-verificacion").nth(1)).toHaveAttribute("data-ok", "false");
});

test("v2 tarea: la revisión «cambios» dice «Pidió cambios» y lista cada problema", async ({ page }) => {
  await abrir(page, { ...detalle, resultado: { ...resultado, revision: { estado: "cambios", problemas: ["falta un test"], rondas: 1 } } });

  await expect(page.getByTestId("veredicto")).toHaveText("Pidió cambios");
  await expect(page.getByTestId("problema")).toHaveText("falta un test");
});

test("v2 tarea: la nota del agente no repite el prefijo y conserva el texto", async ({ page }) => {
  await abrir(page);

  const nota = page.getByTestId("nota-agente");
  expect((await nota.innerText()).startsWith("Nota del agente:")).toBe(false);
  await expect(nota).toContainText("Solo toqué el reloj; nada más cambió.");
  await expect(page.getByRole("heading", { name: "Nota del agente" })).toBeVisible();
});

test("v2 tarea: cada resumen de eventos por etapa mide al menos 44 px de alto", async ({ page }) => {
  await abrir(page);

  const resumenes = page.locator('[data-testid="etapa-eventos"] > summary');
  await expect(resumenes).toHaveCount(2);
  for (const i of [0, 1]) {
    expect((await resumenes.nth(i).boundingBox())!.height).toBeGreaterThanOrEqual(44);
  }
  await expect(resumenes.first()).toContainText("Preparación");
});

test("v2 tarea: el botón de volver regresa a la pantalla anterior", async ({ page }) => {
  await page.goto("/#/historial");
  await expect(page.getByTestId("vista-historial")).toBeVisible();
  await abrir(page);

  await page.getByTestId("volver").click();
  await expect(page).toHaveURL(/#\/historial$/);
});
