import type { Etapa, Evento, Maquina } from "./eventos.js";

export interface Franja {
  maquina: Maquina;
  tarea: string;
  etapa: Etapa;
  /** ISO, igual que el `ts` del evento. */
  desde: string;
  hasta: string;
}

/**
 * Particiona los eventos de una noche en franjas de `(maquina, tarea, etapa)` contiguas.
 *
 * - Los eventos con `tarea: null` (noche, cola, sistema) se ignoran: no inician ni cortan franjas.
 * - `desde` = `ts` del primer evento del tramo. `hasta` = `ts` del siguiente evento **de la misma
 *   máquina** con otra tarea u otra etapa (los eventos de la otra máquina no cortan la franja).
 * - La última franja de cada máquina termina en el `ts` del último evento de esa máquina,
 *   no en el último de la noche.
 */
export function franjas(eventos: Evento[]): Franja[] {
  const resultado: Franja[] = [];
  const abierta = new Map<Maquina, Franja>();
  const ultimoEvento = new Map<Maquina, string>();

  for (const ev of eventos) {
    ultimoEvento.set(ev.maquina, ev.ts);
    if (ev.tarea === null) continue;
    const actual = abierta.get(ev.maquina);
    if (actual && actual.tarea === ev.tarea && actual.etapa === ev.etapa) continue;
    if (actual) actual.hasta = ev.ts;
    const nueva: Franja = { maquina: ev.maquina, tarea: ev.tarea, etapa: ev.etapa, desde: ev.ts, hasta: ev.ts };
    abierta.set(ev.maquina, nueva);
    resultado.push(nueva);
  }

  for (const [maquina, ultima] of abierta) {
    const ts = ultimoEvento.get(maquina);
    if (ts && ts > ultima.hasta) ultima.hasta = ts;
  }

  return resultado;
}

export interface SegmentoFila {
  etapa: Etapa;
  maquina: Maquina;
  desde: string;
  hasta: string;
  ms: number;
  /** Posición del inicio en el eje de la noche, 0–100 (% del rango `ini`–`fin`). */
  izquierda: number;
  /** Largo en el eje de la noche, 0–100. */
  ancho: number;
}

/** Una tarea de la noche: sus franjas como segmentos sobre el eje común. */
export interface FilaTarea {
  tarea: string;
  /** `desde` de la primera franja de la tarea. */
  desde: string;
  /** `hasta` de la última franja de la tarea. */
  hasta: string;
  /** `hasta` − `desde` en ms (incluye los huecos entre franjas). */
  ms: number;
  segmentos: SegmentoFila[];
}

/**
 * Agrupa las franjas por tarea (una fila por tarea, en el orden en que aparece por primera vez) y calcula la
 * posición de cada una sobre el eje `ini`–`fin` (ms). Con `fin <= ini` no hay escala: `izquierda` y `ancho` valen 0.
 */
export function filasPorTarea(tramos: Franja[], ini: number, fin: number): FilaTarea[] {
  const rango = fin - ini;
  const filas = new Map<string, FilaTarea>();
  for (const f of tramos) {
    const desde = Date.parse(f.desde);
    const hasta = Date.parse(f.hasta);
    const segmento: SegmentoFila = {
      etapa: f.etapa,
      maquina: f.maquina,
      desde: f.desde,
      hasta: f.hasta,
      ms: hasta - desde,
      izquierda: rango > 0 ? ((desde - ini) / rango) * 100 : 0,
      ancho: rango > 0 ? ((hasta - desde) / rango) * 100 : 0,
    };
    const fila = filas.get(f.tarea);
    if (fila) {
      fila.hasta = f.hasta;
      fila.ms = Date.parse(f.hasta) - Date.parse(fila.desde);
      fila.segmentos.push(segmento);
    } else {
      filas.set(f.tarea, { tarea: f.tarea, desde: f.desde, hasta: f.hasta, ms: hasta - desde, segmentos: [segmento] });
    }
  }
  return [...filas.values()];
}

/** Ancho mínimo (en % del eje) con el que se toma un segmento casi nulo al elegir con el dedo. */
const ANCHO_MIN_SEGMENTO = 0.6;

/**
 * Índice del segmento que contiene `pct` (0 a 100). Un segmento casi nulo se toma con un ancho mínimo de 0,6. Si varios lo
 * contienen (la revisión de la Mac sobre otra etapa) gana el último, que es el que se dibuja encima. Si ninguno lo contiene,
 * el de centro más cercano; sin segmentos, -1.
 */
export function segmentoEn(segmentos: SegmentoFila[], pct: number): number {
  let elegido = -1;
  segmentos.forEach((s, i) => {
    if (pct >= s.izquierda && pct <= s.izquierda + Math.max(s.ancho, ANCHO_MIN_SEGMENTO)) elegido = i;
  });
  if (elegido >= 0) return elegido;

  let mejor = -1;
  let distancia = Infinity;
  segmentos.forEach((s, i) => {
    const d = Math.abs(s.izquierda + Math.max(s.ancho, ANCHO_MIN_SEGMENTO) / 2 - pct);
    if (d < distancia) {
      distancia = d;
      mejor = i;
    }
  });
  return mejor;
}

/** Los segmentos ampliados `zoom` veces alrededor de `pct`, que queda en el 50 % de la lupa. */
export function segmentosLupa(segmentos: SegmentoFila[], pct: number, zoom: number): { izquierda: number; ancho: number }[] {
  return segmentos.map((s) => ({ izquierda: (s.izquierda - pct) * zoom + 50, ancho: s.ancho * zoom }));
}
