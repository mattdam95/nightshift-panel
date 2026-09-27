import { appendFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

const ARCHIVO = ".e2e/lab/logs/2026-09-27/events.jsonl";
const evento = (etapa: string, tipo: string, datos: object, tarea: string | null = "demo/panel#5") =>
  JSON.stringify({ ts: new Date().toISOString(), maquina: etapa === "revision" ? "mac" : "pc", tarea, etapa, tipo, datos }) + "\n";

test("la vista en vivo muestra la tarea en curso y se actualiza con eventos nuevos", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("estado-conexion")).toHaveAttribute("data-stream", "en-vivo");
  await expect(page.getByTestId("tarea-id")).toHaveText("demo/panel#5");
  await expect(page.getByTestId("etapa-actual")).toHaveText("implementación");
  await expect(page.getByTestId("herramienta")).toHaveCount(2);
  await expect(page.getByTestId("terminada")).toHaveCount(1);

  appendFileSync(ARCHIVO, evento("implementacion", "herramienta", { nombre: "edit", resumen: "web/src/vistas/Cola.tsx" }));
  await expect(page.getByTestId("herramienta").first()).toContainText("web/src/vistas/Cola.tsx");

  appendFileSync(ARCHIVO, evento("revision", "inicio", { ronda: 1 }));
  await expect(page.getByTestId("etapa-actual")).toHaveText("revisión");
  await expect(page.getByTestId("tarea-maquina")).toHaveText("Mac");

  appendFileSync(ARCHIVO, evento("entrega", "resultado", { estado: "lista", motivo: "ok", pr: "https://github.com/demo/panel/pull/9" }));
  await expect(page.getByTestId("terminada")).toHaveCount(2);
  await expect(page.getByTestId("tarea-en-curso")).toHaveCount(0);
});

test("la barra de pestañas navega entre secciones y cabe en un iPhone", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("pestana-historial").click();
  await expect(page).toHaveURL(/#\/historial$/);
  await expect(page.getByTestId("vista-historial")).toBeVisible();
  const ancho = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(ancho).toBeLessThanOrEqual(page.viewportSize()!.width);
});
