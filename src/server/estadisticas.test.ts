import { describe, expect, it } from "vitest";
import type { ResultadoTarea } from "../contrato/api.js";
import { Almacen } from "./almacen.js";
import { calcularEstadisticas, crearProveedorEstadisticas } from "./estadisticas.js";

/** Tarea de prueba: solo se fija lo que el criterio pide (estado, inicio/fin y revisión). */
function tarea(cambios: Partial<Pick<ResultadoTarea, "estado" | "inicio" | "fin" | "revision">> = {}): ResultadoTarea {
  return {
    tarea: "demo/panel#1",
    repo: "demo/panel",
    numero: 1,
    titulo: "Tarea de prueba",
    estado: "lista",
    motivo: "",
    inicio: "2026-09-28T01:00:00.000Z",
    fin: "2026-09-28T01:10:00.000Z",
    turnos: 1,
    tokens: 1,
    llamadas: 1,
    rondasAgente: 1,
    testsAceptacion: [],
    avisos: [],
    ...cambios,
  };
}

describe("calcularEstadisticas", () => {
  // Miércoles 30/09, 12:00 en Argentina: la semana actual empieza el lunes 2026-09-28.
  const HOY = new Date("2026-09-30T15:00:00Z");

  it("criterio 1: 3 semanas de la más vieja a la actual, con los totales de cada una", () => {
    const noches = [
      {
        fecha: "2026-09-28", // lunes
        resultados: [
          // A: lista de 10 min, revisada en 1 ronda.
          tarea({
            inicio: "2026-09-28T01:00:00.000Z",
            fin: "2026-09-28T01:10:00.000Z",
            revision: { estado: "aprobar", problemas: [], rondas: 1 },
          }),
          // B: bloqueada de 20 min, revisada en 3 rondas.
          tarea({
            estado: "bloqueada",
            inicio: "2026-09-28T02:00:00.000Z",
            fin: "2026-09-28T02:20:00.000Z",
            revision: { estado: "cambios", problemas: ["tocar el lockfile"], rondas: 3 },
          }),
        ],
      },
      {
        fecha: "2026-09-30", // miércoles: C, lista de 30 min, revisada en 2 rondas.
        resultados: [
          tarea({
            inicio: "2026-09-30T01:00:00.000Z",
            fin: "2026-09-30T01:30:00.000Z",
            revision: { estado: "aprobar", problemas: [], rondas: 2 },
          }),
        ],
      },
      {
        fecha: "2026-09-27", // domingo: F, lista de 15 min sin revisión → cuenta para la semana anterior.
        resultados: [tarea({ inicio: "2026-09-27T01:00:00.000Z", fin: "2026-09-27T01:15:00.000Z" })],
      },
      {
        fecha: "2026-09-22", // D: timeout de 45 min sin revisión.
        resultados: [tarea({ estado: "timeout", inicio: "2026-09-22T01:00:00.000Z", fin: "2026-09-22T01:45:00.000Z" })],
      },
      {
        fecha: "2026-09-13", // domingo de la semana 09-07: queda fuera del rango pedido.
        resultados: [tarea({ inicio: "2026-09-13T01:00:00.000Z", fin: "2026-09-13T01:30:00.000Z" })],
      },
    ];

    const est = calcularEstadisticas(noches, 3, HOY);
    expect(est.semanas.map((s) => s.desde)).toEqual(["2026-09-14", "2026-09-21", "2026-09-28"]);

    // Semana 09-14: sin tareas → todo en 0.
    expect(est.semanas[0]).toEqual({
      desde: "2026-09-14",
      tareas: 0,
      listas: 0,
      tasaExito: 0,
      minutosPromedio: 0,
      rondasRevisionPromedio: 0,
      kWh: null,
    });

    // Semana 09-21: F (15 min, lista) y D (45 min, timeout): promedio (15 + 45) / 2 = 30.
    expect(est.semanas[1]).toEqual({
      desde: "2026-09-21",
      tareas: 2,
      listas: 1,
      tasaExito: 0.5,
      minutosPromedio: 30,
      rondasRevisionPromedio: 0,
      kWh: null,
    });

    // Semana 09-28: A (10 min), B (20 min) y C (30 min); rondas (1 + 3 + 2) / 3 = 2.
    const ultima = est.semanas[2];
    expect(ultima.tareas).toBe(3);
    expect(ultima.listas).toBe(2);
    expect(ultima.tasaExito).toBeCloseTo(2 / 3);
    expect(ultima.minutosPromedio).toBe(20);
    expect(ultima.rondasRevisionPromedio).toBe(2);
    expect(ultima.kWh).toBeNull();
  });

  it("criterio 2: la semana actual se decide en hora de Argentina (2026-10-05T01:30Z todavía es domingo 4/10)", () => {
    const est = calcularEstadisticas([], 1, new Date("2026-10-05T01:30:00Z"));
    expect(est.semanas).toHaveLength(1);
    expect(est.semanas[0]?.desde).toBe("2026-09-28");
  });

  it("criterio 3: dos tareas de 60 s y 130 s dan minutosPromedio 1.6 (redondeo a 1 decimal)", () => {
    const noches = [
      {
        fecha: "2026-09-28",
        resultados: [
          tarea({ inicio: "2026-09-28T01:00:00.000Z", fin: "2026-09-28T01:01:00.000Z" }),
          tarea({ inicio: "2026-09-28T02:00:00.000Z", fin: "2026-09-28T02:02:10.000Z" }),
        ],
      },
    ];
    const [semana] = calcularEstadisticas(noches, 1, HOY).semanas;
    // (1 + 130/60) / 2 = 1.5833… → Math.round(1.5833… * 10) / 10 = 1.6
    expect(semana.minutosPromedio).toBe(1.6);
  });

  it("criterio 3: fin inválido cuenta en tareas pero no en minutos; revisión no-disponible no entra en rondas", () => {
    const noches = [
      {
        fecha: "2026-09-28",
        resultados: [
          tarea({
            inicio: "2026-09-28T01:00:00.000Z",
            fin: "2026-09-28T01:01:00.000Z",
            revision: { estado: "aprobar", problemas: [], rondas: 2 },
          }),
          tarea({
            inicio: "2026-09-28T02:00:00.000Z",
            fin: "2026-09-28T02:02:10.000Z",
            revision: { estado: "aprobar", problemas: [], rondas: 4 },
          }),
          // fin que no se puede parsear: cuenta en tareas, no en el promedio de minutos.
          // Su revisión no-disponible no entra al promedio de rondas.
          tarea({
            estado: "timeout",
            inicio: "2026-09-28T03:00:00.000Z",
            fin: "no es fecha",
            revision: { estado: "no-disponible", problemas: [], rondas: 99 },
          }),
        ],
      },
    ];
    const [semana] = calcularEstadisticas(noches, 1, HOY).semanas;
    expect(semana.tareas).toBe(3);
    expect(semana.minutosPromedio).toBe(1.6);
    // Solo entran las dos revisiones disponibles: (2 + 4) / 2 = 3.
    expect(semana.rondasRevisionPromedio).toBe(3);
  });

  it("criterio 4: semanas=1 devuelve solo la semana actual; noches=[] con semanas=4 devuelve 4 semanas en ceros", () => {
    const noches = [
      { fecha: "2026-09-29", resultados: [tarea({ inicio: "2026-09-29T01:00:00.000Z", fin: "2026-09-29T01:10:00.000Z" })] },
      { fecha: "2026-09-20", resultados: [tarea({ inicio: "2026-09-20T01:00:00.000Z", fin: "2026-09-20T01:10:00.000Z" })] },
    ];

    const una = calcularEstadisticas(noches, 1, HOY);
    expect(una.semanas).toHaveLength(1);
    expect(una.semanas[0]?.desde).toBe("2026-09-28");
    expect(una.semanas[0]?.tareas).toBe(1);

    const vacias = calcularEstadisticas([], 4, HOY);
    expect(vacias.semanas.map((s) => s.desde)).toEqual(["2026-09-07", "2026-09-14", "2026-09-21", "2026-09-28"]);
    for (const semana of vacias.semanas) {
      expect(semana).toEqual({
        desde: semana.desde,
        tareas: 0,
        listas: 0,
        tasaExito: 0,
        minutosPromedio: 0,
        rondasRevisionPromedio: 0,
        kWh: null,
      });
    }
  });
});

describe("crearProveedorEstadisticas", () => {
  it("criterio 5: sobre test/fixtures/lab (solo lee), con ahora 2026-09-30T15:00Z y semanas 2", async () => {
    const almacen = new Almacen("test/fixtures/lab");
    const proveedor = crearProveedorEstadisticas({ almacen, ahora: () => new Date("2026-09-30T15:00:00Z") });

    const est = await proveedor(2);
    expect(est.semanas.map((s) => s.desde)).toEqual(["2026-09-21", "2026-09-28"]);

    // Semana 09-21: las noches del fixture 09-26 (1 bloqueada) y 09-27 (1 lista).
    expect(est.semanas[0]).toMatchObject({ desde: "2026-09-21", tareas: 2, listas: 1, tasaExito: 0.5 });
    // Semana 09-28 (la actual, parcial): todavía no hay noches del fixture.
    expect(est.semanas[1]).toMatchObject({ desde: "2026-09-28", tareas: 0 });
  });
});
