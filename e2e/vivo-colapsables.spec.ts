import { expect, test, type Page } from "@playwright/test";
import type { EstadoPc, SnapshotVivo } from "../src/contrato/api.js";
import { estadoInicial, type TareaVivo } from "../src/contrato/vivo.js";

/**
 * Aceptación de las secciones colapsables de En vivo: la tarjeta de la tarea en curso (abierta por
 * defecto) y su lista de herramientas (cerrada por defecto).
 *
 * El snapshot de `/api/vivo` se simula con `page.route` y el stream se corta, como en acciones.spec.ts.
 */

const estadoPc: EstadoPc = {
  ts: "2026-09-27T02:00:00Z",
  corriendo: true,
  pausado: false,
  actual: null,
  ultimaNoche: "2026-09-27",
};

const tarea: TareaVivo = {
  id: "demo/panel#5",
  titulo: "Reloj de la noche",
  rama: null,
  inicio: "2026-09-27T01:00:00.000Z",
  etapa: "implementacion",
  maquina: "pc",
  presupuesto: null,
  ronda: 1,
  turnos: 3,
  tokens: 500,
  herramientas: [
    { ts: "2026-09-27T01:01:00.000Z", etapa: "implementacion", nombre: "edit", resumen: "web/src/a.ts", error: false },
    { ts: "2026-09-27T01:02:00.000Z", etapa: "implementacion", nombre: "bash", resumen: "pnpm test", error: false },
  ],
  verificacion: [],
  revision: null,
  pr: null,
};

const snapshot: SnapshotVivo = {
  vivo: {
    ...estadoInicial(),
    noche: { inicio: "2026-09-27T01:00:00.000Z", hasta: null, activa: true },
    tarea,
  },
  pc: "conectada",
  estadoPc,
  ultimoId: null,
};

async function cargarVivo(page: Page): Promise<void> {
  await page.route("**/api/vivo", (route) => route.fulfill({ status: 200, contentType: "application/json", json: snapshot }));
  await page.route("**/api/stream*", (route) => route.abort());
  await page.goto("/#/vivo");
  await expect(page.getByTestId("estado-conexion")).toHaveAttribute("data-pc", "conectada");
}

test("colapsables: la tarjeta de la tarea en curso es un <details> y arranca abierta", async ({ page }) => {
  await cargarVivo(page);

  const tarjeta = page.getByTestId("tarea-en-curso");
  expect(await tarjeta.evaluate((el) => el.tagName)).toBe("DETAILS");
  await expect(tarjeta).toHaveAttribute("open", "");
  await expect(page.getByTestId("etapa-actual")).toBeVisible();
  await expect(page.getByTestId("etapa-actual")).toContainText("implementación");
});

test("colapsables: tocar el resumen pliega la tarjeta y deja el id y la máquina a la vista; otro toque la abre", async ({ page }) => {
  await cargarVivo(page);

  const tarjeta = page.getByTestId("tarea-en-curso");
  const resumen = page.locator('[data-testid="tarea-en-curso"] > summary');

  await resumen.click();
  await expect(tarjeta).not.toHaveAttribute("open", /.*/);
  await expect(page.getByTestId("etapa-actual")).toBeHidden();
  await expect(page.getByTestId("tarea-id")).toBeVisible();
  await expect(page.getByTestId("tarea-maquina")).toBeVisible();

  await resumen.click();
  await expect(tarjeta).toHaveAttribute("open", "");
  await expect(page.getByTestId("etapa-actual")).toBeVisible();
});

test("colapsables: las herramientas arrancan cerradas, con el conteo en el resumen", async ({ page }) => {
  await cargarVivo(page);

  const herramientas = page.getByTestId("herramientas");
  await expect(herramientas).not.toHaveAttribute("open", /.*/);
  await expect(page.getByTestId("herramienta")).toHaveCount(2);
  await expect(page.getByTestId("herramienta").first()).not.toBeVisible();
  await expect(page.locator('[data-testid="herramientas"] > summary')).toHaveText("Herramientas (2)");
});

test("colapsables: tocar el resumen de herramientas muestra las dos", async ({ page }) => {
  await cargarVivo(page);

  await page.locator('[data-testid="herramientas"] > summary').click();

  await expect(page.getByTestId("herramienta").first()).toBeVisible();
  await expect(page.getByTestId("herramienta").nth(1)).toBeVisible();
});

test("colapsables: los dos resúmenes miden al menos 44 px de alto", async ({ page }) => {
  await cargarVivo(page);

  for (const resumen of [
    page.locator('[data-testid="tarea-en-curso"] > summary'),
    page.locator('[data-testid="herramientas"] > summary'),
  ]) {
    await expect(resumen).toBeVisible();
    expect((await resumen.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
  }
});
