/**
 * Métricas de la Mac: arma la parte `mac` de `Maquinas` (`src/contrato/api.ts`): memoria usada/total.
 * El revisor ya no corre en la Mac (desde el 2026-10-04 usa el llama-server de la PC), así que no se mide acá.
 *
 * Memoria: la total sale de `sysctl -n hw.memsize` (bytes) y el detalle de `vm_stat` (páginas).
 * Memoria usada = (Pages active + Pages wired down + Pages occupied by compressor) × tamaño de página.
 *
 * `medirMac` recibe `ejecutar` por parámetro para poder probarla con un doble:
 * en los tests no se corre ningún comando real (el sandbox no tiene macOS).
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { Maquinas } from "../contrato/api.js";

const GiB = 1024 ** 3;

export type Ejecutar = (comando: string, args: string[]) => Promise<string>;

/** Redondea a `decimales` decimales. */
function redondear(v: number, decimales: number): number {
  const f = 10 ** decimales;
  return Math.round(v * f) / f;
}

/**
 * Parsea la salida de `vm_stat`.
 * La primera línea da el tamaño de página: `Mach Virtual Memory Statistics: (page size of 16384 bytes)`.
 * Cada línea con la forma `<etiqueta>: <número>.` (la etiqueta puede venir entrecomillada,
 * p. ej. `"Translation faults"`) va a `paginas` con la etiqueta sin los dos puntos;
 * las demás líneas (incluida la cabecera) se ignoran.
 */
export function parsearVmStat(texto: string): { tamPagina: number; paginas: Record<string, number> } {
  const paginas: Record<string, number> = {};
  const lineas = texto.split(/\r?\n/);
  const cabecera = lineas[0]?.match(/page size of (\d+) bytes/);
  const tamPagina = cabecera?.[1] !== undefined ? Number(cabecera[1]) : 0;
  for (const cruda of lineas) {
    const [, , etiqueta, numero] = cruda.match(/^\s*(["'])?([^:]+?)\1:\s+(\d+)\.\s*$/) ?? [];
    if (etiqueta === undefined || numero === undefined) continue;
    paginas[etiqueta] = Number(numero);
  }
  return { tamPagina, paginas };
}

/**
 * Memoria de la Mac en GiB (1 decimal) a partir de `vm_stat` parseado y `hw.memsize` en bytes.
 * Si falta alguna de las tres claves de páginas, cuenta como 0.
 */
export function memoriaDeMac(
  vm: { tamPagina: number; paginas: Record<string, number> },
  memsizeBytes: number,
): { usadaGiB: number; totalGiB: number } {
  const paginasUsadas =
    (vm.paginas["Pages active"] ?? 0) + (vm.paginas["Pages wired down"] ?? 0) + (vm.paginas["Pages occupied by compressor"] ?? 0);
  return {
    usadaGiB: redondear((paginasUsadas * vm.tamPagina) / GiB, 1),
    totalGiB: redondear(memsizeBytes / GiB, 1),
  };
}

/**
 * Arma la parte `mac` de `Maquinas`: memoria (sysctl + vm_stat).
 * Si cualquiera de los dos comandos rechaza, la memoria queda `null` (no se propaga la excepción).
 */
export async function medirMac(ejecutar: Ejecutar): Promise<Maquinas["mac"]> {
  try {
    const [memsize, vmStat] = await Promise.all([ejecutar("sysctl", ["-n", "hw.memsize"]), ejecutar("vm_stat", [])]);
    const bytes = Number(memsize.trim());
    if (!Number.isFinite(bytes)) return { memoriaUsadaGiB: null, memoriaTotalGiB: null };
    const memoria = memoriaDeMac(parsearVmStat(vmStat), bytes);
    return { memoriaUsadaGiB: memoria.usadaGiB, memoriaTotalGiB: memoria.totalGiB };
  } catch {
    return { memoriaUsadaGiB: null, memoriaTotalGiB: null };
  }
}

/** Implementación real de Ejecutar con execFile de node:child_process. No se testea (no hay macOS en el sandbox). */
const execFileAsync = promisify(execFile);
export const ejecutarEnMac: Ejecutar = async (comando, args) => (await execFileAsync(comando, args)).stdout;
