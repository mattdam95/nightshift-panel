/**
 * Métricas de las máquinas: arma `Maquinas` (`src/contrato/api.ts`) para `GET /api/maquinas`.
 * La PC sale de la sonda del espejo (o de `sonda-pc.json` en dev/e2e) en cada pedido;
 * la Mac sale de `medirMac` (o de `mac.json` en dev/e2e) y se cachea 10 s.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { ConexionPc, Maquinas } from "../contrato/api.js";
import type { Sonda } from "./espejo.js";
import { pcDeSonda } from "./metricas.js";

/** La PC vista desde el espejo o desde los datos fijos. */
export interface FuentePc {
  sonda: Sonda | null;
  conexion: ConexionPc;
}

/** Mac sin datos: memoria null. */
export const MAC_VACIA: Maquinas["mac"] = {
  memoriaUsadaGiB: null,
  memoriaTotalGiB: null,
};

/**
 * Arma `Maquinas` en cada pedido: `ts` ISO (recalculado cada vez), la PC leída en cada pedido
 * (es memoria, no cuesta) y la Mac cacheada `ttlMacMs` (10 s por defecto).
 * Si `op.mac()` rechaza, la respuesta trae `MAC_VACIA` y el error no se propaga.
 */
export function crearProveedorMaquinas(op: {
  pc: () => Promise<FuentePc>;
  mac: () => Promise<Maquinas["mac"]>;
  ahora?: () => number;
  ttlMacMs?: number;
}): () => Promise<Maquinas> {
  const ahora = op.ahora ?? Date.now;
  const ttlMacMs = op.ttlMacMs ?? 10_000;
  let macEnCache: { leidaEn: number; valor: Maquinas["mac"] } | null = null;

  const macCacheada = async (): Promise<Maquinas["mac"]> => {
    if (macEnCache !== null && ahora() - macEnCache.leidaEn < ttlMacMs) return macEnCache.valor;
    try {
      const valor = await op.mac();
      macEnCache = { leidaEn: ahora(), valor };
      return valor;
    } catch {
      return MAC_VACIA; // sin datos de la Mac: no se propaga el error
    }
  };

  return async () => {
    const [fuentePc, mac] = await Promise.all([op.pc(), macCacheada()]);
    return { ts: new Date(ahora()).toISOString(), pc: pcDeSonda(fuentePc.sonda, fuentePc.conexion), mac };
  };
}

/**
 * La PC desde los datos fijos (dev/e2e): lee `<dir>/sonda-pc.json`.
 * Existe y parsea → `{ sonda, conexion: "conectada" }`; falta o no parsea → `{ sonda: null, conexion: "sin-espejo" }`.
 */
export function pcDeFixtures(dir: string): () => Promise<FuentePc> {
  return async () => {
    try {
      return { sonda: JSON.parse(readFileSync(join(dir, "sonda-pc.json"), "utf8")) as Sonda, conexion: "conectada" };
    } catch {
      return { sonda: null, conexion: "sin-espejo" };
    }
  };
}

/**
 * La Mac desde los datos fijos (dev/e2e): lee `<dir>/mac.json` (ya tiene la forma de `Maquinas["mac"]`).
 * Falta o no parsea → `MAC_VACIA`.
 */
export function macDeFixtures(dir: string): () => Promise<Maquinas["mac"]> {
  return async () => {
    try {
      return JSON.parse(readFileSync(join(dir, "mac.json"), "utf8")) as Maquinas["mac"];
    } catch {
      return MAC_VACIA;
    }
  };
}
