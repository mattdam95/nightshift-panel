import { expect, test, type Page } from "@playwright/test";
import type { Estadisticas } from "../src/contrato/api.js";

/**
 * Aceptación de las estadísticas semanales (spec: Estadísticas semanales en el Historial).
 *
 * La API se prueba contra el build real (el cableado de `index.ts` es parte de la issue);
 * el bloque de la vista se prueba con `page.route` porque la fecha de hoy no es fija
 * (mismo patrón que `maquinas.spec.ts`).
 */

const CLAVES_SEMANA = ["desde", "tareas", "listas", "tasaExito", "minutosPromedio", "rondasRevisionPromedio", "kWh"];

test("API: GET /api/estadisticas?semanas=3 responde 200 con 3 semanas, desde ascendente y las 7 claves", async ({ request }) => {
  const respuesta = await request.get("/api/estadisticas?semanas=3");
  expect(respuesta.status()).toBe(200);
  const est = (await respuesta.json()) as Estadisticas;
  expect(est.semanas).toHaveLength(3);

  const desde = est.semanas.map((s) => s.desde);
  expect(desde).toEqual([...desde].sort());

  for (const semana of est.semanas) {
    expect(Object.keys(semana)).toHaveLength(7);
    for (const clave of CLAVES_SEMANA) expect(Object.hasOwn(semana, clave)).toBe(true);
    expect(semana.kWh).toBeNull();
  }
});

test("API: sin el parámetro semanas responde 8 semanas", async ({ request }) => {
  const respuesta = await request.get("/api/estadisticas");
  expect(respuesta.status()).toBe(200);
  const est = (await respuesta.json()) as Estadisticas;
  expect(est.semanas).toHaveLength(8);
});

test("API: ?semanas=500 queda acotado a 52 semanas", async ({ request }) => {
  const respuesta = await request.get("/api/estadisticas?semanas=500");
  expect(respuesta.status()).toBe(200);
  const est = (await respuesta.json()) as Estadisticas;
  expect(est.semanas).toHaveLength(52);
});

type Semana = Estadisticas["semanas"][number];

function semana(desde: string, tareas: number, listas: number, minutosPromedio: number, rondasRevisionPromedio: number): Semana {
  return { desde, tareas, listas, tasaExito: tareas === 0 ? 0 : listas / tareas, minutosPromedio, rondasRevisionPromedio, kWh: null };
}

/** 8 semanas de lunes en lunes (la más vieja primero); la última tiene 3 tareas y 2 listas → 67 %, 20 min y 2 rondas. */
const ESTADISTICAS: Estadisticas = {
  semanas: [
    semana("2026-08-10", 3, 3, 25, 1.5),
    semana("2026-08-17", 2, 1, 15, 0),
    semana("2026-08-24", 0, 0, 0, 0),
    semana("2026-08-31", 4, 2, 40, 2),
    semana("2026-09-07", 1, 1, 10, 1),
    semana("2026-09-14", 0, 0, 0, 0),
    semana("2026-09-21", 2, 1, 30, 1),
    semana("2026-09-28", 3, 2, 20, 2),
  ],
};

/** Lo mismo pero con la última semana sin tareas (para el caso «—» y data-vacia). */
const ULTIMA_SEMANA_VACIA: Estadisticas = { semanas: [...ESTADISTICAS.semanas.slice(0, 7), semana("2026-09-28", 0, 0, 0, 0)] };

/** Mockea `GET /api/estadisticas*` y abre `#/historial` hasta que se vea el bloque. */
async function abrirHistorialCon(page: Page, estadisticas: Estadisticas): Promise<void> {
  await page.route("**/api/estadisticas*", (route) => route.fulfill({ json: estadisticas }));
  await page.goto("/#/historial");
  await expect(page.getByTestId("vista-historial")).toBeVisible();
  await expect(page.getByTestId("estadisticas")).toBeVisible();
}

test("bloque: muestra «Esta semana» (tasa, minutos y rondas) y una barra por semana, la más vieja a la izquierda", async ({ page }) => {
  await abrirHistorialCon(page, ESTADISTICAS);

  await expect(page.getByTestId("estadisticas")).toBeVisible();
  await expect(page.getByTestId("estadisticas-tasa")).toContainText("67 %");
  await expect(page.getByTestId("estadisticas-minutos")).toContainText("20,0");
  await expect(page.getByTestId("estadisticas-rondas")).toContainText("2,0");

  const barras = page.getByTestId("barra-semana");
  await expect(barras).toHaveCount(8);
  const desde = await barras.evaluateAll((els) => els.map((e) => e.getAttribute("data-desde")));
  expect(desde).toEqual([...desde].sort());
  await expect(barras.last()).toHaveAttribute("data-tasa", "67");
});

test("si la última semana no tiene tareas, la tasa dice «—» y su barra lleva data-vacia", async ({ page }) => {
  await abrirHistorialCon(page, ULTIMA_SEMANA_VACIA);

  await expect(page.getByTestId("estadisticas-tasa")).toContainText("—");
  const barras = page.getByTestId("barra-semana");
  await expect(barras).toHaveCount(8);
  await expect(barras.last()).toHaveAttribute("data-vacia", "true");
  await expect(barras.last()).toHaveAttribute("data-tasa", "0");
});

test("si el pedido de estadísticas responde 500, se ve error-estadisticas y la lista de noches sigue funcionando", async ({ page }) => {
  await page.route("**/api/estadisticas*", (route) => route.fulfill({ status: 500, json: { error: "boom" } }));
  await page.goto("/#/historial");

  await expect(page.getByTestId("error-estadisticas")).toContainText("boom");
  await expect(page.getByTestId("estadisticas")).toHaveCount(0);

  // La lista de noches (pedido independiente) sigue mostrando sus 2 filas del fixture.
  const filas = page.getByTestId("noche");
  await expect(filas).toHaveCount(2);
  await expect(filas.first()).toContainText("2026-09-27");
  await expect(filas.nth(1)).toContainText("2026-09-26");
});

test("a 375 px de ancho, #/historial con el bloque no tiene scroll horizontal", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await abrirHistorialCon(page, ESTADISTICAS);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
});
