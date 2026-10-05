import { expect, test } from "@playwright/test";

/**
 * Carrera del visor de diff en el detalle de la tarea (`#/tarea/<owner>/<repo>/<n>`):
 * una respuesta del diff que llega después de cambiar de tarea no se debe mostrar en la
 * tarea nueva (issue #26, sobre el visor de la PR #42).
 *
 * El diff de la tarea 3 se demora 1500 ms con `page.route` para que, al navegar a la 4
 * antes de que llegue, la respuesta vieja arribe ya con la 4 en pantalla. Igual que en
 * `diff.spec.ts`, el detalle se simula con el literal mínimo de `DetalleTarea`.
 */

const RUTA_3 = "**/api/tareas/demo/panel/3";
const RUTA_4 = "**/api/tareas/demo/panel/4";
const RUTA_DIFF_3 = "**/api/tareas/demo/panel/3/diff";
const RUTA_DIFF_4 = "**/api/tareas/demo/panel/4/diff";

const DEMORA = 1500;

const DIFF_3 = `diff --git a/src/reloj.ts b/src/reloj.ts
new file mode 100644
index 0000000..1a2b3c4
--- /dev/null
+++ b/src/reloj.ts
@@ -0,0 +1,1 @@
+export const reloj = "panel";`;

const DIFF_4 = `diff --git a/src/otro.ts b/src/otro.ts
new file mode 100644
index 0000000..1a2b3c4
--- /dev/null
+++ b/src/otro.ts
@@ -0,0 +1,1 @@
+export const otro = "panel";`;

const DETALLE_3 = { id: "demo/panel#3", fecha: "2026-09-27", resultado: null, eventos: [], spec: null };
const DETALLE_4 = { id: "demo/panel#4", fecha: "2026-09-27", resultado: null, eventos: [], spec: null };

test("diff: una respuesta demorada de la tarea anterior no se muestra en la tarea nueva", async ({ page }) => {
  let peticiones4 = 0;
  await page.route(RUTA_DIFF_3, async (route) => {
    await new Promise((r) => setTimeout(r, DEMORA));
    await route.fulfill({ contentType: "text/plain", body: DIFF_3 });
  });
  await page.route(RUTA_DIFF_4, (route) => {
    peticiones4 += 1;
    return route.fulfill({ contentType: "text/plain", body: DIFF_4 });
  });
  await page.route(RUTA_3, (route) => route.fulfill({ json: DETALLE_3 }));
  await page.route(RUTA_4, (route) => route.fulfill({ json: DETALLE_4 }));

  await page.goto("/#/tarea/demo/panel/3");
  await expect(page.getByTestId("vista-tarea")).toBeVisible();

  await page.locator('[data-testid="diff-tarea"] > summary').click();

  // Navegamos a la 4 antes de que llegue el diff de la 3.
  await page.goto("/#/tarea/demo/panel/4");
  await expect(page.getByTestId("tarea-titulo")).toHaveText("demo/panel#4");
  await page.waitForTimeout(2000);

  await expect(page.getByTestId("diff-tarea")).toHaveJSProperty("open", false);
  await page.locator('[data-testid="diff-tarea"] > summary').click();

  await expect(page.getByTestId("archivo-diff")).toHaveCount(1);
  await expect(page.getByTestId("archivo-nombre")).toHaveText("src/otro.ts");
  expect(peticiones4).toBe(1);
});

test("diff: un error 500 demorado de la tarea anterior no aparece en la tarea nueva", async ({ page }) => {
  await page.route(RUTA_DIFF_3, async (route) => {
    await new Promise((r) => setTimeout(r, DEMORA));
    await route.fulfill({ status: 500, json: { error: "no hay diff" } });
  });
  await page.route(RUTA_DIFF_4, (route) => route.fulfill({ contentType: "text/plain", body: DIFF_4 }));
  await page.route(RUTA_3, (route) => route.fulfill({ json: DETALLE_3 }));
  await page.route(RUTA_4, (route) => route.fulfill({ json: DETALLE_4 }));

  await page.goto("/#/tarea/demo/panel/3");
  await expect(page.getByTestId("vista-tarea")).toBeVisible();

  await page.locator('[data-testid="diff-tarea"] > summary').click();

  await page.goto("/#/tarea/demo/panel/4");
  await expect(page.getByTestId("tarea-titulo")).toHaveText("demo/panel#4");
  await page.waitForTimeout(2000);

  // El 500 de la 3 llegó ya, pero no se muestra en la 4.
  await expect(page.getByTestId("diff-error")).toHaveCount(0);
  await expect(page.getByTestId("archivo-diff")).toHaveCount(0);

  await page.locator('[data-testid="diff-tarea"] > summary').click();
  await expect(page.getByTestId("archivo-diff")).toHaveCount(1);
  await expect(page.getByTestId("archivo-nombre")).toHaveText("src/otro.ts");
});
