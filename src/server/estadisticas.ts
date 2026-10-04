/**
 * Estadísticas semanales: `GET /api/estadisticas?semanas=N`.
 *
 * Semanas de lunes a domingo, en hora de Argentina (UTC−3, sin horario de verano).
 * La semana «actual» es la que contiene a `hoy` en hora de Argentina: se restan 3 horas
 * a `hoy` y se usan los campos UTC del resultado. Una noche cuenta para la semana de su
 * `fecha` (el nombre de la carpeta) como fecha de calendario, sin convertir zonas.
 * `kWh` siempre es `null` (no hay muestras de potencia guardadas).
 */
import type { Estadisticas, ResultadoTarea } from "../contrato/api.js";
import type { Almacen } from "./almacen.js";

const OFFSET_ARGENTINA_MS = -3 * 60 * 60 * 1000;
const DIA_MS = 24 * 60 * 60 * 1000;

type Semana = Estadisticas["semanas"][number];
type NocheConResultados = { fecha: string; resultados: ResultadoTarea[] };

/** Lunes de la semana que contiene la fecha calendario (campos UTC) de `d`, como "AAAA-MM-DD". */
function lunesDe(d: Date): string {
  const domingo = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())).getUTCDay();
  const lunes = d.getUTCDate() - ((domingo + 6) % 7);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), lunes)).toISOString().slice(0, 10);
}

/** Lunes de la semana de una noche, tomada como fecha calendario sin convertir zonas. */
function lunesDeNoche(fecha: string): string {
  return lunesDe(new Date(Date.UTC(Number(fecha.slice(0, 4)), Number(fecha.slice(5, 7)) - 1, Number(fecha.slice(8, 10)))));
}

/** Hoy en hora de Argentina: restar 3 horas a `hoy`. */
function hoyArgentina(hoy: Date): Date {
  return new Date(hoy.getTime() + OFFSET_ARGENTINA_MS);
}

type SemanaAcumulada = {
  tareas: number;
  listas: number;
  duracionesMin: number[];
  rondas: number[];
};

/** Redondeo a 1 decimal: Math.round(x * 10) / 10. */
const redondear1 = (x: number) => Math.round(x * 10) / 10;

// Sobrecargas con literales: los tests de aceptación piden la semana por índice exacto
// (p. ej. `est.semanas[2]`) y el proyecto compila con `noUncheckedIndexedAccess`, así que
// con `semanas` literal el resultado se tipa como tupla de longitud exacta (sin `undefined`).
export function calcularEstadisticas(noches: NocheConResultados[], semanas: 1, hoy: Date): { semanas: [Semana] };
export function calcularEstadisticas(noches: NocheConResultados[], semanas: 2, hoy: Date): { semanas: [Semana, Semana] };
export function calcularEstadisticas(noches: NocheConResultados[], semanas: 3, hoy: Date): { semanas: [Semana, Semana, Semana] };
export function calcularEstadisticas(noches: NocheConResultados[], semanas: number, hoy: Date): Estadisticas;
/**
 * Pura. Devuelve exactamente `semanas` elementos, de la más vieja a la actual, incluidas las
 * semanas sin tareas (con ceros). Las noches con fecha fuera del rango se ignoran.
 */
export function calcularEstadisticas(noches: NocheConResultados[], semanas: number, hoy: Date): Estadisticas {
  const lunesActual = lunesDe(hoyArgentina(hoy));
  const porSemana = new Map<string, SemanaAcumulada>();

  for (const noche of noches) {
    const lunes = lunesDeNoche(noche.fecha);
    const acc = porSemana.get(lunes) ?? { tareas: 0, listas: 0, duracionesMin: [], rondas: [] };
    for (const r of noche.resultados) {
      acc.tareas += 1;
      if (r.estado === "lista") acc.listas += 1;
      // Las duraciones que no se pueden parsear no entran al promedio, pero la tarea sí cuenta.
      const inicio = Date.parse(r.inicio);
      const fin = Date.parse(r.fin);
      if (Number.isFinite(inicio) && Number.isFinite(fin)) acc.duracionesMin.push((fin - inicio) / 60_000);
      if (r.revision !== undefined && r.revision.estado !== "no-disponible") acc.rondas.push(r.revision.rondas);
    }
    porSemana.set(lunes, acc);
  }

  const salidas: Estadisticas["semanas"] = [];
  for (let i = semanas - 1; i >= 0; i--) {
    const desde = new Date(Date.parse(lunesActual) - i * 7 * DIA_MS).toISOString().slice(0, 10);
    const acc = porSemana.get(desde) ?? { tareas: 0, listas: 0, duracionesMin: [], rondas: [] };
    const minutosPromedio =
      acc.duracionesMin.length === 0 ? 0 : redondear1(acc.duracionesMin.reduce((a, b) => a + b, 0) / acc.duracionesMin.length);
    const rondasRevisionPromedio = acc.rondas.length === 0 ? 0 : redondear1(acc.rondas.reduce((a, b) => a + b, 0) / acc.rondas.length);
    salidas.push({
      desde,
      tareas: acc.tareas,
      listas: acc.listas,
      tasaExito: acc.tareas === 0 ? 0 : acc.listas / acc.tareas,
      minutosPromedio,
      rondasRevisionPromedio,
      kWh: null,
    });
  }

  return { semanas: salidas };
}

/** Proveedor de `Dependencias.estadisticas`: lee las noches del `Almacen` con `ahora()` como hoy. */
export function crearProveedorEstadisticas(op: {
  almacen: Almacen;
  ahora?: () => Date; // por defecto () => new Date()
}): (semanas: number) => Promise<Estadisticas> {
  const ahora = op.ahora ?? (() => new Date());
  return async (semanas) => {
    const noches = op.almacen.fechas().map((fecha) => ({ fecha, resultados: op.almacen.resultados(fecha) }));
    return calcularEstadisticas(noches, semanas, ahora());
  };
}
