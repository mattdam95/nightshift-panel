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
