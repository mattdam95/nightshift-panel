import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

/**
 * Aceptación del layout en iPhone (spec: barra de pestañas pegada abajo, barra de conexión
 * nítida e íconos SVG). Corre en el proyecto `iphone` (Chromium con iPhone 15).
 *
 * El historial con los fixtures es corto, así que se le da `min-height: 2000px` a `main`
 * para que `contenido` tenga de verdad qué scrollear.
 */

const CARACTERES_VIEJOS = ["●", "☰", "◷", "▣"];

async function bordeAbajoDeLaBarra(page: Page): Promise<number> {
  const caja = await page.locator('nav[aria-label="Secciones"]').boundingBox();
  if (!caja) throw new Error("la barra de pestañas no tiene caja visible");
  return caja.y + caja.height;
}

async function abrirHistorialLargo(page: Page): Promise<void> {
  await page.goto("/#/historial");
  await expect(page.getByTestId("vista-historial")).toBeVisible();
  await page.addStyleTag({ content: "main { min-height: 2000px; }" });
}

test("la barra de pestañas queda pegada abajo, antes y después del scroll del contenido", async ({ page }) => {
  await abrirHistorialLargo(page);
  const alto = page.viewportSize()!.height;

  // Antes de scrollear: el borde de abajo de la barra coincide con el alto del viewport.
  expect(Math.abs((await bordeAbajoDeLaBarra(page)) - alto)).toBeLessThanOrEqual(1);

  // Después de scrollear `contenido` hasta el final: sigue pegada abajo.
  await page.getByTestId("contenido").evaluate((el) => {
    el.scrollTop = el.scrollHeight;
  });
  expect(Math.abs((await bordeAbajoDeLaBarra(page)) - alto)).toBeLessThanOrEqual(1);
});

test("scrollear el contenido no mueve la página ni la barra de conexión", async ({ page }) => {
  await abrirHistorialLargo(page);

  const topAntes = (await page.getByTestId("estado-conexion").boundingBox())!.y;
  await page.getByTestId("contenido").evaluate((el) => {
    el.scrollTop = el.scrollHeight;
  });

  const [scrollY, topDespues] = await page.evaluate(() => {
    const barra = document.querySelector('[data-testid="estado-conexion"]');
    return [window.scrollY, barra ? barra.getBoundingClientRect().top : 0] as [number, number];
  });
  expect(scrollY).toBe(0);
  expect(Math.abs(topDespues - topAntes)).toBeLessThanOrEqual(1);
});

test("ni la barra de pestañas ni la barra de conexión usan position fija", async ({ page }) => {
  await page.goto("/#/historial");
  await expect(page.getByTestId("vista-historial")).toBeVisible();

  const [posPestanas, posConexion] = await page.evaluate(() => {
    const pestanas = document.querySelector(".pestanas");
    const conexion = document.querySelector(".estado-conexion");
    return [pestanas ? getComputedStyle(pestanas).position : null, conexion ? getComputedStyle(conexion).position : null];
  });
  expect(posPestanas).not.toBe("fixed");
  expect(posConexion).not.toBe("sticky");
});

test("cada pestaña muestra un ícono SVG de 24 px y sin caracteres de relleno", async ({ page }) => {
  await page.goto("/#/historial");
  await expect(page.getByTestId("vista-historial")).toBeVisible();

  for (const vista of ["vivo", "cola", "historial", "maquinas"]) {
    const icono = page.getByTestId(`pestana-${vista}`).locator("svg");
    await expect(icono).toHaveCount(1);
    expect(await icono.first().getAttribute("width")).toBe("24");
  }

  const texto = await page.locator('nav[aria-label="Secciones"]').innerText();
  for (const caracter of CARACTERES_VIEJOS) {
    expect(texto).not.toContain(caracter);
  }
});
