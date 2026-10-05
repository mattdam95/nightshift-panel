import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { Evento } from "./eventos.js";
import { parsearJsonl } from "./eventos.js";
import { filasPorTarea, franjas, segmentoEn, segmentosLupa, type Franja, type SegmentoFila } from "./franjas.js";

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

/** Segundos desde el epoch → ISO, para armar franjas inventadas con un eje de 0 a 1000 s. */
const seg = (s: number) => new Date(s * 1000).toISOString();
const franja = (tarea: string, etapa: Franja["etapa"], maquina: Franja["maquina"], desde: number, hasta: number): Franja => ({
  tarea,
  etapa,
  maquina,
  desde: seg(desde),
  hasta: seg(hasta),
});

describe("filasPorTarea()", () => {
  const entrada = [
    franja("a/b#1", "tests", "pc", 0, 200),
    franja("a/b#1", "revision", "mac", 200, 500),
    franja("a/b#2", "preparacion", "pc", 500, 1000),
  ];

  it("arma una fila por tarea, en el orden en que aparece por primera vez", () => {
    const filas = filasPorTarea(entrada, 0, 1_000_000);
    expect(filas.map((f) => f.tarea)).toEqual(["a/b#1", "a/b#2"]);
    expect(filas[0]!.segmentos).toHaveLength(2);
    expect(filas[1]!.segmentos).toHaveLength(1);
  });

  it("desde y hasta de la fila son la primera y la última franja; ms es la diferencia", () => {
    const [primera] = filasPorTarea(entrada, 0, 1_000_000);
    expect(primera).toMatchObject({ desde: seg(0), hasta: seg(500), ms: 500_000 });
  });

  it("izquierda y ancho son porcentajes del rango [ini, fin]", () => {
    const filas = filasPorTarea(entrada, 0, 1_000_000);
    expect(filas[0]!.segmentos[0]).toMatchObject({ etapa: "tests", maquina: "pc", ms: 200_000, izquierda: 0, ancho: 20 });
    expect(filas[0]!.segmentos[1]).toMatchObject({ etapa: "revision", maquina: "mac", ms: 300_000, izquierda: 20, ancho: 30 });
    expect(filas[1]!.segmentos[0]).toMatchObject({ izquierda: 50, ancho: 50 });
  });

  it("un rango que no arranca en 0 desplaza la izquierda", () => {
    const [fila] = filasPorTarea([franja("a/b#1", "tests", "pc", 600, 700)], 500_000, 1_500_000);
    expect(fila!.segmentos[0]!.izquierda).toBeCloseTo(10);
    expect(fila!.segmentos[0]!.ancho).toBeCloseTo(10);
  });

  it("con fin igual a ini, izquierda y ancho valen 0 en todos los segmentos", () => {
    const filas = filasPorTarea(entrada, 0, 0);
    for (const fila of filas) {
      for (const s of fila.segmentos) expect(s).toMatchObject({ izquierda: 0, ancho: 0 });
    }
  });

  it("una tarea cuyas franjas no son contiguas queda en la fila de su primera aparición", () => {
    const filas = filasPorTarea(
      [franja("a/b#1", "tests", "pc", 0, 100), franja("a/b#2", "tests", "pc", 100, 200), franja("a/b#1", "entrega", "pc", 200, 300)],
      0,
      300_000,
    );
    expect(filas.map((f) => f.tarea)).toEqual(["a/b#1", "a/b#2"]);
    expect(filas[0]!.segmentos.map((s) => s.etapa)).toEqual(["tests", "entrega"]);
    expect(filas[0]!.hasta).toBe(seg(300));
  });

  it("sin franjas devuelve una lista vacía", () => {
    expect(filasPorTarea([], 0, 1000)).toEqual([]);
  });

  it("sobre el fixture del 2026-09-27 da dos filas: #3 con 6 segmentos y #5 con 3", () => {
    const ts = eventos.map((e) => Date.parse(e.ts));
    const filas = filasPorTarea(tramos, Math.min(...ts), Math.max(...ts));
    expect(filas.map((f) => [f.tarea, f.segmentos.length])).toEqual([
      ["demo/panel#3", 6],
      ["demo/panel#5", 3],
    ]);
  });
});

/** Segmento inventado sobre el eje 0–100 (solo importan `izquierda` y `ancho`). */
const seg100 = (izquierda: number, ancho: number): SegmentoFila => ({
  etapa: "tests",
  maquina: "pc",
  desde: seg(0),
  hasta: seg(0),
  ms: 0,
  izquierda,
  ancho,
});

describe("segmentoEn()", () => {
  const segmentos = [seg100(0, 20), seg100(20, 30), seg100(50, 0.1)];

  it("devuelve el índice del segmento que contiene el punto", () => {
    expect(segmentoEn(segmentos, 10)).toBe(0);
    expect(segmentoEn(segmentos, 25)).toBe(1);
  });

  it("un segmento casi nulo se toma con un ancho mínimo de 0,6", () => {
    expect(segmentoEn(segmentos, 50.4)).toBe(2);
  });

  it("si ningún segmento lo contiene, devuelve el de centro más cercano", () => {
    expect(segmentoEn(segmentos, 80)).toBe(2);
    expect(segmentoEn([seg100(10, 5), seg100(60, 5)], 30)).toBe(0);
    expect(segmentoEn([seg100(10, 5), seg100(60, 5)], 45)).toBe(1);
  });

  it("si varios lo contienen (una revisión de la Mac sobre otra etapa), gana el último, que es el que se dibuja encima", () => {
    expect(segmentoEn([seg100(10, 30), seg100(20, 5)], 22)).toBe(1);
  });

  it("sin segmentos devuelve -1", () => {
    expect(segmentoEn([], 50)).toBe(-1);
  });
});

describe("segmentosLupa()", () => {
  it("con pct 50 y zoom 6, un segmento que empezaba en 50 queda en 50 y su ancho se multiplica por 6", () => {
    expect(segmentosLupa([seg100(50, 5)], 50, 6)).toEqual([{ izquierda: 50, ancho: 30 }]);
  });

  it("izquierda = (izquierda − pct) × zoom + 50", () => {
    expect(segmentosLupa([seg100(40, 2), seg100(55, 1)], 50, 6)).toEqual([
      { izquierda: -10, ancho: 12 },
      { izquierda: 80, ancho: 6 },
    ]);
  });
});
