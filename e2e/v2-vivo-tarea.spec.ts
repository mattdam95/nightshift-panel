import { expect, test, type Page } from "@playwright/test";
import type { EstadoPc, SnapshotVivo } from "../src/contrato/api.js";
import { estadoInicial, type TareaVivo } from "../src/contrato/vivo.js";

/**
 * En vivo V2 (parte 2): la tarjeta de la tarea en curso (etapas en segmentos, números en bloques,
 * verificación y herramientas como listas agrupadas). El snapshot de `/api/vivo` se simula con
 * `page.route` y el stream se corta, como en vivo-colapsables.spec.ts.
 */

const estadoPc: EstadoPc = {
  ts: "2026-09-27T02:00:00Z",
  corriendo: true,
  pausado: false,
  actual: null,
  ultimaNoche: "2026-09-27",
};

const tareaBase: TareaVivo = {
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

async function cargarVivo(page: Page, cambios: Partial<TareaVivo> = {}): Promise<void> {
  const snapshot: SnapshotVivo = {
    vivo: {
      ...estadoInicial(),
      noche: { inicio: "2026-09-27T01:00:00.000Z", hasta: null, activa: true },
      tarea: { ...tareaBase, ...cambios },
    },
    pc: "conectada",
    estadoPc,
    ultimoId: null,
  };
  await page.route("**/api/vivo", (route) => route.fulfill({ status: 200, contentType: "application/json", json: snapshot }));
  await page.route("**/api/stream*", (route) => route.abort());
  await page.goto("/#/vivo");
  await expect(page.getByTestId("estado-conexion")).toHaveAttribute("data-pc", "conectada");
}

test("v2 tarea: las etapas son segmentos de 6 px, con la actual en amarillo y el paso escrito debajo", async ({ page }) => {
  await cargarVivo(page);

  const actual = page.getByTestId("etapa-actual");
  await expect(actual).toHaveText("implementación");
  await expect(actual).toHaveCSS("background-color", "rgb(255, 214, 10)");
  expect((await actual.boundingBox())!.height).toBeGreaterThanOrEqual(5);
  expect((await actual.boundingBox())!.height).toBeLessThanOrEqual(7);
  await expect(page.getByTestId("etapa-paso")).toHaveText("Implementación · paso 3 de 6");

  const hechas = page.locator("li.hecha");
  await expect(hechas).toHaveCount(2);
  await expect(hechas.first()).toHaveCSS("background-color", "rgb(48, 209, 88)");
  await expect(hechas.nth(1)).toHaveCSS("background-color", "rgb(48, 209, 88)");
});

test("v2 tarea: Turnos con presupuesto muestra una barra de progreso", async ({ page }) => {
  await cargarVivo(page, { turnos: 20, presupuesto: { maxHoras: 1, maxTurnos: 80, prioridad: "media", fase: "unica" } });

  await expect(page.getByTestId("turnos")).toContainText("20 / 80");
  await expect(page.getByTestId("turnos-barra")).toHaveAttribute("aria-valuenow", "25");
});

test("v2 tarea: la verificación usa íconos de estado, no ✓ ni ✗", async ({ page }) => {
  await cargarVivo(page, {
    verificacion: [
      { comando: "pnpm lint", ok: true },
      { comando: "pnpm test", ok: false },
    ],
  });

  const verificacion = page.getByTestId("verificacion");
  await expect(verificacion.locator('[data-testid="icono-estado"][data-estado="lista"]')).toHaveCount(1);
  await expect(verificacion.locator('[data-testid="icono-estado"][data-estado="bloqueada"]')).toHaveCount(1);
  const texto = await verificacion.innerText();
  expect(texto).not.toContain("✓");
  expect(texto).not.toContain("✗");
  expect(texto).toContain("pnpm lint");

  // El comando va pegado al ícono (a la izquierda), no empujado al borde derecho de la fila.
  const icono = (await verificacion.locator('[data-testid="icono-estado"]').first().boundingBox())!;
  const comando = (await verificacion.locator(".comando").first().boundingBox())!;
  expect(comando.x - (icono.x + icono.width)).toBeLessThan(24);
});

test("v2 tarea: las herramientas muestran la cantidad aparte y cada una en dos líneas", async ({ page }) => {
  await cargarVivo(page);

  await expect(page.getByTestId("herramientas-cantidad")).toHaveText("2");
  await page.locator('[data-testid="herramientas"] > summary').click();

  const primera = page.getByTestId("herramienta").first();
  await expect(primera).toBeVisible();
  const lineas = primera.locator("> span");
  await expect(lineas).toHaveCount(2);
  await expect(lineas.first()).toContainText("bash");
  await expect(lineas.first()).toContainText(/\d{2}:\d{2}/);
  await expect(lineas.nth(1)).toContainText("pnpm test");
  const y0 = (await lineas.first().boundingBox())!.y;
  const y1 = (await lineas.nth(1).boundingBox())!.y;
  expect(y1).toBeGreaterThan(y0);
});
