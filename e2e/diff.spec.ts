import { expect, test } from "@playwright/test";

/**
 * Aceptación del visor de diff en el detalle de la tarea (`#/tarea/<owner>/<repo>/<n>`)
 * (spec: Diff de la tarea: visor).
 *
 * El endpoint `GET /api/tareas/:owner/:repo/:n/diff` es otro issue («Diff de la tarea: API»):
 * los tests lo simulan con `page.route` (texto plano), y el pedido de la tarea se simula con un
 * `DetalleTarea` literal mínimo. De solo lectura: no escribe en `.e2e/`.
 */

const RUTA_3 = "**/api/tareas/demo/panel/3";
const RUTA_4 = "**/api/tareas/demo/panel/4";
const RUTA_DIFF_3 = "**/api/tareas/demo/panel/3/diff";
const RUTA_DIFF_4 = "**/api/tareas/demo/panel/4/diff";

const DIFF = `diff --git a/src/reloj.ts b/src/reloj.ts
new file mode 100644
index 0000000..1a2b3c4
--- /dev/null
+++ b/src/reloj.ts
@@ -0,0 +1,3 @@
+export function horaActual(ahora: Date): string {
+  return ahora.toISOString().slice(11, 19);
+}
diff --git a/src/index.ts b/src/index.ts
index 5d6e7f8..9a0b1c2 100644
--- a/src/index.ts
+++ b/src/index.ts
@@ -1,3 +1,4 @@
 import { saludar } from "./saludo";
-console.log(saludar());
+import { horaActual } from "./reloj";
+console.log(saludar(), horaActual(new Date()));
 export {};`;

const DETALLE_3 = { id: "demo/panel#3", fecha: "2026-09-27", resultado: null, eventos: [], spec: null };
const DETALLE_4 = { id: "demo/panel#4", fecha: "2026-09-27", resultado: null, eventos: [], spec: null };

test("diff: antes de tocar nada no se hace ningún pedido al diff y diff-tarea está cerrado", async ({ page }) => {
  let peticiones = 0;
  await page.route(RUTA_DIFF_3, (route) => {
    peticiones += 1;
    return route.fulfill({ contentType: "text/plain", body: DIFF });
  });
  await page.route(RUTA_3, (route) => route.fulfill({ json: DETALLE_3 }));

  await page.goto("/#/tarea/demo/panel/3");
  await expect(page.getByTestId("vista-tarea")).toBeVisible();

  const diffTarea = page.getByTestId("diff-tarea");
  await expect(diffTarea).toHaveCount(1);
  await expect(diffTarea).toHaveJSProperty("open", false);

  // Le damos tiempo a que salga un pedido que no debería existir.
  await page.waitForTimeout(500);
  expect(peticiones).toBe(0);
});

test("diff: al abrir se piden 2 archivos cerrados con nombres y +/−, y cerrar y reabrir no vuelve a pedir", async ({ page }) => {
  let peticiones = 0;
  await page.route(RUTA_DIFF_3, (route) => {
    peticiones += 1;
    return route.fulfill({ contentType: "text/plain", body: DIFF });
  });
  await page.route(RUTA_3, (route) => route.fulfill({ json: DETALLE_3 }));

  await page.goto("/#/tarea/demo/panel/3");
  await expect(page.getByTestId("vista-tarea")).toBeVisible();

  const resumen = page.locator('[data-testid="diff-tarea"] > summary');
  await resumen.click();
  await expect(page.getByTestId("archivo-diff")).toHaveCount(2);
  expect(peticiones).toBe(1);

  const abiertos = await page.getByTestId("archivo-diff").evaluateAll((els) => els.map((e) => (e as HTMLDetailsElement).open));
  expect(abiertos).toEqual([false, false]);
  await expect(page.getByTestId("archivo-nombre")).toHaveText(["src/reloj.ts", "src/index.ts"]);
  await expect(page.getByTestId("archivo-mas")).toHaveText(["+3", "+2"]);
  await expect(page.getByTestId("archivo-menos")).toHaveText(["−0", "−1"]);

  await resumen.click();
  await expect(page.getByTestId("diff-tarea")).toHaveJSProperty("open", false);
  await resumen.click();
  await expect(page.getByTestId("diff-tarea")).toHaveJSProperty("open", true);
  await page.waitForTimeout(500);
  expect(peticiones).toBe(1);
});

test("diff: cada archivo muestra sus líneas con su tipo y los colores de add y del son distintos", async ({ page }) => {
  await page.route(RUTA_DIFF_3, (route) => route.fulfill({ contentType: "text/plain", body: DIFF }));
  await page.route(RUTA_3, (route) => route.fulfill({ json: DETALLE_3 }));

  await page.goto("/#/tarea/demo/panel/3");
  await expect(page.getByTestId("vista-tarea")).toBeVisible();

  await page.locator('[data-testid="diff-tarea"] > summary').click();
  await expect(page.getByTestId("archivo-diff")).toHaveCount(2);

  const primer = page.getByTestId("archivo-diff").nth(0);
  await primer.locator("summary").click();
  const lineas1 = primer.getByTestId("linea-diff");
  await expect(lineas1).toHaveCount(3);
  const tipos1 = await lineas1.evaluateAll((els) => els.map((e) => e.getAttribute("data-tipo")));
  expect(tipos1).toEqual(["add", "add", "add"]);

  const segundo = page.getByTestId("archivo-diff").nth(1);
  await segundo.locator("summary").click();
  const lineas2 = segundo.getByTestId("linea-diff");
  await expect(lineas2).toHaveCount(5);
  const tipos2 = await lineas2.evaluateAll((els) => els.map((e) => e.getAttribute("data-tipo")));
  expect(tipos2).toEqual(["ctx", "del", "add", "add", "ctx"]);

  const colorAdd = await primer
    .getByTestId("linea-diff")
    .nth(0)
    .evaluate((e) => getComputedStyle(e).backgroundColor);
  const colorDel = await segundo
    .getByTestId("linea-diff")
    .nth(1)
    .evaluate((e) => getComputedStyle(e).backgroundColor);
  expect(colorAdd).not.toBe("rgba(0, 0, 0, 0)");
  expect(colorDel).not.toBe("rgba(0, 0, 0, 0)");
  expect(colorAdd).not.toBe(colorDel);
});

