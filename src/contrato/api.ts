/**
 * Contrato HTTP del panel. Todas las rutas cuelgan de `/api` y devuelven JSON.
 * Los tipos de este archivo los importan el server (Hono) y la SPA: cambiar acá rompe los dos a la vez, a propósito.
 *
 *   GET  /api/salud                          → Salud
 *   GET  /api/vivo                           → SnapshotVivo
 *   GET  /api/stream                         → SSE (ver MensajeSSE). Acepta Last-Event-ID.
 *   GET  /api/noches                         → ResumenNoche[] (la más nueva primero)
 *   GET  /api/noches/:fecha                  → DetalleNoche
 *   GET  /api/noches/:fecha/eventos?tarea=   → Evento[]
 *   GET  /api/noches/:fecha/reporte          → text/markdown
 *   GET  /api/tareas/:owner/:repo/:numero    → DetalleTarea        (issue: vista de detalle)
 *   GET  /api/tareas/:owner/:repo/:numero/diff → text/plain         (issue: vista de detalle)
 *   GET  /api/maquinas                       → Maquinas             (issue: métricas)
 *   GET  /api/cola                           → Cola                 (issue: cola)
 *   GET  /api/estadisticas?semanas=8         → Estadisticas         (issue: historial)
 *   POST /api/acciones/:accion  {confirmar:true, tarea?} → ResultadoAccion (issue: acciones)
 *
 * Errores: status 4xx/5xx con cuerpo `{ error: string }`.
 */
import type { Evento, EstadoTarea } from "./eventos.js";
import type { EstadoVivo } from "./vivo.js";

export interface ErrorApi {
  error: string;
}

/** Cómo ve el server a la PC. "sin-espejo": el server corre con datos locales (dev, tests). */
export type ConexionPc = "conectada" | "desconectada" | "sin-espejo";

export interface Salud {
  ok: true;
  version: string;
  datos: string;
  pc: ConexionPc;
}

/** Estado de la PC que no sale de los eventos: lo trae la sonda por SSH cada ~15 s. */
export interface EstadoPc {
  /** ISO de la última sonda que respondió. */
  ts: string;
  /** Hay un `nightshift run` vivo (run.lock con PID vivo). */
  corriendo: boolean;
  pausado: boolean;
  /** Contenido de /srv/lab/state/actual.json. */
  actual: { tarea: string; titulo: string; etapa: string; inicio: string; contenedor?: string } | null;
  /** Carpeta de logs más nueva en la PC. */
  ultimaNoche: string | null;
}

export interface SnapshotVivo {
  vivo: EstadoVivo;
  pc: ConexionPc;
  estadoPc: EstadoPc | null;
  /** id SSE del último evento incluido en `vivo` (para reconectar sin huecos). */
  ultimoId: string | null;
}

/**
 * Mensajes del stream `GET /api/stream` (text/event-stream).
 * - `evento`: un Evento del jsonl, sin cambios. El `id:` del SSE es `<fecha>:<n>` (n = número de línea desde 1).
 * - `noche`: empezó una carpeta de logs nueva; el cliente tiene que reiniciar su EstadoVivo con esa fecha.
 * - `pc`: cambió la conexión con la PC o llegó una sonda nueva.
 * - `metricas`: muestra nueva de métricas de las máquinas (issue: métricas).
 * Además, cada 15 s se manda un comentario `: ping` para que Safari y `tailscale serve` no corten la conexión.
 */
export type MensajeSSE =
  | { event: "evento"; id: string; data: Evento }
  | { event: "noche"; data: { fecha: string } }
  | { event: "pc"; data: { pc: ConexionPc; estadoPc: EstadoPc | null } }
  | { event: "metricas"; data: Maquinas };

export interface ResumenNoche {
  fecha: string;
  inicio: string | null;
  fin: string | null;
  motivoFin: string | null;
  /** Cantidad de tareas por estado final. */
  estados: Partial<Record<EstadoTarea, number>>;
  tareas: number;
  hayReporte: boolean;
}

/** Igual que `ResultadoTarea` de nightshift (`/srv/lab/state/noches/<fecha>.json`). */
export interface ResultadoTarea {
  tarea: string;
  repo: string;
  numero: number;
  titulo: string;
  estado: EstadoTarea;
  motivo: string;
  inicio: string;
  fin: string;
  rama?: string;
  pr?: string;
  turnos: number;
  tokens: number;
  llamadas: number;
  rondasAgente: number;
  testsAceptacion: string[];
  testsEnRojo?: boolean;
  verificacion?: { ok: boolean; pasos: { comando: string; ok: boolean; aviso?: string }[] };
  revision?: { estado: "aprobar" | "cambios" | "no-disponible"; problemas: string[]; rondas: number; error?: string };
  pregunta?: string;
  notaAgente?: string;
  avisos: string[];
}

export interface DetalleNoche extends ResumenNoche {
  resultados: ResultadoTarea[];
}

export interface DetalleTarea {
  id: string;
  fecha: string;
  resultado: ResultadoTarea | null;
  eventos: Evento[];
  /** Cuerpo del issue (spec), leído con `gh` en la Mac. null si no se pudo. */
  spec: string | null;
}

export interface MetricasLlm {
  /** "ok" si /health respondió 200; "caido" si no respondió; "apagado" si la máquina no está. */
  salud: "ok" | "caido" | "apagado";
  tokPorSegGeneracion: number | null;
  tokPorSegPrompt: number | null;
  peticionesEnCurso: number | null;
}

export interface Maquinas {
  ts: string;
  pc: {
    conexion: ConexionPc;
    gpu: { temperaturaC: number | null; potenciaW: number | null; vramUsadaGiB: number | null; vramTotalGiB: number | null } | null;
    /** El llama-server de la PC: ejecutor y, desde el 2026-10-04, también revisor (`REVISOR_MAQUINA=pc`). */
    llm: MetricasLlm;
  };
  /** La Mac coordina la noche y sirve el panel; ya no corre un revisor propio. */
  mac: {
    memoriaUsadaGiB: number | null;
    memoriaTotalGiB: number | null;
  };
}

export interface ItemCola {
  id: string;
  titulo: string;
  url: string;
  etiquetas: string[];
  /** Solo en bloqueadas: la pregunta que dejó el agente. */
  pregunta?: string;
}

export interface Cola {
  listas: ItemCola[];
  sinDefinir: ItemCola[];
  bloqueadas: ItemCola[];
}

export interface Estadisticas {
  semanas: {
    desde: string;
    tareas: number;
    listas: number;
    tasaExito: number;
    minutosPromedio: number;
    rondasRevisionPromedio: number;
    kWh: number | null;
  }[];
}

export type Accion = "pausar" | "reanudar" | "juego" | "reintentar";

export interface PedidoAccion {
  /** Tiene que ser true: la confirmación se hace en la UI, el server la exige igual. */
  confirmar: true;
  /** Solo para `reintentar`: "owner/repo#N". */
  tarea?: string;
}

export interface ResultadoAccion {
  ok: boolean;
  mensaje: string;
}
