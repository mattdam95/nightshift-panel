import { expect, test, type Page } from "@playwright/test";
import type { Maquinas } from "../src/contrato/api.js";

/**
 * Aceptación de la vista `#/maquinas` (spec: Vista Máquinas).
 *
 * El endpoint `GET /api/maquinas` se simula con `page.route` (patrón que fija la spec): los tests
 * no dependen de la hora, de `gh` ni de otros specs (los e2e comparten un solo server).
 */

/** El `Maquinas` de ejemplo de la spec: PC conectada (68 °C, 187 W, VRAM 12/16 GiB, llm ok a 29.63 tok/s), Mac (18,4 / 24 GiB). El revisor corre en la PC (mismo llm). */
const MAQUINAS: Maquinas = {
  ts: "2026-09-27T02:14:10.000Z",
  pc: {
    conexion: "conectada",
    gpu: { temperaturaC: 68, potenciaW: 187, vramUsadaGiB: 12, vramTotalGiB: 16 },
    llm: { salud: "ok", tokPorSegGeneracion: 29.63, tokPorSegPrompt: 400, peticionesEnCurso: 1 },
  },
  mac: {
    memoriaUsadaGiB: 18.4,
    memoriaTotalGiB: 24,
  },
};

/** El mismo ejemplo pero sin datos: `gpu: null`, `tokPorSegGeneracion: null` y memoria de la Mac `null`. */
const SIN_DATOS: Maquinas = {
  ts: MAQUINAS.ts,
  pc: {
    conexion: "conectada",
    gpu: null,
    llm: { salud: "ok", tokPorSegGeneracion: null, tokPorSegPrompt: null, peticionesEnCurso: null },
  },
  mac: {
    memoriaUsadaGiB: null,
    memoriaTotalGiB: null,
  },
};

/** Mockea el endpoint con `maquinas` y abre `#/maquinas` hasta que se ven las dos tarjetas (primera respuesta renderizada). */
async function abrirCon(page: Page, maquinas: Maquinas): Promise<void> {
  await page.route("**/api/maquinas", (route) => route.fulfill({ json: maquinas }));
  await page.goto("/#/maquinas");
  await expect(page.getByTestId("vista-maquinas")).toBeVisible();
  await expect(page.getByTestId("maquina-pc")).toBeVisible();
  await expect(page.getByTestId("maquina-mac")).toBeVisible();
}

/** Cambia la salud del llm de la PC (que hace de ejecutor y de revisor). */
function conSalud(maquinas: Maquinas, campo: "llm", salud: "ok" | "caido" | "apagado"): Maquinas {
  return { ...maquinas, pc: { ...maquinas.pc, [campo]: { ...maquinas.pc.llm, salud } } };
}

/** Cambia solo la temperatura de la GPU (para que el polling muestre un valor nuevo). */
function conTemperatura(temperaturaC: number): Maquinas {
  const pc = MAQUINAS.pc;
  return { ...MAQUINAS, pc: { ...pc, gpu: pc.gpu === null ? null : { ...pc.gpu, temperaturaC } } };
}

test("muestra la PC (temperatura, potencia, VRAM con barra, tok/s) y la Mac (memoria con barra) con su conexión", async ({ page }) => {
  await abrirCon(page, MAQUINAS);

  await expect(page.getByTestId("pc-conexion")).toHaveText("conectada");
  await expect(page.getByTestId("pc-temperatura")).toContainText("68 °C");
  await expect(page.getByTestId("pc-potencia")).toContainText("187 W");
  await expect(page.getByTestId("pc-vram")).toContainText("12,0 / 16,0 GiB");
  const barraPc = page.getByTestId("pc-vram-barra");
  await expect(barraPc).toHaveAttribute("role", "progressbar");
  await expect(barraPc).toHaveAttribute("aria-valuemin", "0");
  await expect(barraPc).toHaveAttribute("aria-valuemax", "100");
  await expect(barraPc).toHaveAttribute("aria-valuenow", "75");
  await expect(page.getByTestId("pc-toks")).toContainText("29,6 tok/s");
  await expect(page.getByTestId("mac-memoria")).toContainText("18,4 / 24,0 GiB");
  await expect(page.getByTestId("mac-memoria-barra")).toHaveAttribute("aria-valuenow", "77");
});

