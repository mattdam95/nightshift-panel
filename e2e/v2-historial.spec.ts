import { expect, test } from "@playwright/test";
import type { Estadisticas } from "../src/contrato/api.js";

/**
 * Historial V2: estadísticas en tres bloques, barras semanales con la fecha debajo y la lista de noches
 * como lista agrupada con fecha legible. Las noches salen de los fixtures (2026-09-27 abierta con 1 tarea
 * lista; 2026-09-26 cerrada con 1 bloqueada); las estadísticas se simulan con `page.route`.
 */

type Semana = Estadisticas["semanas"][number];

function semana(desde: string, tareas: number, listas: number, minutos: number, rondas: number): Semana {
  return {
    desde,
    tareas,
    listas,
    tasaExito: tareas === 0 ? 0 : listas / tareas,
    minutosPromedio: minutos,
    rondasRevisionPromedio: rondas,
    kWh: null,
  };
}

const ESTADISTICAS: Estadisticas = {
  semanas: [
    semana("2026-09-07", 1, 1, 10, 1),
    semana("2026-09-14", 0, 0, 0, 0),
    semana("2026-09-21", 2, 1, 30, 1),
    semana("2026-09-28", 3, 2, 20, 2),
  ],
};

test("v2 historial: la primera noche muestra la fecha legible, 1 tarea, el ícono con el número y sigue siendo un enlace", async ({
  page,
}) => {
  await page.goto("/#/historial");
  await expect(page.getByTestId("noche")).toHaveCount(2);

  const fila = page.getByTestId("noche").first();
  await expect(fila).toContainText("Dom 27 sep");
  await expect(fila.getByTestId("fecha-noche")).toHaveAttribute("datetime", "2026-09-27");
  await expect(fila).toContainText("1 tarea");
  await expect(fila).toHaveAttribute("href", "#/noche/2026-09-27");

  const estado = fila.locator(".estado.lista");
  await expect(estado.locator('[data-testid="icono-estado"][data-estado="lista"]')).toHaveCount(1);
  await expect(estado).toHaveText("1");
  expect(await fila.innerText()).not.toContain("×");
});

test("v2 historial: la lista de noches es un grupo (ul.grupo) con filas de al menos 58 px", async ({ page }) => {
  await page.goto("/#/historial");
  await expect(page.getByTestId("noche")).toHaveCount(2);

  const lista = page.locator("ul.grupo").filter({ has: page.getByTestId("noche") });
  await expect(lista).toHaveCount(1);
  for (const i of [0, 1]) {
    expect((await page.getByTestId("noche").nth(i).boundingBox())!.height).toBeGreaterThanOrEqual(58);
  }
});

test("v2 historial: hay una etiqueta d/m por cada barra semanal", async ({ page }) => {
  await page.route("**/api/estadisticas*", (route) => route.fulfill({ json: ESTADISTICAS }));
  await page.goto("/#/historial");
  await expect(page.getByTestId("estadisticas")).toBeVisible();

  const barras = page.getByTestId("barra-semana");
  const etiquetas = page.getByTestId("etiqueta-semana");
  await expect(barras).toHaveCount(4);
  await expect(etiquetas).toHaveCount(4);
  await expect(etiquetas.nth(2)).toHaveText("21/9");
  await expect(etiquetas.first()).toHaveText("7/9");
});

test("v2 historial: los tres valores de las estadísticas conservan su texto y están en bloques (.tile) distintos", async ({ page }) => {
  await page.route("**/api/estadisticas*", (route) => route.fulfill({ json: ESTADISTICAS }));
  await page.goto("/#/historial");
  await expect(page.getByTestId("estadisticas")).toBeVisible();

  const tasa = page.getByTestId("estadisticas-tasa");
  const minutos = page.getByTestId("estadisticas-minutos");
  const rondas = page.getByTestId("estadisticas-rondas");
  await expect(tasa).toHaveText("67 %");
  await expect(minutos).toHaveText("20,0 min");
  await expect(rondas).toHaveText("2,0 rondas");

  const tiles = page.getByTestId("estadisticas").locator(".tile");
  await expect(tiles).toHaveCount(3);
  for (const [i, valor] of [tasa, minutos, rondas].entries()) {
    await expect(tiles.nth(i).locator(valor)).toHaveCount(1);
  }
  await expect(tasa).toHaveCSS("color", "rgb(48, 209, 88)");
});
