import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parsearJsonl, parsearLinea, partirTarea } from "./eventos.js";
import { aplicarEvento, estadoInicial, limiteTarea, MAX_HERRAMIENTAS, reducirEventos } from "./vivo.js";

const fixture = (f: string) => parsearJsonl(readFileSync(`test/fixtures/lab/logs/${f}/events.jsonl`, "utf8"));

describe("parsearLinea", () => {
  it("ignora líneas vacías, JSON roto y etapas desconocidas", () => {
    expect(parsearLinea("")).toBeNull();
    expect(parsearLinea("{roto")).toBeNull();
    expect(parsearLinea(JSON.stringify({ ts: "x", etapa: "otra", tipo: "y" }))).toBeNull();
  });
  it("completa maquina, tarea y datos con valores por defecto", () => {
    expect(parsearLinea(JSON.stringify({ ts: "t", etapa: "noche", tipo: "inicio" }))).toEqual({
      ts: "t",
      maquina: "pc",
      tarea: null,
      etapa: "noche",
      tipo: "inicio",
      datos: {},
    });
  });
  it("parte ids de tarea", () => {
    expect(partirTarea("demo/panel#5")).toEqual({ repo: "demo/panel", numero: 5 });
    expect(partirTarea("nada")).toBeNull();
  });
});

describe("reducirEventos con la noche de ejemplo", () => {
  const vivo = reducirEventos(fixture("2026-09-27"), "2026-09-27");

  it("la noche sigue activa y conoce su hora límite", () => {
    expect(vivo.noche).toMatchObject({ activa: true, hasta: "2026-09-27T10:59:00.000Z" });
  });
  it("la tarea #3 quedó terminada con su PR", () => {
    expect(vivo.terminadas).toEqual([
      expect.objectContaining({ id: "demo/panel#3", estado: "lista", pr: "https://github.com/demo/panel/pull/4" }),
    ]);
  });
  it("la tarea #5 está en implementación con sus turnos y herramientas", () => {
    expect(vivo.tarea).toMatchObject({ id: "demo/panel#5", titulo: "Vista de la cola", etapa: "implementacion", turnos: 2, tokens: 300 });
    expect(vivo.tarea?.herramientas.map((h) => h.resumen)).toEqual(["/nightshift/spec.md", "pnpm typecheck"]);
  });
  it("registra los avisos del sistema", () => {
    expect(vivo.avisos.map((a) => a.tipo)).toEqual(["sistema/llm-arranque"]);
  });
});

describe("aplicarEvento", () => {
  const base = { ts: "2026-09-27T01:00:00.000Z", maquina: "pc" as const, tarea: "a/b#1", datos: {} };

  it("no muta el estado anterior", () => {
    const antes = estadoInicial("2026-09-27");
    const copia = structuredClone(antes);
    aplicarEvento(antes, { ...base, etapa: "preparacion", tipo: "inicio", datos: { titulo: "x" } });
    expect(antes).toEqual(copia);
  });
  it("crea la tarea aunque no haya visto su inicio (panel conectado a mitad de la tarea)", () => {
    const s = aplicarEvento(estadoInicial(), { ...base, etapa: "implementacion", tipo: "turno", datos: { tokens: 10 } });
    expect(s.tarea).toMatchObject({ id: "a/b#1", turnos: 1, tokens: 10, etapa: "implementacion" });
  });
  it("guarda solo las últimas herramientas", () => {
    let s = estadoInicial();
    for (let i = 0; i < MAX_HERRAMIENTAS + 5; i++)
      s = aplicarEvento(s, { ...base, etapa: "implementacion", tipo: "herramienta", datos: { nombre: "bash", resumen: `c${i}` } });
    expect(s.tarea?.herramientas).toHaveLength(MAX_HERRAMIENTAS);
    expect(s.tarea?.herramientas.at(-1)?.resumen).toBe(`c${MAX_HERRAMIENTAS + 4}`);
  });
  it("la revisión se atribuye a la Mac", () => {
    const s = aplicarEvento(estadoInicial(), {
      ...base,
      maquina: "mac",
      etapa: "revision",
      tipo: "veredicto",
      datos: { veredicto: "cambios", problemas: ["p"] },
    });
    expect(s.tarea).toMatchObject({ maquina: "mac", revision: { veredicto: "cambios", problemas: ["p"] } });
  });
  it("noche/fin cierra la noche y suelta la tarea", () => {
    let s = aplicarEvento(estadoInicial(), { ...base, tarea: null, etapa: "noche", tipo: "inicio", datos: { hasta: "x" } });
    s = aplicarEvento(s, { ...base, etapa: "preparacion", tipo: "inicio" });
    s = aplicarEvento(s, { ...base, tarea: null, etapa: "noche", tipo: "fin", datos: { motivo: "cola vacía" } });
    expect(s.noche).toMatchObject({ activa: false, fin: { motivo: "cola vacía" } });
    expect(s.tarea).toBeNull();
  });
});

describe("limiteTarea", () => {
  it("usa lo que llegue primero entre maxHoras y el hasta de la noche", () => {
    const tarea = {
      inicio: "2026-09-27T01:00:00.000Z",
      presupuesto: { maxHoras: 1, maxTurnos: 1, prioridad: "media", fase: "dos" },
    } as never;
    expect(limiteTarea({ noche: { inicio: "", hasta: "2026-09-27T05:00:00.000Z", activa: true }, tarea })?.toISOString()).toBe(
      "2026-09-27T02:00:00.000Z",
    );
    expect(limiteTarea({ noche: { inicio: "", hasta: "2026-09-27T01:30:00.000Z", activa: true }, tarea })?.toISOString()).toBe(
      "2026-09-27T01:30:00.000Z",
    );
    expect(limiteTarea({ noche: null, tarea: null })).toBeNull();
  });
});
