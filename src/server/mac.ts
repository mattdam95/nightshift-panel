import { execFile } from "node:child_process";
import type { Maquinas, MetricasLlm } from "../contrato/api.js";

/**
 * Métricas de la Mac: memoria (sysctl + vm_stat) y salud del revisor (llama-server).
 *
 * `ejjecutar` y `pedir` entran por parámetro para poder probar `medirMac` con dobles: en los tests
 * no se corre ningún comando real ni se hace ningún fetch real (el sandbox no tiene macOS ni red).
 * `ejecutarEnMac` es la implementación real, la que usa la issue #5 al armar GET /api/maquinas.
 */

export type Ejecutar = (comando: string, args: string[]) => Promise<string>;
export type Pedir = (url: string, opciones: { signal: AbortSignal }) => Promise<{ ok: boolean; status: number }>;

/** Dirección por defecto del revisor (llama-server) en la Mac. */
export const REVISOR_URL_DEFECTO = "http://100.100.215.96:8081";

/** `<etiqueta>: <número>.` — la forma que usa vm_stat en cada línea de páginas (el punto final es de macOS). */
const LINEA_PAGINA = /^"?(.+?)"?:\s*(\d+)\.\s*$/;

/**
 * Parsea la salida de `vm_stat`. El tamaño de página sale de la primera línea
 * ("Mach Virtual Memory Statistics: (page size of 16384 bytes)"); las claves de `paginas` son la
 * etiqueta sin los dos puntos (y sin las comillas que vm_stat pone en "Translation faults") y los
 * valores son números sin el punto final. Las líneas que no tienen la forma `<etiqueta>: <número>.`
 * se ignoran (la cabecera, por ejemplo).
 */
export function parsearVmStat(texto: string): { tamPagina: number; paginas: Record<string, number> } {
  const lineas = texto.split(/\r?\n/);
  const primera = lineas[0] ?? "";
  const mTamPagina = primera.match(/page size of (\d+) bytes/);
  const mTamPaginaNumero = mTamPagina?.[1];
  const tamPagina = mTamPaginaNumero !== undefined ? Number(mTamPaginaNumero) : 0;
  const paginas: Record<string, number> = {};
  for (const linea of lineas) {
    const m = linea.match(LINEA_PAGINA);
    if (!m) continue;
    const etiqueta = m[1];
    const numero = m[2];
    if (etiqueta !== undefined && numero !== undefined) paginas[etiqueta] = Number(numero);
  }
  return { tamPagina, paginas };
}

/** Claves de páginas que cuentan como memoria usada. */
const CLAVES_USADAS = ["Pages active", "Pages wired down", "Pages occupied by compressor"] as const;

/** Redondeo a 1 decimal. */
const redondear1 = (n: number) => Math.round(n * 10) / 10;

/** Memoria usada/total en GiB. Si falta alguna clave de páginas, cuenta como 0. */
export function memoriaDeMac(
  vm: { tamPagina: number; paginas: Record<string, number> },
  memsizeBytes: number,
): { usadaGiB: number; totalGiB: number } {
  const paginasUsadas = CLAVES_USADAS.reduce((n, clave) => n + (vm.paginas[clave] ?? 0), 0);
  return {
    usadaGiB: redondear1((paginasUsadas * vm.tamPagina) / 1024 ** 3),
    totalGiB: redondear1(memsizeBytes / 1024 ** 3),
  };
}

/** Salud del revisor: 200 → "ok", otro código → "caido", pedir que rechaza → "apagado". */
async function saludRevisor(pedir: Pedir, revisorUrl: string): Promise<MetricasLlm> {
  let salud: MetricasLlm["salud"] = "apagado";
  try {
    const r = await pedir(`${revisorUrl}/health`, { signal: AbortSignal.timeout(2000) });
    salud = r.ok ? "ok" : "caido";
  } catch {
    salud = "apagado";
  }
  // Los tok/s y las peticiones en curso vienen con /metrics, que el revisor todavía no expone.
  return { salud, tokPorSegGeneracion: null, tokPorSegPrompt: null, peticionesEnCurso: null };
}

/** Memoria y revisor en paralelo: un fallo de memoria no arrastra el resto del resultado. */
export async function medirMac(ejecutar: Ejecutar, pedir: Pedir, revisorUrl?: string): Promise<Maquinas["mac"]> {
  const urlRevisor = revisorUrl ?? REVISOR_URL_DEFECTO;
  const memoria = async (): Promise<{ usadaGiB: number; totalGiB: number } | null> => {
    try {
      const [memsize, vmStat] = await Promise.all([ejecutar("sysctl", ["-n", "hw.memsize"]), ejecutar("vm_stat", [])]);
      const bytes = Number(memsize.trim());
      if (!Number.isFinite(bytes)) return null;
      return memoriaDeMac(parsearVmStat(vmStat), bytes);
    } catch {
      return null; // Sin sysctl o sin vm_stat no se puede medir: null, sin propagar.
    }
  };
  const [mem, revisor] = await Promise.all([memoria(), saludRevisor(pedir, urlRevisor)]);
  return { memoriaUsadaGiB: mem?.usadaGiB ?? null, memoriaTotalGiB: mem?.totalGiB ?? null, revisor };
}

/** Implementación real de Ejecutar con execFile de node:child_process. No se testea (no hay macOS en el sandbox). */
export const ejecutarEnMac: Ejecutar = (comando, args) =>
  new Promise((resolve, reject) => {
    execFile(comando, args, (err, stdout) => {
      if (err) reject(err);
      else resolve(stdout);
    });
  });
