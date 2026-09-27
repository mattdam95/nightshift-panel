import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import type { Evento, EstadoTarea } from "../contrato/eventos.js";
import { parsearJsonl } from "../contrato/eventos.js";
import type { DetalleNoche, ResultadoTarea, ResumenNoche } from "../contrato/api.js";

const FECHA = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Lee la copia local de `/srv/lab` (misma estructura que en la PC):
 *   <raiz>/logs/<fecha>/events.jsonl
 *   <raiz>/state/noches/<fecha>.json
 *   <raiz>/reports/<fecha>.md
 * No hay base de datos: se parsea bajo demanda, con caché por tamaño y fecha de modificación.
 */
export class Almacen {
  private cache = new Map<string, { clave: string; eventos: Evento[] }>();

  constructor(readonly raiz: string) {}

  archivoEventos(fecha: string): string {
    return join(this.raiz, "logs", fecha, "events.jsonl");
  }

  /** Fechas con carpeta de logs, de la más vieja a la más nueva. */
  fechas(): string[] {
    const dir = join(this.raiz, "logs");
    if (!existsSync(dir)) return [];
    return readdirSync(dir)
      .filter((d) => FECHA.test(d) && existsSync(this.archivoEventos(d)))
      .sort();
  }

  ultimaFecha(): string | null {
    return this.fechas().at(-1) ?? null;
  }

  eventos(fecha: string): Evento[] {
    if (!FECHA.test(fecha)) return [];
    const archivo = this.archivoEventos(fecha);
    if (!existsSync(archivo)) return [];
    const st = statSync(archivo);
    const clave = `${st.size}:${st.mtimeMs}`;
    const hit = this.cache.get(fecha);
    if (hit?.clave === clave) return hit.eventos;
    const eventos = parsearJsonl(readFileSync(archivo, "utf8"));
    this.cache.set(fecha, { clave, eventos });
    return eventos;
  }

  /** Líneas tal cual (sin parsear), para que los ids SSE coincidan con el número de línea. */
  eventosCrudos(fecha: string): string[] {
    const archivo = this.archivoEventos(fecha);
    return FECHA.test(fecha) && existsSync(archivo) ? readFileSync(archivo, "utf8").split("\n") : [];
  }

  resultados(fecha: string): ResultadoTarea[] {
    if (!FECHA.test(fecha)) return [];
    const archivo = join(this.raiz, "state", "noches", `${fecha}.json`);
    if (!existsSync(archivo)) return [];
    try {
      const lista = JSON.parse(readFileSync(archivo, "utf8")) as unknown;
      return Array.isArray(lista) ? (lista as ResultadoTarea[]) : [];
    } catch {
      return [];
    }
  }

  reporte(fecha: string): string | null {
    if (!FECHA.test(fecha)) return null;
    const archivo = join(this.raiz, "reports", `${fecha}.md`);
    return existsSync(archivo) ? readFileSync(archivo, "utf8") : null;
  }

  resumen(fecha: string): ResumenNoche {
    const eventos = this.eventos(fecha);
    const noche = eventos.filter((e) => e.etapa === "noche");
    const inicio = noche.find((e) => e.tipo === "inicio")?.ts ?? eventos[0]?.ts ?? null;
    const ultimoFin = noche.filter((e) => e.tipo === "fin").at(-1);
    // Si hubo un `inicio` después del último `fin`, la noche sigue abierta.
    const ultimoInicio = noche.filter((e) => e.tipo === "inicio").at(-1);
    const cerrada = ultimoFin && (!ultimoInicio || ultimoFin.ts >= ultimoInicio.ts);
    const estados: Partial<Record<EstadoTarea, number>> = {};
    const resultados = this.resultados(fecha);
    for (const r of resultados) estados[r.estado] = (estados[r.estado] ?? 0) + 1;
    return {
      fecha,
      inicio,
      fin: cerrada ? ultimoFin.ts : null,
      motivoFin: cerrada ? String(ultimoFin.datos.motivo ?? "") : null,
      estados,
      tareas: resultados.length,
      hayReporte: this.reporte(fecha) !== null,
    };
  }

  detalle(fecha: string): DetalleNoche | null {
    if (!this.fechas().includes(fecha)) return null;
    return { ...this.resumen(fecha), resultados: this.resultados(fecha) };
  }
}
