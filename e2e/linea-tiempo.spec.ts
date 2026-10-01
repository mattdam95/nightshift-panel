import { expect, test, type Locator } from "@playwright/test";

/**
 * Tests de aceptación de la línea de tiempo de la noche (spec: Línea de tiempo de la noche (franjas por máquina)).
 *
 * Solo lectura: no escribe en `.e2e/` (comparte un solo server y una sola copia de datos con
 * `vivo.spec.ts` y `historial.spec.ts`). El componente no se puede probar con vitest
 * (ambiente `node`, sin jsdom), así que todo se prueba acá contra el build real.
 *
 * El caso "devuelve null cuando no hay franjas" no es observable acá: las dos noches de los fixtures
 * tienen franjas, y agregar una noche sin tareas rompería `historial.spec.ts` (cuenta las noches de la lista).
 */

// Las seis etapas que tienen las tareas de la noche del 2026-09-27 (`NOMBRE_ETAPA` de `formato.ts`).
const NOMBRES_ETAPA = ["preparación", "tests", "implementación", "verificación", "revisión", "entrega"];

test("la línea de tiempo es un SVG con fila PC, fila Mac, leyenda y 5 marcas equidistantes con hora()", async ({ page }) => {
  await page.goto("/#/noche/2026-09-27");
  await expect(page.getByTestId("vista-noche")).toBeVisible();
  // La lista de resultados ya cargada: la línea de tiempo va arriba de ella.
  await expect(page.getByTestId("resultado")).toHaveCount(1);

  const linea = page.getByTestId("linea-tiempo");
  await expect(linea).toBeVisible();
  expect(await linea.evaluate((el) => el.tagName.toLowerCase())).toBe("svg");

  const posicion = await page.evaluate(() => {
    const svg = document.querySelector('[data-testid="linea-tiempo"]');
    const lista = document.querySelector("ul.resultados");
    return svg && lista ? lista.compareDocumentPosition(svg) & Node.DOCUMENT_POSITION_PRECEDING : 0;
  });
  expect(posicion).toBe(1);

  await expect(page.getByTestId("fila-pc")).toBeVisible();
  await expect(page.getByTestId("fila-mac")).toBeVisible();

  // Esa noche tiene las seis etapas de tarea: una entrada de la leyenda por etapa.
  const entradas = page.getByTestId("leyenda-etapa");
  await expect(entradas).toHaveCount(6);
  const nombres = await entradas.allTextContents();
  for (const nombre of NOMBRES_ETAPA) {
    expect(nombres.some((n) => n.includes(nombre))).toBe(true);
  }

  // Exactamente 5 marcas, rotuladas con `hora()` (Argentina, HH:MM:SS), equidistantes.
  const marcas = await page.getByTestId("marca-tiempo").all();
  expect(marcas).toHaveLength(5);
  const centros: number[] = [];
  for (const marca of marcas) {
    expect(await marca.textContent()).toMatch(/^\d{2}:\d{2}:\d{2}$/);
    const caja = (await marca.boundingBox())!;
    centros.push(caja.x + caja.width / 2);
  }
  for (let i = 1; i < centros.length; i++) {
    expect(centros[i]!).toBeGreaterThan(centros[i - 1]!);
    expect(Math.abs(centros[i]! - centros[i - 1]! - (centros[1]! - centros[0]!))).toBeLessThanOrEqual(2);
  }
});

test("cada franja tiene un <title> con la tarea, el nombre de la etapa y la duración", async ({ page }) => {
  await page.goto("/#/noche/2026-09-27");
  await expect(page.getByTestId("franja")).toHaveCount(9);

  const titulos = await page.getByTestId("franja").locator("title").allTextContents();
  expect(titulos).toHaveLength(9);
  for (const titulo of titulos) {
    expect(titulo).toContain("demo/panel#");
    expect(NOMBRES_ETAPA.some((n) => titulo.includes(n))).toBe(true);
    // Duración en el formato de `duracion()` de `formato.ts`.
    expect(titulo).toMatch(/\d+ (s|min)/);
  }

  const tituloDe = async (franja: Locator) => (await franja.locator("title").first().textContent()) ?? "";
  const pc = page.getByTestId("fila-pc").getByTestId("franja");
  const mac = page.getByTestId("fila-mac").getByTestId("franja");
  await expect(pc).toHaveCount(8);
  await expect(mac).toHaveCount(1);

  // Primera de la PC: preparación de #3, 01:00:21 → 01:00:35 = 14 s.
  const primera = await tituloDe(pc.first());
  expect(primera).toContain("demo/panel#3");
  expect(primera).toContain("preparación");
  expect(primera).toContain("14 s");

  // La única de la Mac: revisión de #3, 01:02:55 → 01:03:05 = 10 s.
  const revision = await tituloDe(mac.first());
  expect(revision).toContain("demo/panel#3");
  expect(revision).toContain("revisión");
  expect(revision).toContain("10 s");

  // Última de la PC: implementación de #5, 01:03:47 → 01:04:15 = 28 s.
  const ultima = await tituloDe(pc.last());
  expect(ultima).toContain("demo/panel#5");
  expect(ultima).toContain("implementación");
  expect(ultima).toContain("28 s");
});

test("cada franja es un link al detalle de su tarea (con partirTarea)", async ({ page }) => {
  await page.goto("/#/noche/2026-09-27");

  const pc = page.getByTestId("fila-pc").getByTestId("franja");
  await expect(pc).toHaveCount(8);
  for (let i = 0; i < 5; i++) await expect(pc.nth(i)).toHaveAttribute("href", "#/tarea/demo/panel/3");
  for (let i = 5; i < 8; i++) await expect(pc.nth(i)).toHaveAttribute("href", "#/tarea/demo/panel/5");

  const mac = page.getByTestId("fila-mac").getByTestId("franja");
  await expect(mac).toHaveCount(1);
  await expect(mac.first()).toHaveAttribute("href", "#/tarea/demo/panel/3");
});

test("9 franjas en total (8 en fila-pc y al menos 1 en fila-mac) y tocar la primera lleva al detalle de la tarea", async ({ page }) => {
  await page.goto("/#/noche/2026-09-27");
  await expect(page.getByTestId("franja")).toHaveCount(9);
  await expect(page.getByTestId("fila-pc").getByTestId("franja")).toHaveCount(8);
  expect(await page.getByTestId("fila-mac").getByTestId("franja").count()).toBeGreaterThanOrEqual(1);

  await page.getByTestId("franja").first().click();
  await expect(page).toHaveURL(/#\/tarea\/demo\/panel\/3$/);
});

test("la línea de tiempo no desborda el ancho del iPhone (sin scroll horizontal)", async ({ page }) => {
  const ancho = page.viewportSize()!.width;
  await page.goto("/#/noche/2026-09-27");
  await expect(page.getByTestId("franja")).toHaveCount(9);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(ancho);
});

test("la noche del 2026-09-26 sigue mostrando su resultado y su reporte como antes", async ({ page }) => {
  await page.goto("/#/noche/2026-09-26");
  await expect(page.getByTestId("vista-noche")).toBeVisible();
  await expect(page.getByTestId("resultado")).toHaveCount(1);
  await page.getByTestId("ver-reporte").click();
  await expect(page.getByTestId("reporte")).toContainText("# Noche del 2026-09-26");
});