test('salud-llm: con salud «ok» dice «ok» y data-salud="ok"', async ({ page }) => {
  await abrirCon(page, conSalud(MAQUINAS, "llm", "ok"));
  const salud = page.getByTestId("salud-llm");
  await expect(salud).toContainText("ok");
  await expect(salud).toHaveAttribute("data-salud", "ok");
});

test('salud-llm: con salud «caido» dice «caído» y data-salud="caido"', async ({ page }) => {
  await abrirCon(page, conSalud(MAQUINAS, "llm", "caido"));
  const salud = page.getByTestId("salud-llm");
  await expect(salud).toContainText("caído");
  await expect(salud).toHaveAttribute("data-salud", "caido");
});

test('salud-llm: con salud «apagado» dice «apagado» y data-salud="apagado"', async ({ page }) => {
  await abrirCon(page, conSalud(MAQUINAS, "llm", "apagado"));
  const salud = page.getByTestId("salud-llm");
  await expect(salud).toContainText("apagado");
  await expect(salud).toHaveAttribute("data-salud", "apagado");
});

test("el revisor corre en la PC: la tarjeta PC rotula el llm como ejecutor y revisor, y la Mac no muestra un revisor propio", async ({
  page,
}) => {
  await abrirCon(page, MAQUINAS);
  await expect(page.getByTestId("maquina-pc")).toContainText("ejecutor y revisor");
  await expect(page.getByTestId("salud-revisor")).toHaveCount(0);
  await expect(page.getByTestId("maquina-mac")).toContainText("El revisor corre en la PC");
});

test("los valores null muestran «—», sin barras, y ninguna tarjeta muestra «null», «NaN» ni «undefined»", async ({ page }) => {
  await abrirCon(page, SIN_DATOS);

  await expect(page.getByTestId("pc-temperatura")).toContainText("—");
  await expect(page.getByTestId("pc-potencia")).toContainText("—");
  await expect(page.getByTestId("pc-vram")).toContainText("—");
  await expect(page.getByTestId("pc-toks")).toContainText("—");
  await expect(page.getByTestId("mac-memoria")).toContainText("—");
  // Sin porcentaje no se dibuja la barra.
  await expect(page.getByTestId("pc-vram-barra")).toHaveCount(0);
  await expect(page.getByTestId("mac-memoria-barra")).toHaveCount(0);

  for (const testid of ["maquina-pc", "maquina-mac"]) {
    const texto = (await page.getByTestId(testid).textContent()) ?? "";
    expect(texto, `la tarjeta ${testid} muestra un valor sin formato`).not.toMatch(/null|NaN|undefined/);
  }
});

test("con pc.conexion «sin-espejo», pc-conexion dice «datos locales»", async ({ page }) => {
  await abrirCon(page, { ...MAQUINAS, pc: { ...MAQUINAS.pc, conexion: "sin-espejo" } });
  await expect(page.getByTestId("pc-conexion")).toContainText("datos locales");
});

test("con pc.conexion «desconectada», pc-conexion dice «desconectada»", async ({ page }) => {
  await abrirCon(page, { ...MAQUINAS, pc: { ...MAQUINAS.pc, conexion: "desconectada" } });
  await expect(page.getByTestId("pc-conexion")).toContainText("desconectada");
});

