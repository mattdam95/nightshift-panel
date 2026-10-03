import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { DetalleTarea, ResultadoTarea } from "./api.js";
import type { Etapa, Evento } from "./eventos.js";
import { parsearJsonl } from "./eventos.js";
import { agruparPorEtapa, pasosDeVerificacion } from "./tarea.js";

/**
 * Aceptación de `agruparPorEtapa()` y `pasosDeVerificacion()` (spec: Detalle de tarea: vista).
 * Son funciones puras, así que se prueban acá con vitest; la vista `Tarea` se prueba en `e2e/tarea.spec.ts`
 * (ambiente `node`, sin jsdom: las vistas React no se prueban con vitest).
 *
 * La tarea de verdad es `demo/panel#3` del fixture `test/fixtures/lab/logs/2026-09-27/events.jsonl`:
 * 26 eventos que recorren las seis etapas de la tarea.
 */

const eventos3 = parsearJsonl(readFileSync("test/fixtures/lab/logs/2026-09-27/events.jsonl", "utf8")).filter(
  (e) => e.tarea === "demo/panel#3",
);

describe("agruparPorEtapa() (spec: Detalle de tarea: vista)", () => {
  it("con los 26 eventos de demo/panel#3 devuelve 6 grupos en orden, con los tamaños esperados", () => {
    expect(eventos3).toHaveLength(26);

    const grupos = agruparPorEtapa(eventos3);
    expect(grupos).toHaveLength(6);
    expect(grupos.map((g) => [g.etapa, g.eventos.length] as const)).toEqual([
      ["preparacion", 2],
      ["tests", 8],
      ["implementacion", 8],
      ["verificacion", 4],
      ["revision", 2],
      ["entrega", 2],
    ]);

    // Los grupos no descartan ni reordenan eventos: volcados en fila devuelven la lista original.
    expect(grupos.flatMap((g) => g.eventos)).toEqual(eventos3);
  });

  it("con [] devuelve []", () => {
    expect(agruparPorEtapa([])).toEqual([]);
  });

  it("agrupa solo etapas consecutivas: implementacion, verificacion, implementacion da 3 grupos", () => {
    const ev = (etapa: Etapa): Evento => ({
      ts: "2026-09-27T01:00:00.000Z",
      maquina: "pc",
      tarea: "demo/panel#3",
      etapa,
      tipo: "turno",
      datos: {},
    });

    const grupos = agruparPorEtapa([ev("implementacion"), ev("verificacion"), ev("implementacion")]);
    expect(grupos.map((g) => g.etapa)).toEqual(["implementacion", "verificacion", "implementacion"]);
  });
});

const ev = (ts: string, etapa: Etapa, tipo: string, datos: Record<string, unknown>): Evento => ({
  ts,
  maquina: etapa === "revision" ? "mac" : "pc",
  tarea: "demo/panel#3",
  etapa,
  tipo,
  datos,
});

const detalle = (resultado: ResultadoTarea | null, eventos: Evento[]): DetalleTarea => ({
  id: "demo/panel#3",
  fecha: "2026-09-27",
  resultado,
  eventos,
  spec: null,
});

const resultadoBase = (extra: Partial<ResultadoTarea> = {}): ResultadoTarea => ({
  tarea: "demo/panel#3",
  repo: "demo/panel",
  numero: 3,
  titulo: "Reloj de la noche",
  estado: "lista",
  motivo: "verificación OK y el revisor aprueba",
  inicio: "2026-09-27T01:00:21.000Z",
  fin: "2026-09-27T01:03:36.000Z",
  turnos: 5,
  tokens: 1110,
  llamadas: 4,
  rondasAgente: 2,
  testsAceptacion: ["pnpm lint", "pnpm test"],
  avisos: [],
  ...extra,
});

describe("pasosDeVerificacion() (spec: Detalle de tarea: vista)", () => {
  it("con los eventos de demo/panel#3 y resultado: null, devuelve los 3 pasos de la última ronda, todos ok", () => {
    expect(pasosDeVerificacion(detalle(null, eventos3))).toEqual([
      { comando: "pnpm install --frozen-lockfile", ok: true },
      { comando: "pnpm lint", ok: true },
      { comando: "pnpm test", ok: true },
    ]);
  });

  it("si resultado.verificacion.pasos existe, gana sobre los eventos", () => {
    const resultado = resultadoBase({ verificacion: { ok: false, pasos: [{ comando: "npm test", ok: false }] } });
    expect(pasosDeVerificacion(detalle(resultado, eventos3))).toEqual([{ comando: "npm test", ok: false }]);
  });

  it("con dos rondas en los eventos, solo devuelve los pasos de la última ronda cerrada", () => {
    const eventos = [
      ev("2026-09-27T01:02:27.000Z", "verificacion", "paso", { comando: "pnpm lint", ok: false, codigo: 1 }),
      ev("2026-09-27T01:02:34.000Z", "verificacion", "resultado", { ok: false, trampas: [] }),
      ev("2026-09-27T01:02:41.000Z", "verificacion", "paso", { comando: "pnpm test", ok: true, codigo: 0 }),
      ev("2026-09-27T01:02:48.000Z", "verificacion", "paso", { comando: "pnpm build", ok: true, codigo: 0 }),
      ev("2026-09-27T01:02:55.000Z", "verificacion", "resultado", { ok: true, trampas: [] }),
    ];

    expect(pasosDeVerificacion(detalle(null, eventos))).toEqual([
      { comando: "pnpm test", ok: true },
      { comando: "pnpm build", ok: true },
    ]);
  });

  it("sin `resultado` todavía, devuelve los pasos sueltos de la ronda en curso", () => {
    const eventos = [
      ev("2026-09-27T01:02:27.000Z", "verificacion", "paso", { comando: "pnpm lint", ok: true, codigo: 0 }),
      ev("2026-09-27T01:02:34.000Z", "verificacion", "paso", { comando: "pnpm test", ok: false, codigo: 1 }),
    ];

    expect(pasosDeVerificacion(detalle(null, eventos))).toEqual([
      { comando: "pnpm lint", ok: true },
      { comando: "pnpm test", ok: false },
    ]);
  });

  it("sin pasos y sin eventos devuelve []", () => {
    expect(pasosDeVerificacion(detalle(null, []))).toEqual([]);
  });
});
