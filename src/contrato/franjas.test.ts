import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { Evento } from "./eventos.js";
import { parsearJsonl } from "./eventos.js";
import { franjas } from "./franjas.js";

/**
 * Aceptación de `franjas()` (spec: Línea de tiempo de la noche (franjas por máquina)).
 * La función pura se prueba acá con vitest; el componente `LineaTiempo` se prueba en `e2e/linea-tiempo.spec.ts`.
 *
 * La noche de prueba es el fixture `test/fixtures/lab/logs/2026-09-27/events.jsonl`:
 * la PC corre las tareas #3 y #5, la Mac revisa #3, y hay eventos con `tarea: null`
 * (noche, cola, sistema) que `franjas()` tiene que ignorar.
 */
const eventos = parsearJsonl(readFileSync("test/fixtures/lab/logs/2026-09-27/events.jsonl", "utf8"));
const tramos = franjas(eventos);

describe("franjas() sobre la noche del 2026-09-27 (spec: línea de tiempo de la noche)", () => {
  it("devuelve 9 franjas: 8 con maquina pc y 1 con maquina mac", () => {
    expect(tramos).toHaveLength(9);
    expect(tramos.filter((f) => f.maquina === "pc")).toHaveLength(8);
    expect(tramos.filter((f) => f.maquina === "mac")).toHaveLength(1);
  });

  it("la primera franja es el inicio de #3, la única de la Mac es su revisión y la última de la PC es la implementación de #5", () => {
    // La primera de la noche: la franja con el `desde` más antiguo.
    const primera = tramos.reduce((a, b) => (a.desde <= b.desde ? a : b));
    expect(primera).toEqual({
      maquina: "pc",
      tarea: "demo/panel#3",
      etapa: "preparacion",
      desde: "2026-09-27T01:00:21.000Z",
      hasta: "2026-09-27T01:00:35.000Z",
    });

    // La única franja de la Mac: la revisión de #3.
    expect(tramos.find((f) => f.maquina === "mac")).toEqual({
      maquina: "mac",
      tarea: "demo/panel#3",
      etapa: "revision",
      desde: "2026-09-27T01:02:55.000Z",
      hasta: "2026-09-27T01:03:05.000Z",
    });

    // La última de la PC: termina en el ts del último evento de esa máquina.
    const ultima = tramos.filter((f) => f.maquina === "pc").reduce((a, b) => (a.hasta >= b.hasta ? a : b));
    expect(ultima).toEqual({
      maquina: "pc",
      tarea: "demo/panel#5",
      etapa: "implementacion",
      desde: "2026-09-27T01:03:47.000Z",
      hasta: "2026-09-27T01:04:15.000Z",
    });
  });

  it("la franja de verificación de #3 va de 01:02:27 a 01:03:12: los eventos de la Mac que caen en el medio no la cortan", () => {
    expect(tramos.find((f) => f.maquina === "pc" && f.tarea === "demo/panel#3" && f.etapa === "verificacion")).toEqual({
      maquina: "pc",
      tarea: "demo/panel#3",
      etapa: "verificacion",
      desde: "2026-09-27T01:02:27.000Z",
      hasta: "2026-09-27T01:03:12.000Z",
    });
  });
});

describe("franjas() sin eventos de tarea (los eventos con tarea null se ignoran)", () => {
  it("una lista vacía devuelve []", () => {
    expect(franjas([])).toEqual([]);
  });

  it("una lista con solo eventos de `tarea: null` (noche/cola/sistema) también devuelve []", () => {
    const sinTarea: Evento[] = eventos.filter((e) => e.tarea === null);
    expect(sinTarea).not.toHaveLength(0); // el fixture sí los trae
    expect(franjas(sinTarea)).toEqual([]);
  });
});
