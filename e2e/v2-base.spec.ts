import { expect, test } from "@playwright/test";

/**
 * Base visual V2 (iOS 26 / Liquid Glass, solo oscuro): colores de sistema, tipografía de títulos grandes,
 * tarjetas redondeadas y botones de vidrio. Usa los fixtures (como historial.spec.ts) y no escribe nada.
 */

test("v2: el panel es solo oscuro, aun si el sistema pide tema claro", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/#/historial");
  await expect(page.getByTestId("vista-historial")).toBeVisible();

  await expect(page.locator("body")).toHaveCSS("background-color", "rgb(0, 0, 0)");
  const tarjeta = page.locator(".tarjeta:visible").first();
  await expect(tarjeta).toHaveCSS("background-color", "rgb(28, 28, 30)");
  await expect(tarjeta).toHaveCSS("border-radius", "26px");
});

test("v2: el título de la vista es grande (34 px, negrita)", async ({ page }) => {
  await page.goto("/#/historial");

  const titulo = page.getByTestId("vista-historial").locator("h1");
  await expect(titulo).toHaveCSS("font-size", "34px");
  await expect(titulo).toHaveCSS("font-weight", "700");
});

test("v2: el botón Actualizar de la cola es una cápsula de vidrio", async ({ page }) => {
  await page.goto("/#/cola");

  const boton = page.getByTestId("actualizar");
  await expect(boton).toBeVisible();
  const radio = await boton.evaluate((el) => parseFloat(getComputedStyle(el).borderTopLeftRadius));
  expect(radio).toBeGreaterThanOrEqual(22);
  const filtro = await boton.evaluate((el) => {
    const estilo = getComputedStyle(el);
    return estilo.backdropFilter || estilo.getPropertyValue("-webkit-backdrop-filter");
  });
  expect(filtro).toContain("blur(24px)");
});

test("v2: una cápsula de vidrio amarilla o azul conserva su color (.capsula no lo pisa)", async ({ page }) => {
  await page.goto("/#/cola");
  await expect(page.getByTestId("actualizar")).toBeVisible();

  const colores = await page.evaluate(() => {
    const leer = (clases: string) => {
      const el = document.createElement("button");
      el.className = clases;
      document.body.append(el);
      const color = getComputedStyle(el).color;
      el.remove();
      return color;
    };
    return { amarillo: leer("capsula vidrio-amarillo"), azul: leer("capsula vidrio-azul"), normal: leer("capsula vidrio") };
  });
  expect(colores).toEqual({ amarillo: "rgb(255, 214, 10)", azul: "rgb(10, 132, 255)", normal: "rgb(255, 255, 255)" });
});
