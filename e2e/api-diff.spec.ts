import { expect, test } from "@playwright/test";

/**
 * Aceptación de `GET /api/tareas/:owner/:repo/:numero/diff` contra el build real (spec: Diff de la tarea: API).
 *
 * El server de e2e corre con `PANEL_ESPEJO=0` y `PANEL_FIXTURES=test/fixtures` (ver AGENTS.md):
 * el diff sale de `test/fixtures/diffs/demo_panel-3.diff`.
 */
test("GET /api/tareas/demo/panel/3/diff responde 200, text/plain y el diff del fixture", async ({ request }) => {
  const respuesta = await request.get("/api/tareas/demo/panel/3/diff");
  expect(respuesta.status()).toBe(200);
  expect(respuesta.headers()["content-type"] ?? "").toMatch(/^text\/plain/);
  const cuerpo = await respuesta.text();
  expect(cuerpo).toContain("diff --git a/src/reloj.ts");
  expect(cuerpo).toContain("+export function horaActual");
});

test("GET /api/tareas/demo/panel/99/diff responde 404", async ({ request }) => {
  const respuesta = await request.get("/api/tareas/demo/panel/99/diff");
  expect(respuesta.status()).toBe(404);
});
