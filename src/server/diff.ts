/**
 * Diff de una tarea: el que está en la PC si la tarea está corriendo (diff contra su base,
 * leído del repo de trabajo) o el de su PR si ya se entregó (`gh pr diff`).
 * La ruta `GET /api/tareas/:owner/:repo/:numero/diff` (`src/server/app.ts`) usa el
 * proveedor y responde 404 si devuelve `null`.
 *
 * El `id` tiene la forma `owner/repo#N`.
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Evento } from "../contrato/eventos.js";
import { partirTarea } from "../contrato/eventos.js";
import type { Almacen } from "./almacen.js";
import { ejecutarEnMac, type Ejecutar } from "./mac.js";
import { ubicarTarea } from "./tareas.js";

/** Nombre de la carpeta de la tarea en el lab (y del fixture): `owner_repo-n`. */
function idCarpeta(id: string): string | null {
  const parte = partirTarea(id);
  return parte ? `${parte.repo.replaceAll("/", "_")}-${parte.numero}` : null;
}

/** `datos.base` del último evento `preparacion`/`fin` de la tarea. `null` si no hay o no es string. */
export function baseDeTarea(eventos: Evento[]): string | null {
  let base: string | null = null;
  for (const ev of eventos) {
    if (ev.etapa === "preparacion" && ev.tipo === "fin" && typeof ev.datos.base === "string") base = ev.datos.base;
  }
  return base;
}

/**
 * Crea el proveedor del diff de una tarea: devuelve el texto del diff o `null` (la ruta
 * responde 404). La tarea está «en curso» si `tareaEnCurso() === id`: el diff se toma de la PC
 * (`diffEnCurso`) contra la base de su último evento `preparacion`/`fin`; si no, se toma del PR
 * (`diffPr`) si el resultado tiene `pr`. Un id inválido o una tarea que no aparece en ninguna
 * noche → `null` sin llamar a ninguna fuente.
 *
 * Caché por id de solo los éxitos (un error se vuelve a intentar): cada entrada guarda de qué
 * fuente salió el diff (`fuente`). Solo hay hit si la fuente guardada es la que corresponde ahora
 * y, cuando es «en-curso», si todavía no venció (`ttlEnCursoMs`, 60 s por defecto); el de la PR no vence.
 */
export function crearProveedorDiff(op: {
  almacen: Almacen;
  tareaEnCurso: () => string | null;
  diffEnCurso: (idCarpeta: string, base: string) => Promise<string>;
  diffPr: (urlPr: string) => Promise<string>;
  ahora?: () => number; // por defecto Date.now
  ttlEnCursoMs?: number; // por defecto 60_000
}): (id: string) => Promise<string | null> {
  const ahora = op.ahora ?? Date.now;
  const ttlEnCursoMs = op.ttlEnCursoMs ?? 60_000;
  // `fuente` marca de dónde salió el diff: un hit exige la misma fuente que el pedido de ahora.
  const cache = new Map<string, { diff: string; fuente: "en-curso" | "pr"; guardadoEn: number }>();

  return async (id) => {
    const carpeta = idCarpeta(id);
    if (carpeta === null) return null;
    const ubicada = ubicarTarea(op.almacen, id);
    if (ubicada === null) return null;

    let obtener: () => Promise<string>;
    let fuente: "en-curso" | "pr";
    if (op.tareaEnCurso() === id) {
      const base = baseDeTarea(ubicada.eventos);
      if (base === null) return null;
      obtener = () => op.diffEnCurso(carpeta, base);
      fuente = "en-curso";
    } else {
      const urlPr = ubicada.resultado?.pr ?? null;
      if (urlPr === null) return null;
      obtener = () => op.diffPr(urlPr);
      fuente = "pr";
    }

    const hit = cache.get(id);
    if (hit !== undefined && hit.fuente === fuente && (fuente === "pr" || ahora() - hit.guardadoEn < ttlEnCursoMs)) {
      return hit.diff;
    }
    const diff = await obtener(); // si rechaza, el error se propaga y no queda cacheado
    cache.set(id, { diff, fuente, guardadoEn: ahora() });
    return diff;
  };
}

/**
 * Lee `<dir>/diffs/<owner>_<repo>-<n>.diff`. Si el archivo falta o el id es inválido → `null`.
 */
export function diffDeFixtures(dir: string): (id: string) => Promise<string | null> {
  return async (id) => {
    const carpeta = idCarpeta(id);
    if (carpeta === null) return null;
    try {
      return await readFile(join(dir, "diffs", `${carpeta}.diff`), "utf8");
    } catch {
      return null;
    }
  };
}

/**
 * `gh pr diff <url>` y devuelve la salida. Rechaza si la URL no es de GitHub (sin ejecutar nada)
 * o si el comando falla. Por defecto `ejecutarEnMac`.
 */
export function diffDePr(ejecutar: Ejecutar = ejecutarEnMac): (urlPr: string) => Promise<string> {
  return async (urlPr) => {
    if (!urlPr.startsWith("https://github.com/")) throw new Error("URL de PR inválida");
    return ejecutar("gh", ["pr", "diff", urlPr]);
  };
}
