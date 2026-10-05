import { describe, expect, it } from "vitest";
import type { EstadoPc } from "./api.js";
import { NOMBRE_ACCION, accionesVisibles, textoConfirmacion } from "./acciones.js";

const pc = (pausado: boolean): EstadoPc => ({
  ts: "2026-09-27T02:00:00Z",
  corriendo: true,
  pausado,
  actual: null,
  ultimaNoche: "2026-09-27",
});

describe("accionesVisibles", () => {
  it("noche pausada: reanudar", () => {
    expect(accionesVisibles(pc(true), true)).toEqual(["reanudar"]);
  });
  it("noche activa sin pausa: pausar", () => {
    expect(accionesVisibles(pc(false), true)).toEqual(["pausar"]);
  });
  it("sin noche: ningún botón", () => {
    expect(accionesVisibles(pc(false), false)).toEqual([]);
  });
  it("sin estado de la PC (null) y con noche activa: pausar", () => {
    expect(accionesVisibles(null, true)).toEqual(["pausar"]);
  });
});

describe("NOMBRE_ACCION", () => {
  it("nombres de los botones", () => {
    expect(NOMBRE_ACCION).toEqual({ pausar: "Pausar", reanudar: "Reanudar", juego: "Modo juego", reintentar: "Reintentar" });
  });
});

describe("textoConfirmacion", () => {
  it("pausar", () => {
    expect(textoConfirmacion("pausar")).toBe("Pausar la noche: no va a arrancar tareas nuevas.");
  });
  it("reanudar", () => {
    expect(textoConfirmacion("reanudar")).toBe("Reanudar la noche: vuelve a arrancar tareas.");
  });
  it("juego", () => {
    expect(textoConfirmacion("juego")).toBe("Modo juego: corta la tarea en curso y apaga el llama-server de la PC.");
  });
  it("reintentar incluye el id de la tarea", () => {
    expect(textoConfirmacion("reintentar", "demo/panel#1")).toBe(
      "Reintentar demo/panel#1: vuelve a la cola como lista para la próxima noche.",
    );
  });
  it("reintentar sin tarea no arma un texto con «undefined»", () => {
    expect(textoConfirmacion("reintentar")).toBe("Reintentar la tarea: vuelve a la cola como lista para la próxima noche.");
  });
});
