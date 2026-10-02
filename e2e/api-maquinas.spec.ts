import { expect, test } from "@playwright/test";
import type { Maquinas } from "../src/contrato/api.js";

/**
 * Aceptación de `GET /api/maquinas` contra el build real (spec: Endpoint GET /api/maquinas).
 *
 * El server de e2e corre con `PANEL_ESPEJO=0` y `PANEL_FIXTURES=test/fixtures`: los datos salen
 * de `sonda-pc.json` y `mac.json` (ver AGENTS.md). Este test existe porque en #7 un test armó la
 * app distinto que `index.ts` y tapó un endpoint roto.
 */
test("GET /api/maquinas responde 200 con los datos fijos de dev", async ({ request }) => {
  const respuesta = await request.get("/api/maquinas");
  expect(respuesta.status()).toBe(200);
  const cuerpo = (await respuesta.json()) as Maquinas;
  expect(cuerpo.pc.conexion).toBe("conectada");
  expect(cuerpo.pc.gpu?.temperaturaC).toBe(68);
  expect(cuerpo.pc.llm.salud).toBe("ok");
  expect(cuerpo.mac.memoriaTotalGiB).toBe(24);
});
