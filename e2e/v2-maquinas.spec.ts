import { expect, test, type Page } from "@playwright/test";
import type { Maquinas } from "../src/contrato/api.js";

/**
 * Máquinas V2: anillo de VRAM, chip de conexión, bloques de temperatura/potencia/generación, salud del LLM
 * con un punto que brilla y la memoria de la Mac en una barra violeta. `GET /api/maquinas` se simula con
 * `page.route`: PC conectada (68 °C, 187 W, VRAM 12/16 GiB, llm ok a 29,63 tok/s) y Mac 18,4/24 GiB.
 */

const MAQUINAS: Maquinas = {
  ts: "2026-09-27T02:14:10.000Z",
  pc: {
    conexion: "conectada",
    gpu: { temperaturaC: 68, potenciaW: 187, vramUsadaGiB: 12, vramTotalGiB: 16 },
    llm: { salud: "ok", tokPorSegGeneracion: 29.63, tokPorSegPrompt: 400, peticionesEnCurso: 1 },
  },
  mac: { memoriaUsadaGiB: 18.4, memoriaTotalGiB: 24 },
};

async function abrir(page: Page, maquinas: Maquinas = MAQUINAS): Promise<void> {
  await page.route("**/api/maquinas", (route) => route.fulfill({ json: maquinas }));
  await page.goto("/#/maquinas");
  await expect(page.getByTestId("maquina-pc")).toBeVisible();
  await expect(page.getByTestId("maquina-mac")).toBeVisible();
}

test("v2 máquinas: el anillo de VRAM conserva el progressbar, mide 84 px, dice 75 % y su arco cubre el 75 %", async ({ page }) => {
  await abrir(page);

  const anillo = page.getByTestId("pc-vram-barra");
  await expect(anillo).toHaveAttribute("role", "progressbar");
  await expect(anillo).toHaveAttribute("aria-valuenow", "75");
  await expect(anillo).toContainText("75%");
  const caja = (await anillo.locator("svg").boundingBox())!;
  expect(Math.abs(caja.width - 84)).toBeLessThanOrEqual(1);

  const arco = await page.getByTestId("pc-vram-anillo").getAttribute("stroke-dasharray");
  const primero = Number(arco!.split(/[ ,]+/)[0]);
  expect(Math.abs(primero - 160.2)).toBeLessThanOrEqual(0.5);
});

test("v2 máquinas: pc-conexion es un chip «Conectada» en verde", async ({ page }) => {
  await abrir(page);

  const chip = page.getByTestId("pc-conexion");
  await expect(chip).toHaveText("Conectada");
  await expect(chip).toHaveCSS("color", "rgb(48, 209, 88)");
});

test("v2 máquinas: temperatura, potencia y generación son tres bloques en la misma fila", async ({ page }) => {
  await abrir(page);

  const ids = ["pc-temperatura", "pc-potencia", "pc-toks"];
  const ys: number[] = [];
  for (const id of ids) {
    const valor = page.getByTestId(id);
    expect(await valor.evaluate((el) => el.closest(".tile") !== null)).toBe(true);
    ys.push((await valor.locator("xpath=ancestor::*[contains(@class,'tile')][1]").boundingBox())!.y);
  }
  expect(Math.max(...ys) - Math.min(...ys)).toBeLessThanOrEqual(1);
  await expect(page.getByTestId("pc-temperatura")).toContainText("68 °C");
  await expect(page.getByTestId("pc-potencia")).toContainText("187 W");
  await expect(page.getByTestId("pc-toks")).toContainText("29,6 tok/s");
});

test("v2 máquinas: con la salud «ok», el punto del LLM es verde y brilla", async ({ page }) => {
  await abrir(page);

  const punto = page.getByTestId("salud-llm").locator(".punto");
  await expect(punto).toHaveCSS("background-color", "rgb(48, 209, 88)");
  await expect(punto).not.toHaveCSS("box-shadow", "none");
  await expect(page.getByTestId("salud-llm")).toHaveText("ok");
});

test("v2 máquinas: la memoria de la Mac es una barra de 6 px con el relleno violeta", async ({ page }) => {
  await abrir(page);

  const barra = page.getByTestId("mac-memoria-barra");
  await expect(barra).toHaveAttribute("aria-valuenow", "77");
  const alto = (await barra.boundingBox())!.height;
  expect(Math.abs(alto - 6)).toBeLessThanOrEqual(1);
  await expect(barra.locator(":scope > div")).toHaveCSS("background-color", "rgb(191, 90, 242)");
});
