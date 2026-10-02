import { expect, test } from "@playwright/test";

/**
 * Aceptación de la vista `#/cola` (spec: Vista Cola).
 *
 * Con `PANEL_FIXTURES=test/fixtures`, `GET /api/cola` devuelve 3 listas
 * (monigotes#12, nightshift-panel#5, nightshift-panel#21), 1 sin definir
 * (nightshift-panel#19) y 1 bloqueada (nightshift-panel#7) con la pregunta
 * «¿Puedo tocar el lockfile?».
 */

const RUTA_COLA = "**/api/cola";

test("cola: muestra las tres secciones con sus títulos y cantidades", async ({ page }) => {
  await page.goto("/#/cola");

  const listas = page.getByTestId("cola-listas");
  const sinDefinir = page.getByTestId("cola-sin-definir");
  const bloqueadas = page.getByTestId("cola-bloqueadas");

  await expect(listas).toBeVisible();
  await expect(sinDefinir).toBeVisible();
  await expect(bloqueadas).toBeVisible();

  await expect(listas.locator("h2")).toHaveText("Listas");
  await expect(sinDefinir.locator("h2")).toHaveText("Sin definir");
  await expect(bloqueadas.locator("h2")).toHaveText("Bloqueadas");

  await expect(listas.getByTestId("cantidad")).toHaveText("3");
  await expect(sinDefinir.getByTestId("cantidad")).toHaveText("1");
  await expect(bloqueadas.getByTestId("cantidad")).toHaveText("1");

  await expect(page.getByTestId("item-cola")).toHaveCount(5);
});

test("cola: cada ítem muestra #N, el título y el repo, en el orden del fixture", async ({ page }) => {
  await page.goto("/#/cola");

  const listas = page.getByTestId("cola-listas").getByTestId("item-cola");
  await expect(listas).toHaveCount(3);
  await expect(listas.nth(0)).toContainText("#12");
  await expect(listas.nth(0)).toContainText("mattdam95/monigotes");
  await expect(listas.nth(0)).toContainText("Ordenar la lista de monigotes por fecha");
  await expect(listas.nth(1)).toContainText("#5");
  await expect(listas.nth(1)).toContainText("mattdam95/nightshift-panel");
  await expect(listas.nth(1)).toContainText("Endpoint GET /api/maquinas");
  await expect(listas.nth(2)).toContainText("#21");
  await expect(listas.nth(2)).toContainText("mattdam95/nightshift-panel");
  await expect(listas.nth(2)).toContainText("Vista de la cola");

  const sinDefinir = page.getByTestId("cola-sin-definir").getByTestId("item-cola");
  await expect(sinDefinir).toHaveCount(1);
  await expect(sinDefinir.first()).toContainText("#19");
  await expect(sinDefinir.first()).toContainText("mattdam95/nightshift-panel");
  await expect(sinDefinir.first()).toContainText("Íconos PNG para la pantalla de inicio");

  const bloqueadas = page.getByTestId("cola-bloqueadas").getByTestId("item-cola");
  await expect(bloqueadas).toHaveCount(1);
  await expect(bloqueadas.first()).toContainText("#7");
  await expect(bloqueadas.first()).toContainText("mattdam95/nightshift-panel");
  await expect(bloqueadas.first()).toContainText("Endpoint GET /api/cola");
});

test("cola: el enlace de cada ítem apunta a su issue, con target _blank y rel con noopener", async ({ page }) => {
  await page.goto("/#/cola");

  const esperados = [
    ["cola-listas", 0, "https://github.com/mattdam95/monigotes/issues/12"],
    ["cola-listas", 1, "https://github.com/mattdam95/nightshift-panel/issues/5"],
    ["cola-listas", 2, "https://github.com/mattdam95/nightshift-panel/issues/21"],
    ["cola-sin-definir", 0, "https://github.com/mattdam95/nightshift-panel/issues/19"],
    ["cola-bloqueadas", 0, "https://github.com/mattdam95/nightshift-panel/issues/7"],
  ] as const;

  for (const [seccion, indice, url] of esperados) {
    const enlace = page.getByTestId(seccion).getByTestId("item-cola").nth(indice).getByTestId("item-cola-enlace");
    await expect(enlace).toHaveAttribute("href", url);
    await expect(enlace).toHaveAttribute("target", "_blank");
    expect((await enlace.getAttribute("rel")) ?? "").toContain("noopener");
  }
});

test("cola: la bloqueada muestra la pregunta y es la única de la página", async ({ page }) => {
  await page.goto("/#/cola");

  const pregunta = page.getByTestId("pregunta");
  await expect(pregunta).toHaveCount(1);
  await expect(pregunta).toHaveText("¿Puedo tocar el lockfile?");

  await expect(page.getByTestId("cola-listas").getByTestId("pregunta")).toHaveCount(0);
  await expect(page.getByTestId("cola-sin-definir").getByTestId("pregunta")).toHaveCount(0);
});

