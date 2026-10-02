/**
 * Detalle de una tarea: el resultado en la noche más nueva donde aparece, sus eventos
 * y la spec (cuerpo del issue). La ruta `GET /api/tareas/:owner/:repo/:numero`
 * (`src/server/app.ts`) usa el proveedor y responde 404 si devuelve `null`.
 *
 * El `id` tiene la forma `owner/repo#N`: la parte `owner/repo` es el repo de GitHub.
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { DetalleTarea, ResultadoTarea } from "../contrato/api.js";
import type { Evento } from "../contrato/eventos.js";
import { partirTarea } from "../contrato/eventos.js";
import type { Almacen } from "./almacen.js";
import { ejecutarEnMac, type Ejecutar } from "./mac.js";

/** Trae el cuerpo (spec) de un issue. `null` si no se pudo. */
export type TraerSpec = (repo: string, numero: number) => Promise<string | null>;

/** Noche más nueva donde la tarea tiene resultado o eventos. null si el id es inválido o no aparece en ninguna. */
export function ubicarTarea(almacen: Almacen, id: string): { fecha: string; resultado: ResultadoTarea | null; eventos: Evento[] } | null {
  if (partirTarea(id) === null) return null;
  let mejor: { fecha: string; resultado: ResultadoTarea | null; eventos: Evento[] } | null = null;
  // `fechas()` va de la más vieja a la más nueva: cada noche que la tiene la reescribe, y la última gana.
  for (const fecha of almacen.fechas()) {
    const eventos = almacen.eventos(fecha).filter((e) => e.tarea === id);
    const resultado = almacen.resultados(fecha).find((r) => r.tarea === id) ?? null;
    if (eventos.length === 0 && resultado === null) continue;
    mejor = { fecha, resultado, eventos };
  }
  return mejor;
}

/**
 * Crea el proveedor del detalle de una tarea: devuelve `{ id, fecha, resultado, eventos, spec }`,
 * o `null` si la tarea no aparece en ninguna noche (sin pedir la spec en ese caso).
 * La spec se cachea por id durante `ttlSpecMs` (5 min por defecto) y solo se cachean los éxitos:
 * un `null` o un rechazo se vuelve a pedir el próximo pedido.
 */
export function crearProveedorTarea(op: {
  almacen: Almacen;
  traerSpec: TraerSpec;
  ahora?: () => number; // por defecto Date.now
  ttlSpecMs?: number; // por defecto 300_000
}): (id: string) => Promise<DetalleTarea | null> {
  const ahora = op.ahora ?? Date.now;
  const ttlSpecMs = op.ttlSpecMs ?? 300_000;
  const cache = new Map<string, { spec: string; ts: number }>();

  return async (id) => {
    const parte = partirTarea(id);
    if (parte === null) return null;
    const ubicada = ubicarTarea(op.almacen, id);
    if (ubicada === null) return null;
    const hit = cache.get(id);
    let spec: string | null = null;
    if (hit !== undefined && ahora() - hit.ts < ttlSpecMs) {
      spec = hit.spec;
    } else {
      try {
        const cuerpo = await op.traerSpec(parte.repo, parte.numero);
        if (cuerpo !== null) {
          cache.set(id, { spec: cuerpo, ts: ahora() });
          spec = cuerpo;
        }
      } catch {
        spec = null;
      }
    }
    return { id, fecha: ubicada.fecha, resultado: ubicada.resultado, eventos: ubicada.eventos, spec };
  };
}

/**
 * Lee `<dir>/issues/<owner>_<repo>-<n>.json` ({ "body": "..." }) y devuelve el `body`.
 * Falta el archivo, no parsea o no tiene `body` string → `null`.
 */
export function specDeFixtures(dir: string): TraerSpec {
  return async (repo, numero) => {
    try {
      const crudo = await readFile(join(dir, "issues", `${repo.replaceAll("/", "_")}-${numero}.json`), "utf8");
      const json = JSON.parse(crudo) as { body?: unknown };
      return typeof json.body === "string" ? json.body : null;
    } catch {
      return null;
    }
  };
}

/**
 * `gh issue view <n> -R <repo> --json body` y devuelve el `body`.
 * Si `ejecutar` rechaza o la salida no es JSON con `body` → `null`.
 */
export function specDeGh(ejecutar: Ejecutar = ejecutarEnMac): TraerSpec {
  return async (repo, numero) => {
    try {
      const salida = await ejecutar("gh", ["issue", "view", String(numero), "-R", repo, "--json", "body"]);
      const json = JSON.parse(salida) as { body?: unknown };
      return typeof json.body === "string" ? json.body : null;
    } catch {
      return null;
    }
  };
}
