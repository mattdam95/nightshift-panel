import { expect, test } from "@playwright/test";
import type { DetalleTarea } from "../src/contrato/api.js";

/**
 * Aceptación de `GET /api/tareas/:owner/:repo/:numero` contra el build real (spec: Detalle de tarea).
 *
 * El server de e2e corre con `PANEL_ESPEJO=0` y `PANEL_FIXTURES=test/fixtures` (ver AGENTS.md):
 * el detalle sale de `test/fixtures/lab` (noches 2026-09-26 y 2026-09-27) y la spec de
 * `test/fixtures/issues/demo_panel-3.json`.
 */
test("GET /api/tareas/demo/panel/3 responde 200 con la noche más nueva y la spec del fixture", async ({ request }) => {
  const respuesta = await request.get("/api/tareas/demo/panel/3");
  expect(respuesta.status()).toBe(200);
  const cuerpo = (await respuesta.json()) as DetalleTarea;
  expect(cuerpo.id).toBe("demo/panel#3");
  expect(cuerpo.fecha).toBe("2026-09-27");
  expect(cuerpo.resultado?.estado).toBe("lista");
  expect(cuerpo.eventos).toHaveLength(26);
  expect(cuerpo.spec).not.toBeNull();
  expect(cuerpo.spec).toContain("reloj de la noche");
});

test("GET /api/tareas/demo/panel/999 responde 404", async ({ request }) => {
  const respuesta = await request.get("/api/tareas/demo/panel/999");
  expect(respuesta.status()).toBe(404);
});
