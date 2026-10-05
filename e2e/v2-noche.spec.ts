import { expect, test } from "@playwright/test";

/**
 * Noche V2: encabezado con botón de volver y fecha larga, resultados como lista agrupada y «Ver reporte»
 * a lo ancho. Usa los fixtures: 2026-09-27 está abierta (fin null, 1 tarea lista con PR) y 2026-09-26 cerrada
 * (1 tarea bloqueada con pregunta y reporte).
 */

test("v2 noche (abierta): el h1 es la fecha larga, el subtítulo termina en «· En curso» y volver lleva al historial", async ({ page }) => {
  await page.goto("/#/noche/2026-09-27");
  await expect(page.getByTestId("resultado")).toHaveCount(1);

  await expect(page.getByTestId("vista-noche").locator("h1")).toHaveText("Domingo 27 sep");
  const subtitulo = page.getByTestId("subtitulo-noche");
  await expect(subtitulo).toContainText("1 tarea");
  await expect(subtitulo).toHaveText(/ · En curso$/);

  const volver = page.getByTestId("volver");
  await expect(volver).toHaveAttribute("aria-label", "Volver al historial");
  await volver.click();
  await expect(page).toHaveURL(/#\/historial$/);
});

test("v2 noche (cerrada): el subtítulo dice «1 tarea» y no «En curso»", async ({ page }) => {
  await page.goto("/#/noche/2026-09-26");
  await expect(page.getByTestId("resultado")).toHaveCount(1);

  const subtitulo = page.getByTestId("subtitulo-noche");
  await expect(subtitulo).toContainText("1 tarea");
  await expect(subtitulo).not.toContainText("En curso");
  await expect(subtitulo).toHaveText(/^\d{2}:\d{2} a \d{2}:\d{2} · 1 tarea$/);
});

test("v2 noche: los resultados son un ul.grupo y cada uno lleva un ícono de estado de 24 px", async ({ page }) => {
  await page.goto("/#/noche/2026-09-27");
  await expect(page.getByTestId("resultado")).toHaveCount(1);

  const lista = page.locator("ul.grupo").filter({ has: page.getByTestId("resultado") });
  await expect(lista).toHaveCount(1);
  const icono = page.getByTestId("resultado").getByTestId("icono-estado");
  await expect(icono).toHaveCount(1);
  expect(Math.abs((await icono.boundingBox())!.width - 24)).toBeLessThanOrEqual(1);
});

test("v2 noche: «Ver PR» es una cápsula de vidrio azul con ícono", async ({ page }) => {
  await page.goto("/#/noche/2026-09-27");

  const pr = page.getByTestId("link-pr");
  await expect(pr).toHaveClass(/vidrio-azul/);
  await expect(pr.locator("svg")).toHaveCount(1);
  await expect(pr).toHaveText("Ver PR");
  await expect(pr).toHaveCSS("color", "rgb(10, 132, 255)");
});

test("v2 noche: «Ver reporte» ocupa todo el ancho de la vista y sigue mostrando el reporte", async ({ page }) => {
  await page.goto("/#/noche/2026-09-26");

  const boton = page.getByTestId("ver-reporte");
  await expect(boton).toBeVisible();
  const vista = (await page.getByTestId("vista-noche").boundingBox())!;
  const caja = (await boton.boundingBox())!;
  expect(Math.abs(caja.width - vista.width)).toBeLessThanOrEqual(2);

  await boton.click();
  await expect(page.getByTestId("reporte")).toContainText("# Noche del 2026-09-26");
});
