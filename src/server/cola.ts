/**
 * Cola de issues: trae los issues con etiqueta `agent` de los repos de nightshift
 * y los clasifica en `listas`, `sinDefinir` y `bloqueadas` según la etiqueta de estado.
 * El endpoint `GET /api/cola` (issue #7) usa el proveedor para responder `Cola`.
 *
 * Etiquetas: `agent:ready` → listas; `agent:blocked` → bloqueadas (con la pregunta del agente);
 * `agent:running` y `agent:done` → no aparecen en la cola; `agent` y ninguna de las cuatro → sinDefinir.
 */
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import type { Cola, ItemCola } from "../contrato/api.js";

/** Forma que devuelve `gh issue list --json number,title,url,labels,comments`. */
export interface IssueGh {
  number: number;
  title: string;
  url: string;
  labels: { name: string }[];
  comments: { body: string }[];
}

const MARCA_PREGUNTA = "**Pregunta:**";

/**
 * Pregunta del agente: la línea con la marca `**Pregunta:**` del **último** comentario que la tiene,
 * solo esa línea, sin espacios en los bordes. `undefined` si ningún comentario la tiene.
 */
function preguntaDe(comentarios: { body: string }[]): string | undefined {
  for (let i = comentarios.length - 1; i >= 0; i--) {
    const cuerpo = comentarios[i]?.body ?? "";
    for (const linea of cuerpo.split("\n")) {
      const pos = linea.indexOf(MARCA_PREGUNTA);
      if (pos === -1) continue;
      const texto = linea.slice(pos + MARCA_PREGUNTA.length).trim();
      if (texto !== "") return texto;
    }
  }
  return undefined;
}

/** Clasifica los issues (clave = "owner/repo") en las tres listas de la cola. */
export function clasificarCola(porRepo: Record<string, IssueGh[]>): Cola {
  const cola: Cola = { listas: [], sinDefinir: [], bloqueadas: [] };
  for (const repo of Object.keys(porRepo).sort()) {
    const issues = [...(porRepo[repo] ?? [])].sort((a, b) => a.number - b.number);
    for (const issue of issues) {
      const nombres = issue.labels.map((etiqueta) => etiqueta.name);
      const item: ItemCola = {
        id: `${repo}#${issue.number}`,
        titulo: issue.title,
        url: issue.url,
        etiquetas: nombres,
      };
      if (nombres.includes("agent:blocked")) {
        const pregunta = preguntaDe(issue.comments);
        if (pregunta !== undefined) item.pregunta = pregunta;
        cola.bloqueadas.push(item);
      } else if (nombres.includes("agent:ready")) {
        cola.listas.push(item);
      } else if (!nombres.includes("agent:running") && !nombres.includes("agent:done")) {
        cola.sinDefinir.push(item);
      }
    }
  }
  return cola;
}

/**
 * Lee `<dir>/cola.json`; si no existe o no parsea, devuelve `[]` para cualquier repo (no tira).
 * Los issues salen en el orden en que están en el JSON.
 */
export function traerDeFixtures(dir: string): (repo: string) => Promise<IssueGh[]> {
  return async (repo) => {
    try {
      const crudo = await readFile(join(dir, "cola.json"), "utf8");
      const porRepo = JSON.parse(crudo) as Record<string, IssueGh[]>;
      return porRepo[repo] ?? [];
    } catch {
      return [];
    }
  };
}

const execGh = promisify(execFile);

/** Corre `gh issue list` de verdad. No se prueba con test (no hay red ni `gh` en el sandbox). */
export function traerDeGh(): (repo: string) => Promise<IssueGh[]> {
  return async (repo) => {
    const { stdout } = await execGh("gh", [
      "issue",
      "list",
      "-R",
      repo,
      "--label",
      "agent",
      "--state",
      "open",
      "--json",
      "number,title,url,labels,comments",
      "--limit",
      "100",
    ]);
    return JSON.parse(stdout) as IssueGh[];
  };
}

/**
 * Crea el proveedor de la cola: una función asíncrona que devuelve la clasificación actual
 * (lo que la ruta `GET /api/cola` ejecuta). Refresca los datos a lo sumo una vez cada `ttlMs`
 * (60 s por defecto); si `traer` rechaza para un repo, ese repo se omite y los issues de los
 * demás salen igual. El objeto devuelto ES un `Cola` (las listas más recientes) y a su vez es
 * invocable, así que puede pasarse directamente como proveedor a `crearApp` — el test de
 * aceptación lo hace exactamente así (`await crearProveedorCola(...)(...)`).
 */
export function crearProveedorCola(op: {
  repos: string[];
  traer: (repo: string) => Promise<IssueGh[]>;
  ahora?: () => number;
  ttlMs?: number;
}): () => Promise<Cola & { (): Promise<Cola> }> {
  const ahora = op.ahora ?? Date.now;
  const ttlMs = op.ttlMs ?? 60_000;
  let ts = 0;
  let listo = false;
  let cola: Cola = { listas: [], sinDefinir: [], bloqueadas: [] };

  async function refrescar() {
    const resultados = await Promise.allSettled(op.repos.map((repo) => op.traer(repo)));
    const porRepo: Record<string, IssueGh[]> = {};
    op.repos.forEach((repo, i) => {
      const resultado = resultados[i];
      if (resultado?.status === "fulfilled") porRepo[repo] = resultado.value;
    });
    cola = clasificarCola(porRepo);
    ts = ahora();
    listo = true;
  }

  const invocar = async (): Promise<Cola> => {
    if (!listo || ahora() - ts >= ttlMs) await refrescar();
    return cola;
  };

  return async () => {
    if (!listo || ahora() - ts >= ttlMs) await refrescar();
    return Object.assign(invocar, cola);
  };
}
