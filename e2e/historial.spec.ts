import { expect, test } from "@playwright/test";

/**
 * Aceptación de las vistas `#/historial` y `#/noche/<fecha>` (spec: Vista Historial).
 *
 * De solo lectura: no escribe en `.e2e/` (comparte server y datos con `vivo.spec.ts`).
 * Navega desde `#/historial` con los fixtures: la noche 2026-09-27 está abierta (fin null,
 * 1 tarea lista con PR) y la 2026-09-26 está cerrada (1 tarea bloqueada con pregunta y reporte).
 */

test("historial: lista una fila por noche, la más nueva primero", async ({ page }) => {
  await page.goto("/#/historial");
  await expect(page.getByTestId("vista-historial")).toBeVisible();

  const filas = page.getByTestId("noche");
  await expect(filas).toHaveCount(2);
  await expect(filas.first()).toContainText("2026-09-27");
  await expect(filas.nth(1)).toContainText("2026-09-26");
});

test("historial: cada fila muestra la fecha, la cantidad de tareas y un ícono por estado", async ({ page }) => {
  await page.goto("/#/historial");
  const filas = page.getByTestId("noche");

  // 2026-09-27: una tarea en estado lista.
  await expect(filas.first()).toContainText("2026-09-27");
  await expect(filas.first()).toContainText("1 tarea");
  await expect(filas.first().locator('[data-testid="icono-estado"][data-estado="lista"]')).toHaveCount(1);

  // 2026-09-26: una tarea en estado bloqueada.
  await expect(filas.nth(1)).toContainText("2026-09-26");
  await expect(filas.nth(1)).toContainText("1 tarea");
  await expect(filas.nth(1).locator('[data-testid="icono-estado"][data-estado="bloqueada"]')).toHaveCount(1);
});

test("historial: la noche sin fin (en curso) se marca con noche-en-curso", async ({ page }) => {
  await page.goto("/#/historial");

  // Con los fixtures aparece exactamente una vez.
  await expect(page.getByTestId("noche-en-curso")).toHaveCount(1);

  // Y está en la fila de la 2026-09-27 (fin null), no en la de la 26.
  await expect(page.getByTestId("noche").first().getByTestId("noche-en-curso")).toHaveCount(1);
  await expect(page.getByTestId("noche").nth(1).getByTestId("noche-en-curso")).toHaveCount(0);
});