test("diff: si el pedido responde 404, muestra el error del server y sin archivos", async ({ page }) => {
  await page.route(RUTA_DIFF_3, (route) => route.fulfill({ status: 404, json: { error: "no hay diff" } }));
  await page.route(RUTA_3, (route) => route.fulfill({ json: DETALLE_3 }));

  await page.goto("/#/tarea/demo/panel/3");
  await expect(page.getByTestId("vista-tarea")).toBeVisible();

  await page.locator('[data-testid="diff-tarea"] > summary').click();

  await expect(page.getByTestId("diff-error")).toContainText("no hay diff");
  await expect(page.getByTestId("archivo-diff")).toHaveCount(0);
});

test("diff: si el pedido responde con cuerpo vacío, muestra «Sin cambios» y sin archivos", async ({ page }) => {
  await page.route(RUTA_DIFF_3, (route) => route.fulfill({ contentType: "text/plain", body: "" }));
  await page.route(RUTA_3, (route) => route.fulfill({ json: DETALLE_3 }));

  await page.goto("/#/tarea/demo/panel/3");
  await expect(page.getByTestId("vista-tarea")).toBeVisible();

  await page.locator('[data-testid="diff-tarea"] > summary').click();

  await expect(page.getByTestId("diff-vacio")).toContainText("Sin cambios");
  await expect(page.getByTestId("archivo-diff")).toHaveCount(0);
});

test("diff: si el pedido se aborta (red caída), muestra el error y sin archivos", async ({ page }) => {
  await page.route(RUTA_DIFF_3, (route) => route.abort());
  await page.route(RUTA_3, (route) => route.fulfill({ json: DETALLE_3 }));

  await page.goto("/#/tarea/demo/panel/3");
  await expect(page.getByTestId("vista-tarea")).toBeVisible();

  await page.locator('[data-testid="diff-tarea"] > summary').click();

  await expect(page.getByTestId("diff-error")).toBeVisible();
  await expect(page.getByTestId("archivo-diff")).toHaveCount(0);
});

test("diff: al navegar a otra tarea se descarta el diff y diff-tarea vuelve a estar cerrado", async ({ page }) => {
  await page.route(RUTA_3, (route) => route.fulfill({ json: DETALLE_3 }));
  await page.route(RUTA_DIFF_3, (route) => route.fulfill({ contentType: "text/plain", body: DIFF }));
  await page.route(RUTA_4, (route) => route.fulfill({ json: DETALLE_4 }));
  await page.route(RUTA_DIFF_4, (route) => route.fulfill({ status: 500, json: { error: "no hay diff" } }));

  await page.goto("/#/tarea/demo/panel/3");
  await expect(page.getByTestId("vista-tarea")).toBeVisible();

  await page.locator('[data-testid="diff-tarea"] > summary').click();
  await expect(page.getByTestId("archivo-diff")).toHaveCount(2);

  await page.goto("/#/tarea/demo/panel/4");
  await expect(page.getByTestId("tarea-titulo")).toHaveText("demo/panel#4");

  await expect(page.getByTestId("archivo-diff")).toHaveCount(0);
  await expect(page.getByTestId("diff-tarea")).toHaveJSProperty("open", false);
});

test("diff: a 375 px una línea de 400 caracteres no desborda la página y el scroll es interno al bloque", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });

  const lineaLarga = "x".repeat(400);
  const diffLargo =
    "diff --git a/src/largo.ts b/src/largo.ts\n" +
    "new file mode 100644\n" +
    "index 0000000..1a2b3c4\n" +
    "--- /dev/null\n" +
    "+++ b/src/largo.ts\n" +
    "@@ -0,0 +1,1 @@\n" +
    "+" +
    lineaLarga;

  await page.route(RUTA_DIFF_3, (route) => route.fulfill({ contentType: "text/plain", body: diffLargo }));
  await page.route(RUTA_3, (route) => route.fulfill({ json: DETALLE_3 }));

  await page.goto("/#/tarea/demo/panel/3");
  await expect(page.getByTestId("vista-tarea")).toBeVisible();

  await page.locator('[data-testid="diff-tarea"] > summary').click();
  await expect(page.getByTestId("archivo-diff")).toHaveCount(1);
  await page.getByTestId("archivo-diff").nth(0).locator("summary").click();

  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);

  const bloque = page.getByTestId("lineas-diff").first();
  const ancho = await bloque.evaluate((e) => ({ scrollWidth: e.scrollWidth, clientWidth: e.clientWidth }));
  expect(ancho.scrollWidth).toBeGreaterThan(ancho.clientWidth);
});
