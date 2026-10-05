import { expect, test } from "@playwright/test";

/**
 * Línea de tiempo de la noche por tarea (V2). De solo lectura: usa los fixtures y no escribe nada.
 *
 * 2026-09-27: `demo/panel#3` con 6 franjas (la revisión en la Mac) y `demo/panel#5` con 3.
 * 2026-09-26: `demo/panel#1` con 2 (preparación y entrega).
 */

test("v2 noche: una fila por tarea, con sus segmentos; solo la revisión de #3 corrió en la Mac", async ({ page }) => {
  await page.goto("/#/noche/2026-09-27");
  await expect(page.getByTestId("vista-noche")).toBeVisible();
  await expect(page.getByTestId("resultado")).toHaveCount(1);

  const filas = page.getByTestId("fila-tarea");
  await expect(filas).toHaveCount(2);
  await expect(filas.first()).toHaveAttribute("data-tarea", "demo/panel#3");
  await expect(filas.first().getByTestId("segmento")).toHaveCount(6);
  await expect(filas.nth(1).getByTestId("segmento")).toHaveCount(3);

  const mac = page.locator('[data-testid="segmento"][data-maquina="mac"]');
  await expect(mac).toHaveCount(1);
  await expect(mac).toHaveAttribute("data-etapa", "revision");
});

test("v2 noche: la tarjeta va arriba de los resultados, con 6 etapas en la leyenda y 5 marcas HH:MM", async ({ page }) => {
  await page.goto("/#/noche/2026-09-27");
  await expect(page.getByTestId("resultado")).toHaveCount(1);

  const orden = await page.evaluate(() => {
    const linea = document.querySelector('[data-testid="linea-tiempo"]');
    const lista = document.querySelector("ul.resultados");
    return linea && lista ? lista.compareDocumentPosition(linea) & Node.DOCUMENT_POSITION_PRECEDING : 0;
  });
  expect(orden).toBe(2);

  await expect(page.getByTestId("leyenda-etapa")).toHaveCount(6);
  const marcas = page.getByTestId("marca-tiempo");
  await expect(marcas).toHaveCount(5);
  for (const texto of await marcas.allTextContents()) expect(texto).toMatch(/^\d{2}:\d{2}$/);
});

test("v2 noche: el desglose de #3 incluye la revisión de la Mac y nombra las etapas con mayúscula", async ({ page }) => {
  await page.goto("/#/noche/2026-09-27");

  const desglose = page.getByTestId("fila-tarea").first().getByTestId("desglose");
  await expect(desglose).toContainText("Revisión (Mac)");
  await expect(desglose).toContainText("10 s");
});

test("v2 noche: tocar el enlace de la fila de #3 lleva al detalle de la tarea", async ({ page }) => {
  await page.goto("/#/noche/2026-09-27");

  const enlace = page.getByTestId("fila-tarea").first().getByTestId("fila-tarea-enlace");
  await expect(enlace).toHaveAttribute("href", "#/tarea/demo/panel/3");
  await enlace.click();
  await expect(page).toHaveURL(/#\/tarea\/demo\/panel\/3$/);
});

test("v2 noche: cada segmento tiene un title con la tarea, la etapa, la duración y la máquina", async ({ page }) => {
  await page.goto("/#/noche/2026-09-27");

  const segmentos = page.getByTestId("segmento");
  await expect(segmentos).toHaveCount(9);
  const titulos = await segmentos.evaluateAll((els) => els.map((e) => e.getAttribute("title") ?? ""));
  for (const titulo of titulos) expect(titulo).toMatch(/^#\d+ · .+ · \d+ (s|min).* · (PC|Mac)$/);
  const revision = titulos.find((t) => t.includes("revisión"));
  expect(revision).toBe("#3 · revisión · 10 s · Mac");
});

test("v2 noche 2026-09-26: una fila con 2 segmentos, y el resultado y el reporte se siguen viendo", async ({ page }) => {
  await page.goto("/#/noche/2026-09-26");
  await expect(page.getByTestId("vista-noche")).toBeVisible();
  await expect(page.getByTestId("resultado")).toHaveCount(1);

  await expect(page.getByTestId("fila-tarea")).toHaveCount(1);
  await expect(page.getByTestId("fila-tarea").getByTestId("segmento")).toHaveCount(2);

  await expect(page.getByTestId("ver-reporte")).toBeVisible();
  await page.getByTestId("ver-reporte").click();
  await expect(page.getByTestId("reporte")).toContainText("# Noche del 2026-09-26");
});

test("v2 noche con el revisor en la PC (desde el 2026-10-04): ningún segmento es de la Mac", async ({ page }) => {
  // Mismos eventos del fixture, pero con la revisión registrada como `pc` (REVISOR_MAQUINA=pc en nightshift).
  await page.route("**/api/noches/2026-09-27/eventos", async (route) => {
    const original = await route.fetch();
    const eventos = ((await original.json()) as { maquina: string }[]).map((e) => ({ ...e, maquina: "pc" }));
    await route.fulfill({ json: eventos });
  });
  await page.goto("/#/noche/2026-09-27");
  await expect(page.getByTestId("linea-tiempo")).toBeVisible();

  await expect(page.locator('[data-testid="segmento"][data-maquina="mac"]')).toHaveCount(0);
  await expect(page.locator('[data-testid="segmento"][data-etapa="revision"]')).toHaveCount(1);
  await expect(page.getByTestId("desglose").first()).not.toContainText("(Mac)");
});

test("v2 noche: a ancho de iPhone no hay scroll horizontal", async ({ page }) => {
  const ancho = page.viewportSize()!.width;
  await page.goto("/#/noche/2026-09-27");
  await expect(page.getByTestId("segmento")).toHaveCount(9);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(ancho);
});
