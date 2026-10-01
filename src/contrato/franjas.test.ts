import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { Evento } from "./eventos.js";
import { parsearJsonl } from "./eventos.js";
import { franjas } from "./franjas.js";

// La noche de la spec: la PC corre las tareas, la Mac revisa, y hay eventos con `tarea: null`.
const eventos = parsearJsonl(readFileSync("test/fixtures/lab/logs/2026-09-27/events.jsonl", "utf8"));
const tramos = franjas(eventos);

describe("franjas() sobre la noche del 2026-09-27 (spec: línea de tiempo de la noche)", () => {
  it("devuelve 9 franjas: 8 con maquina pc y 1 con maquina mac", () => {
    expect(tramos).toHaveLength(9);
    expect(tramos.filter((f) => f.maquina === "pc")).toHaveLength(8);
    expect(tramos.filter((f) => f.maquina === "mac")).toHaveLength(1);
  });

  it("la primera franja es el inicio de #3, la única de la Mac es su revisión y la última de la PC es la implementación de #5", () => {
    expect(tramos.reduce((a, b) => (a.desde <= b.desde ? a : b))).toEqual({
      maquina: "pc",
      tarea: "demo/panel#3",
      etapa: "preparacion",
      desde: "2026-09-27T01:00:21.000Z",
      hasta: "2026-09-27T01:00:35.000Z",
    });
    expect(tramos.find((f) => f.maquina === "mac")).toEqual({
      maquina: "mac",
      tarea: "demo/panel#3",
      etapa: "revision",
      desde: "2026-09-27T01:02:55.000Z",
      hasta: "2026-09-27T01:03:05.000Z",
    });
    expect(tramos.filter((f) => f.maquina === "pc").reduce((a, b) => (a.hasta >= b.hasta ? a : b))).toEqual({
      maquina: "pc",
      tarea: "demo/panel#5",
      etapa: "implementacion",
      desde: "2026-09-27T01:03:47.000Z",
      hasta: "2026-09-27T01:04:15.000Z",
    });
  });

  it("la franja de verificacion de #3 no la cortan los eventos de la Mac que caen en el medio", () => {
    expect(tramos.find((f) => f.maquina === "pc" && f.tarea === "demo/panel#3" && f.etapa === "verificacion")).toEqual({
      maquina: "pc",
      tarea: "demo/panel#3",
      etapa: "verificacion",
      desde: "2026-09-27T01:02:27.000Z",
      hasta: "2026-09-27T01:03:12.000Z",
    });
  });
});

describe("franjas() sin eventos de tarea", () => {
  it("una lista vacía no devuelve franjas", () => {
    expect(franjas([])).toEqual([]);
  });

  it("una lista con solo eventos de tarea: null (noche/cola/sistema) tampoco devuelve franjas", () => {
    const sinTarea: Evento[] = eventos.filter((e) => e.tarea === null);
    expect(sinTarea.length).toBeGreaterThan(0);
    expect(franjas(sinTarea)).toEqual([]);
  });
});
