import { expect, test } from "@playwright/test";
import type { ResultadoAccion } from "../src/contrato/api.js";

/**
 * Aceptación de `POST /api/acciones/:accion` contra el build real (spec: Acciones: API).
 *
 * El server de e2e corre con `PANEL_ESPEJO=0`: el proveedor es el simulado y responde
 * `{ ok: true, mensaje: "(simulado) <acción>" }` para cualquiera de las cuatro acciones
 * (ver AGENTS.md).
 */

test("POST /api/acciones/pausar con confirmar responde 200 con el resultado simulado", async ({ request }) => {
  const respuesta = await request.post("/api/acciones/pausar", { data: { confirmar: true } });
  expect(respuesta.status()).toBe(200);
  expect((await respuesta.json()) as ResultadoAccion).toEqual({ ok: true, mensaje: "(simulado) pausar" });
});

test("POST /api/acciones/reintentar con tarea responde (simulado) reintentar", async ({ request }) => {
  const respuesta = await request.post("/api/acciones/reintentar", { data: { confirmar: true, tarea: "demo/panel#1" } });
  expect(respuesta.status()).toBe(200);
  expect((await respuesta.json()) as ResultadoAccion).toEqual({ ok: true, mensaje: "(simulado) reintentar" });
});

test("POST /api/acciones/pausar sin confirmar responde 400", async ({ request }) => {
  const respuesta = await request.post("/api/acciones/pausar", { data: {} });
  expect(respuesta.status()).toBe(400);
});

test("POST /api/acciones/borrar (acción desconocida) responde 400", async ({ request }) => {
  const respuesta = await request.post("/api/acciones/borrar", { data: { confirmar: true } });
  expect(respuesta.status()).toBe(400);
});
