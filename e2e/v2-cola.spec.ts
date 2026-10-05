import { expect, test } from "@playwright/test";

/**
 * Cola V2: título grande, «Actualizar» como botón redondo de vidrio y cada sección como lista agrupada.
 * Usa los fixtures (3 listas, 1 sin definir, 1 bloqueada), como cola.spec.ts.
 */

test("v2 cola: Actualizar es un botón redondo de 44 px con ícono y aria-label, y vuelve a pedir la cola", async ({ page }) => {
  let peticiones = 0;
  await page.route("**/api/cola", async (route) => {
    peticiones += 1;
    await route.continue();
  });
  await page.goto("/#/cola");
  await expect(page.getByTestId("item-cola")).toHaveCount(5);

  const actualizar = page.getByTestId("actualizar");
  await expect(actualizar).toHaveAttribute("aria-label", "Actualizar");
  await expect(actualizar.locator("svg")).toHaveCount(1);
  await expect(actualizar).toHaveCSS("border-radius", "50%");
  const caja = (await actualizar.boundingBox())!;
  expect(Math.abs(caja.width - 44)).toBeLessThanOrEqual(1);
  expect(Math.abs(caja.height - 44)).toBeLessThanOrEqual(1);

  const antes = peticiones;
  await actualizar.click();
  await expect.poll(() => peticiones).toBe(antes + 1);
});

test("v2 cola: en cada sección el título y la cantidad van en la misma fila", async ({ page }) => {
  await page.goto("/#/cola");
  await expect(page.getByTestId("item-cola")).toHaveCount(5);

  for (const seccion of ["cola-listas", "cola-sin-definir", "cola-bloqueadas"]) {
    const bloque = page.getByTestId(seccion);
    const titulo = (await bloque.locator("h2").boundingBox())!;
    const cantidad = (await bloque.getByTestId("cantidad").boundingBox())!;
    expect(Math.abs(titulo.y - cantidad.y)).toBeLessThan(6);
  }
});

test("v2 cola: cada ítem tiene el título arriba de la referencia y una flecha a la derecha", async ({ page }) => {
  await page.goto("/#/cola");
  await expect(page.getByTestId("item-cola")).toHaveCount(5);

  const item = page.getByTestId("item-cola").first();
  const titulo = (await item.locator(".item-titulo").boundingBox())!;
  const referencia = (await item.locator(".ref").boundingBox())!;
  expect(titulo.y).toBeLessThan(referencia.y);

  const flecha = item.locator("svg");
  await expect(flecha).toHaveCount(1);
  const caja = (await item.boundingBox())!;
  const cajaFlecha = (await flecha.boundingBox())!;
  expect(cajaFlecha.x).toBeGreaterThan(caja.x + caja.width / 2);
});

test("v2 cola: la lista de cada sección con ítems es un grupo de 26 px de radio", async ({ page }) => {
  await page.goto("/#/cola");
  await expect(page.getByTestId("item-cola")).toHaveCount(5);

  for (const seccion of ["cola-listas", "cola-sin-definir", "cola-bloqueadas"]) {
    const lista = page.getByTestId(seccion).locator("ul");
    expect(await lista.evaluate((el) => el.tagName)).toBe("UL");
    await expect(lista).toHaveClass(/grupo/);
    await expect(lista).toHaveCSS("border-radius", "26px");
  }
});