test("cola: con la cola vacía, las secciones se siguen viendo con cantidad 0 y «Nada por acá»", async ({ page }) => {
  await page.route(RUTA_COLA, (route) =>
    route.fulfill({ status: 200, contentType: "application/json", json: { listas: [], sinDefinir: [], bloqueadas: [] } }),
  );

  await page.goto("/#/cola");

  await expect(page.getByTestId("cola-listas")).toBeVisible();
  await expect(page.getByTestId("cola-sin-definir")).toBeVisible();
  await expect(page.getByTestId("cola-bloqueadas")).toBeVisible();
  await expect(page.getByTestId("cola-listas").getByTestId("cantidad")).toHaveText("0");
  await expect(page.getByTestId("cola-sin-definir").getByTestId("cantidad")).toHaveText("0");
  await expect(page.getByTestId("cola-bloqueadas").getByTestId("cantidad")).toHaveText("0");

  const nada = page.getByTestId("nada");
  await expect(nada).toHaveCount(3);
  await expect(nada).toContainText("Nada por acá");
  await expect(page.getByTestId("item-cola")).toHaveCount(0);
});

test("cola: «Actualizar» vuelve a pedir la cola y queda deshabilitado mientras el pedido está en curso", async ({ page }) => {
  let peticiones = 0;
  let compuerta: Promise<void> | undefined;

  await page.route(RUTA_COLA, async (route) => {
    peticiones += 1;
    if (peticiones === 2) {
      await compuerta; // el segundo pedido queda retenido hasta que se abra la compuerta
    }
    await route.continue();
  });

  await page.goto("/#/cola");
  await expect(page.getByTestId("item-cola")).toHaveCount(5);
  expect(peticiones).toBe(1);

  let liberar: () => void = () => {};
  compuerta = new Promise<void>((resolver) => {
    liberar = resolver;
  });

  const actualizar = page.getByTestId("actualizar");
  await actualizar.click();

  await expect.poll(() => peticiones).toBe(2);
  await expect(actualizar).toBeDisabled();

  liberar();
  await expect(actualizar).toBeEnabled();
  await expect(page.getByTestId("item-cola")).toHaveCount(5);
});

test("cola: si el primer pedido falla (500), muestra el error y ni secciones ni ítems", async ({ page }) => {
  await page.route(RUTA_COLA, (route) => route.fulfill({ status: 500 }));

  await page.goto("/#/cola");

  await expect(page.getByTestId("error-cola")).toContainText("No se pudo traer la cola");
  await expect(page.getByTestId("cola-listas")).toHaveCount(0);
  await expect(page.getByTestId("cola-sin-definir")).toHaveCount(0);
  await expect(page.getByTestId("cola-bloqueadas")).toHaveCount(0);
  await expect(page.getByTestId("item-cola")).toHaveCount(0);
});

test("cola: si el primer pedido se aborta (red caída), mismo error", async ({ page }) => {
  await page.route(RUTA_COLA, (route) => route.abort());

  await page.goto("/#/cola");

  await expect(page.getByTestId("error-cola")).toContainText("No se pudo traer la cola");
  await expect(page.getByTestId("cola-listas")).toHaveCount(0);
  await expect(page.getByTestId("cola-sin-definir")).toHaveCount(0);
  await expect(page.getByTestId("cola-bloqueadas")).toHaveCount(0);
  await expect(page.getByTestId("item-cola")).toHaveCount(0);
});

test("cola: si «Actualizar» falla, el error reemplaza los ítems viejos y si vuelve a andar se recuperan", async ({ page }) => {
  await page.goto("/#/cola");
  await expect(page.getByTestId("item-cola")).toHaveCount(5);

  // Ahora el pedido falla: el error reemplaza todo lo que había en pantalla.
  await page.route(RUTA_COLA, (route) => route.fulfill({ status: 500 }));
  await page.getByTestId("actualizar").click();

  await expect(page.getByTestId("error-cola")).toContainText("No se pudo traer la cola");
  await expect(page.getByTestId("item-cola")).toHaveCount(0);
  await expect(page.getByTestId("cola-listas")).toHaveCount(0);
  await expect(page.getByTestId("cola-sin-definir")).toHaveCount(0);
  await expect(page.getByTestId("cola-bloqueadas")).toHaveCount(0);

  // El pedido vuelve a andar y se toca «Actualizar»: se va el error y vuelven los ítems.
  await page.unroute(RUTA_COLA);
  await page.getByTestId("actualizar").click();

  await expect(page.getByTestId("error-cola")).toHaveCount(0);
  await expect(page.getByTestId("item-cola")).toHaveCount(5);
});

test("cola: a 375 px no hay scroll horizontal y los toques miden al menos 44 px de alto", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/#/cola");
  await expect(page.getByTestId("item-cola")).toHaveCount(5);

  const ancho = page.viewportSize()!.width;
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(ancho);

  const actualizar = page.getByTestId("actualizar");
  await expect(actualizar).toBeVisible();
  expect((await actualizar.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);

  const enlaces = page.getByTestId("item-cola-enlace");
  await expect(enlaces).toHaveCount(5);
  for (let i = 0; i < 5; i++) {
    expect((await enlaces.nth(i).boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
  }
});