test("historial: cada fila es un enlace a esa noche", async ({ page }) => {
  await page.goto("/#/historial");
  const filas = page.getByTestId("noche");

  await expect(filas.first()).toHaveAttribute("href", "#/noche/2026-09-27");
  await expect(filas.nth(1)).toHaveAttribute("href", "#/noche/2026-09-26");

  await filas.first().click();
  await expect(page).toHaveURL(/#\/noche\/2026-09-27$/);
});

test("noche: lista cada tarea con ícono de estado, título, duración, turnos y tokens", async ({ page }) => {
  await page.goto("/#/historial");
  await page.getByTestId("noche").nth(1).click(); // la 2026-09-26
  await expect(page).toHaveURL(/#\/noche\/2026-09-26$/);
  await expect(page.getByTestId("vista-noche")).toBeVisible();

  const resultado = page.getByTestId("resultado");
  await expect(resultado).toHaveCount(1);
  await expect(resultado).toContainText("Esqueleto");
  await expect(resultado.locator('[data-testid="icono-estado"][data-estado="bloqueada"]')).toHaveCount(1);
  await expect(resultado).toContainText("25 min"); // duracion(Date.parse(fin) - Date.parse(inicio))
  await expect(resultado).toContainText(/\b5\b/); // turnos
  await expect(resultado).toContainText(/1[.,]?110/); // tokens
});

test("noche: el resultado con PR muestra link-pr; el que no, no", async ({ page }) => {
  await page.goto("/#/noche/2026-09-27");
  const link = page.getByTestId("link-pr");
  await expect(link).toHaveCount(1);
  await expect(link).toHaveAttribute("href", "https://github.com/demo/panel/pull/4");

  await page.goto("/#/noche/2026-09-26");
  await expect(page.getByTestId("link-pr")).toHaveCount(0);
});

test("noche: el resultado bloqueado muestra la pregunta", async ({ page }) => {
  await page.goto("/#/noche/2026-09-26");
  await expect(page.getByTestId("pregunta")).toHaveText("¿Puedo tocar package.json?");
});

test("noche: si hay reporte, el botón lo pide y lo muestra como texto", async ({ page }) => {
  await page.goto("/#/noche/2026-09-26");
  await expect(page.getByTestId("ver-reporte")).toBeVisible();
  await page.getByTestId("ver-reporte").click();
  await expect(page.getByTestId("reporte")).toContainText("# Noche del 2026-09-26");

  // La 2026-09-27 no tiene reporte: ni botón ni pre.
  await page.goto("/#/noche/2026-09-27");
  await expect(page.getByTestId("ver-reporte")).toHaveCount(0);
  await expect(page.getByTestId("reporte")).toHaveCount(0);
});

test("noche: una noche inexistente muestra el error del server", async ({ page }) => {
  await page.goto("/#/noche/2020-01-01");
  await expect(page.getByTestId("error")).toContainText("no existe esa noche");
});

test("historial y noche caben en el ancho del iPhone sin scroll horizontal", async ({ page }) => {
  const ancho = page.viewportSize()!.width;

  await page.goto("/#/historial");
  await expect(page.getByTestId("noche")).toHaveCount(2);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(ancho);

  await page.goto("/#/noche/2026-09-26");
  await expect(page.getByTestId("resultado")).toHaveCount(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(ancho);
});

// --- Manejo de error del pedido del reporte (issue: el botón Ver reporte falla en silencio) ---

const RUTA_REPORTE = "**/api/noches/2026-09-26/reporte";

test("noche: si el pedido del reporte no sale bien (500), muestra error-reporte y no el reporte", async ({ page }) => {
  await page.route(RUTA_REPORTE, (route) => route.fulfill({ status: 500 }));

  await page.goto("/#/noche/2026-09-26");
  await expect(page.getByTestId("ver-reporte")).toBeVisible();
  await page.getByTestId("ver-reporte").click();

  const error = page.getByTestId("error-reporte");
  await expect(error).toBeVisible();
  await expect(error).toContainText(/no se pudo traer el reporte/i);

  // En el caso de error no aparece el reporte.
  await expect(page.getByTestId("reporte")).toHaveCount(0);
});

test("noche: si el pedido del reporte tira (red caída), muestra error-reporte y no el reporte", async ({ page }) => {
  await page.route(RUTA_REPORTE, (route) => route.abort());

  await page.goto("/#/noche/2026-09-26");
  await expect(page.getByTestId("ver-reporte")).toBeVisible();
  await page.getByTestId("ver-reporte").click();

  const error = page.getByTestId("error-reporte");
  await expect(error).toBeVisible();
  await expect(error).toContainText(/no se pudo traer el reporte/i);
  await expect(page.getByTestId("reporte")).toHaveCount(0);
});

test("noche: reintentar el reporte: si después del error el pedido anda, aparece el reporte y se va el error", async ({ page }) => {
  await page.route(RUTA_REPORTE, (route) => route.fulfill({ status: 500 }));

  await page.goto("/#/noche/2026-09-26");
  await expect(page.getByTestId("ver-reporte")).toBeVisible();

  // Primera vez: el pedido falla y aparece el error.
  await page.getByTestId("ver-reporte").click();
  await expect(page.getByTestId("error-reporte")).toBeVisible();
  await expect(page.getByTestId("reporte")).toHaveCount(0);

  // El pedido vuelve a andar y se toca el botón de nuevo.
  await page.unroute(RUTA_REPORTE);
  await page.getByTestId("ver-reporte").click();

  await expect(page.getByTestId("reporte")).toContainText("# Noche del 2026-09-26");
  await expect(page.getByTestId("error-reporte")).toHaveCount(0);
});
