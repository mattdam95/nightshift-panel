import { expect, test } from "@playwright/test";

/**
 * Navegación V2: barra de pestañas flotante de vidrio (absolute dentro de `.app`, sin `fixed`) y
 * barra de conexión como cápsula. Usa los fixtures y no escribe nada.
 */

const NAV = 'nav[aria-label="Secciones"]';

test("v2 navegación: la barra de pestañas es una cápsula de vidrio absoluta, a 16 px de cada costado", async ({ page }) => {
  await page.goto("/#/historial");
  await expect(page.getByTestId("vista-historial")).toBeVisible();

  const nav = page.locator(NAV);
  await expect(nav).toHaveCSS("position", "absolute");
  const radio = await nav.evaluate((el) => parseFloat(getComputedStyle(el).borderTopLeftRadius));
  expect(radio).toBeGreaterThanOrEqual(32);
  const filtro = await nav.evaluate((el) => getComputedStyle(el).backdropFilter);
  expect(filtro).toContain("blur(24px)");

  const caja = (await nav.boundingBox())!;
  const ancho = page.viewportSize()!.width;
  expect(Math.abs(caja.x - 16)).toBeLessThanOrEqual(1);
  expect(Math.abs(ancho - (caja.x + caja.width) - 16)).toBeLessThanOrEqual(1);
});

test("v2 navegación: al scrollear hasta el final, el último elemento queda por arriba de la barra", async ({ page }) => {
  await page.goto("/#/historial");
  await expect(page.getByTestId("vista-historial")).toBeVisible();
  // Un separador alto antes de la vista hace que `contenido` tenga de verdad qué scrollear.
  await page.addStyleTag({ content: "main::before { content: ''; display: block; height: 2000px; }" });

  await page.getByTestId("contenido").evaluate((el) => {
    el.scrollTop = el.scrollHeight;
  });

  const ultimo = (await page.getByTestId("noche").last().boundingBox())!;
  const nav = (await page.locator(NAV).boundingBox())!;
  expect(ultimo.y + ultimo.height).toBeLessThanOrEqual(nav.y);
});

test("v2 navegación: la pestaña activa va en amarillo con fondo; las demás en blanco y sin fondo", async ({ page }) => {
  await page.goto("/#/historial");
  await expect(page.getByTestId("vista-historial")).toBeVisible();

  const activa = page.getByTestId("pestana-historial");
  await expect(activa).toHaveCSS("color", "rgb(255, 214, 10)");
  await expect(activa).not.toHaveCSS("background-color", "rgba(0, 0, 0, 0)");

  for (const vista of ["vivo", "cola", "maquinas"]) {
    const otra = page.getByTestId(`pestana-${vista}`);
    await expect(otra).toHaveCSS("color", "rgb(255, 255, 255)");
    await expect(otra).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  }
});

test("v2 navegación: la barra de conexión tiene una cápsula y conserva sus atributos", async ({ page }) => {
  await page.goto("/#/historial");

  const conexion = page.getByTestId("estado-conexion");
  await expect(conexion).toHaveAttribute("data-stream", /.+/);
  await expect(conexion).toHaveAttribute("data-pc", /.+/);
  const capsula = conexion.locator(".conexion-capsula");
  await expect(capsula).toHaveCount(1);
  const radio = await capsula.evaluate((el) => parseFloat(getComputedStyle(el).borderTopLeftRadius));
  expect(radio).toBeGreaterThanOrEqual(18);
});
