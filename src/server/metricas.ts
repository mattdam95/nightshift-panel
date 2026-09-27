/**
 * Métricas de la PC: convierte la sonda (`Sonda`, en espejo.ts) en la parte `pc` de `Maquinas`.
 * Funciones puras: parsea el texto Prometheus de llama-server (`/metrics`) y los sensores de la GPU.
 * El endpoint `GET /api/maquinas` (issue #5) las usa para armar la respuesta.
 */
import type { ConexionPc, Maquinas, MetricasLlm } from "../contrato/api.js";
import type { Sonda } from "./espejo.js";

const GiB = 1024 ** 3;

/** Redondea a `decimales` decimales. */
function redondear(v: number, decimales: number): number {
  const f = 10 ** decimales;
  return Math.round(v * f) / f;
}

/** División de dos métricas redondeada a `decimales` decimales; null si falta alguna o el divisor es 0. */
function cociente(a: number | undefined, b: number | undefined, decimales: number): number | null {
  if (a === undefined || b === undefined || b === 0) return null;
  return redondear(a / b, decimales);
}

/**
 * Parsea el texto Prometheus de llama-server (`/metrics`).
 * Ignora las líneas vacías y los comentarios (`#`); de cada línea `<nombre> <valor>`
 * guarda el nombre (acepta `:` adentro, p. ej. `llamacpp:tokens_predicted_total`)
 * y el valor como número (incluida la notación científica).
 */
export function parsearPrometheus(texto: string): Map<string, number> {
  const mapa = new Map<string, number>();
  for (const cruda of texto.split("\n")) {
    const linea = cruda.trim();
    if (!linea || linea.startsWith("#")) continue;
    const [nombre, valor] = linea.split(/\s+/);
    if (!nombre || valor === undefined) continue;
    const n = Number(valor);
    if (!Number.isFinite(n)) continue;
    mapa.set(nombre, n);
  }
  return mapa;
}

/** Métricas de llama-server a partir del código HTTP de /health y el texto de /metrics. */
export function metricasLlm(salud: number, texto: string): MetricasLlm {
  const m = parsearPrometheus(texto);
  return {
    salud: salud === 200 ? "ok" : salud === 0 ? "apagado" : "caido",
    tokPorSegGeneracion: cociente(m.get("llamacpp:tokens_predicted_total"), m.get("llamacpp:tokens_predicted_seconds_total"), 2),
    tokPorSegPrompt: cociente(m.get("llamacpp:prompt_tokens_total"), m.get("llamacpp:prompt_seconds_total"), 2),
    peticionesEnCurso: m.get("llamacpp:requests_processing") ?? null,
  };
}

/** Sensores de la GPU de la sonda en unidades humanas: °C entero, W con 1 decimal, GiB con 2 decimales. */
export function gpuDeSonda(gpu: Sonda["gpu"] | null): Maquinas["pc"]["gpu"] {
  if (gpu === null) return null;
  return {
    temperaturaC: gpu.tempMiliC === null ? null : Math.round(gpu.tempMiliC / 1000),
    potenciaW: gpu.potenciaMicroW === null ? null : redondear(gpu.potenciaMicroW / 1e6, 1),
    vramUsadaGiB: gpu.vramUsadaB === null ? null : redondear(gpu.vramUsadaB / GiB, 2),
    vramTotalGiB: gpu.vramTotalB === null ? null : redondear(gpu.vramTotalB / GiB, 2),
  };
}

/**
 * La parte `pc` de `Maquinas` a partir de la sonda y el estado de la conexión.
 * Sin sonda o sin conexión (desconectada, sin-espejo): la sonda no está corriendo,
 * así que la GPU queda `null` y el LLM aparece apagado.
 */
export function pcDeSonda(sonda: Sonda | null, conexion: ConexionPc): Maquinas["pc"] {
  const llmApagado: MetricasLlm = { salud: "apagado", tokPorSegGeneracion: null, tokPorSegPrompt: null, peticionesEnCurso: null };
  const activa = sonda !== null && conexion === "conectada";
  return {
    conexion,
    gpu: activa ? gpuDeSonda(sonda.gpu) : null,
    llm: activa ? metricasLlm(sonda.llm.salud, sonda.llm.metricas) : llmApagado,
  };
}
