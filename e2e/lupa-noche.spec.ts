import { expect, test, type Page } from "@playwright/test";

/**
 * Lupa al mantener el dedo sobre la línea de tiempo por tarea (Noche). El proyecto `iphone` acepta
 * `page.mouse` (dispara pointer events de tipo mouse). La primera fila de `#/noche/2026-09-27` es
 * `demo/panel#3`; su pista ocupa del ~8 % al ~81 % del eje de la noche, así que el 50 % cae en una etapa
 * y el 95 % cae en un hueco (queda elegida la etapa más cercana).
 */

const HORAS = /\d{2}:\d{2}:\d{2} → \d{2}:\d{2}:\d{2} · (PC|Mac)/;

async function abrirYMedir(page: Page) {
  await page.goto("/#/noche/2026-09-27");
  await expect(page.getByTestId("segmento")).toHaveCount(9);
  const caja = (await page.getByTestId("pista-tarea").first().boundingBox())!;
  return { x: (pct: number) => caja.x + (caja.width * pct) / 100, y: caja.y + caja.height / 2 };
}

test("lupa: mantener 400 ms en el centro de la pista muestra la lupa, el cursor y la etapa con sus horas", async ({ page }) => {
  const p = await abrirYMedir(page);

  await page.mouse.move(p.x(50), p.y);
  await page.mouse.down();
  await page.waitForTimeout(400);

  await expect(page.getByTestId("lupa")).toBeVisible();
  await expect(page.getByTestId("cursor-lupa")).toBeVisible();
  await expect(page.getByTestId("lupa-etiqueta")).not.toBeEmpty();
  await expect(page.getByTestId("lupa-horas")).toHaveText(HORAS);
  await page.mouse.up();
});

test("lupa: con la lupa abierta, deslizar al 95 % cambia las horas", async ({ page }) => {
  const p = await abrirYMedir(page);

  await page.mouse.move(p.x(50), p.y);
  await page.mouse.down();
  await page.waitForTimeout(400);
  const antes = await page.getByTestId("lupa-horas").textContent();

  await page.mouse.move(p.x(95), p.y, { steps: 5 });
  await expect(page.getByTestId("lupa-horas")).not.toHaveText(antes!);
  await page.mouse.up();
});

test("lupa: al soltar se cierra, queda elegida una sola etapa y «Ver tarea» lleva a la tarea", async ({ page }) => {
  const p = await abrirYMedir(page);

  await page.mouse.move(p.x(50), p.y);
  await page.mouse.down();
  await page.waitForTimeout(400);
  await page.mouse.up();

  await expect(page.getByTestId("lupa")).toHaveCount(0);
  await expect(page.getByTestId("seleccion")).toBeVisible();
  await expect(page.locator('[data-testid="segmento"][data-seleccionado="true"]')).toHaveCount(1);

  const ver = page.getByTestId("seleccion-ver-tarea");
  await expect(ver).toHaveAttribute("href", "#/tarea/demo/panel/3");
  await ver.click();
  await expect(page).toHaveURL(/#\/tarea\/demo\/panel\/3$/);
});

test("lupa: un toque corto no muestra la lupa pero sí elige la etapa", async ({ page }) => {
  const p = await abrirYMedir(page);

  await page.mouse.move(p.x(50), p.y);
  await page.mouse.down();
  await page.mouse.up();

  await expect(page.getByTestId("seleccion")).toBeVisible();
  await expect(page.getByTestId("lupa")).toHaveCount(0);
  await expect(page.locator('[data-testid="segmento"][data-seleccionado="true"]')).toHaveCount(1);
});

test("lupa: bajar y moverse 40 px antes de los 250 ms cancela (es un arrastre): ni lupa ni selección", async ({ page }) => {
  const p = await abrirYMedir(page);

  await page.mouse.move(p.x(50), p.y);
  await page.mouse.down();
  await page.mouse.move(p.x(50) + 40, p.y);
  await page.waitForTimeout(400);
  await expect(page.getByTestId("lupa")).toHaveCount(0);
  await page.mouse.up();

  await expect(page.getByTestId("lupa")).toHaveCount(0);
  await expect(page.getByTestId("seleccion")).toHaveCount(0);
});

test("lupa: elegir otra etapa reemplaza la selección anterior", async ({ page }) => {
  const p = await abrirYMedir(page);

  await page.mouse.move(p.x(25), p.y);
  await page.mouse.down();
  await page.mouse.up();
  const primera = await page.getByTestId("seleccion").textContent();

  await page.mouse.move(p.x(70), p.y);
  await page.mouse.down();
  await page.mouse.up();

  await expect(page.locator('[data-testid="segmento"][data-seleccionado="true"]')).toHaveCount(1);
  await expect(page.getByTestId("seleccion")).toHaveCount(1);
  await expect(page.getByTestId("seleccion")).not.toHaveText(primera!);
});

test("lupa: el texto de ayuda explica el gesto", async ({ page }) => {
  await abrirYMedir(page);

  await expect(page.getByTestId("linea-tiempo")).toContainText("Mantené el dedo sobre una fila para ampliarla");
});