test("polling: pide al abrir, repite cada 15 s mientras la vista está abierta y deja de pedir al salir", async ({ page }) => {
  let pedidos = 0;
  // Recipe de la spec: `page.clock.install()` antes del `page.goto`, y `runFor(15_000)` para cada ciclo.
  await page.clock.install();
  await page.route("**/api/maquinas", (route) => {
    pedidos += 1;
    // La segunda respuesta trae otra temperatura para verificar que la pantalla muestra el valor nuevo.
    return route.fulfill({ json: conTemperatura(pedidos === 1 ? 68 : 91) });
  });

  await page.goto("/#/maquinas");
  await expect.poll(() => pedidos).toBe(1);
  await expect(page.getByTestId("maquina-pc")).toBeVisible();
  await expect(page.getByTestId("pc-temperatura")).toContainText("68 °C");

  await page.clock.runFor(15_000);
  await expect.poll(() => pedidos).toBe(2);
  await expect(page.getByTestId("pc-temperatura")).toContainText("91 °C");

  await page.clock.runFor(15_000);
  await expect.poll(() => pedidos).toBe(3);

  // Fuera de la vista no se sigue pidiendo.
  await page.goto("/#/historial");
  await page.clock.runFor(60_000);
  expect(pedidos).toBe(3);
});

test("error y recuperación: si un pedido falla solo queda error-maquinas, y si el siguiente anda vuelven las tarjetas", async ({
  page,
}) => {
  let pedidos = 0;
  await page.clock.install();
  await page.route("**/api/maquinas", (route) => {
    pedidos += 1;
    if (pedidos === 2) return route.fulfill({ status: 500, json: { error: "boom" } });
    return route.fulfill({ json: MAQUINAS });
  });

  // Primera respuesta ok: se ven las tarjetas y no hay error.
  await page.goto("/#/maquinas");
  await expect.poll(() => pedidos).toBe(1);
  await expect(page.getByTestId("maquina-pc")).toBeVisible();
  await expect(page.getByTestId("maquina-mac")).toBeVisible();
  await expect(page.getByTestId("error-maquinas")).toHaveCount(0);

  // Segunda respuesta 500: se sacan las tarjetas y queda solo el error con el mensaje del server.
  await page.clock.runFor(15_000);
  await expect.poll(() => pedidos).toBe(2);
  await expect(page.getByTestId("maquina-pc")).toHaveCount(0);
  await expect(page.getByTestId("maquina-mac")).toHaveCount(0);
  await expect(page.getByTestId("error-maquinas")).toContainText("boom");

  // Tercera respuesta ok: vuelven las tarjetas y se va el error (nunca error y datos viejos a la vez).
  await page.clock.runFor(15_000);
  await expect.poll(() => pedidos).toBe(3);
  await expect(page.getByTestId("maquina-pc")).toBeVisible();
  await expect(page.getByTestId("maquina-mac")).toBeVisible();
  await expect(page.getByTestId("error-maquinas")).toHaveCount(0);
});

test("si el primer pedido ya falla (500), solo se ve error-maquinas", async ({ page }) => {
  await page.route("**/api/maquinas", (route) => route.fulfill({ status: 500, json: { error: "boom" } }));

  await page.goto("/#/maquinas");
  await expect(page.getByTestId("vista-maquinas")).toBeVisible();
  await expect(page.getByTestId("error-maquinas")).toContainText("boom");
  await expect(page.getByTestId("maquina-pc")).toHaveCount(0);
  await expect(page.getByTestId("maquina-mac")).toHaveCount(0);
});

test("si el primer pedido ya falla (red caída), solo se ve error-maquinas", async ({ page }) => {
  await page.route("**/api/maquinas", (route) => route.abort());

  await page.goto("/#/maquinas");
  await expect(page.getByTestId("vista-maquinas")).toBeVisible();
  await expect(page.getByTestId("error-maquinas")).toBeVisible();
  await expect(page.getByTestId("maquina-pc")).toHaveCount(0);
  await expect(page.getByTestId("maquina-mac")).toHaveCount(0);
});

test("cabe en 375 px de ancho sin scroll horizontal", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await abrirCon(page, MAQUINAS);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
});
