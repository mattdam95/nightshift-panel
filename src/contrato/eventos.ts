/**
 * Contrato de `/srv/lab/logs/<fecha>/events.jsonl`, copiado de `nightshift/src/eventos.ts`.
 * La fuente de verdad es nightshift: si cambia allá, se actualiza acá (no al revés).
 */
/**
 * Máquina que emitió el evento. La revisión sale según `REVISOR_MAQUINA` de nightshift: `mac` en las noches
 * hasta el 2026-10-04, `pc` desde entonces (el revisor corre en el mismo llama-server de la PC).
 */
export type Maquina = "pc" | "mac";
export type Etapa = "noche" | "cola" | "preparacion" | "tests" | "implementacion" | "verificacion" | "revision" | "entrega" | "sistema";

export interface Evento {
  /** ISO 8601 en UTC. */
  ts: string;
  maquina: Maquina;
  /** "owner/repo#12", o null para eventos de la noche o del sistema. */
  tarea: string | null;
  etapa: Etapa;
  tipo: string;
  datos: Record<string, unknown>;
}

export const ETAPAS: readonly Etapa[] = [
  "noche",
  "cola",
  "preparacion",
  "tests",
  "implementacion",
  "verificacion",
  "revision",
  "entrega",
  "sistema",
];

/** Etapas en las que trabaja una tarea, en el orden en que ocurren. */
export const ETAPAS_TAREA: readonly Etapa[] = ["preparacion", "tests", "implementacion", "verificacion", "revision", "entrega"];

/** Estados finales de una tarea (`entrega/resultado.datos.estado`, igual que `EstadoTarea` de nightshift). */
export type EstadoTarea = "lista" | "timeout" | "bloqueada" | "interrumpida" | "error";

/** Parsea una línea del jsonl. Devuelve null si no es JSON o le faltan campos (nunca tira). */
export function parsearLinea(linea: string): Evento | null {
  const texto = linea.trim();
  if (!texto) return null;
  try {
    const ev = JSON.parse(texto) as Partial<Evento>;
    if (typeof ev.ts !== "string" || typeof ev.etapa !== "string" || typeof ev.tipo !== "string") return null;
    if (!ETAPAS.includes(ev.etapa as Etapa)) return null;
    return {
      ts: ev.ts,
      maquina: ev.maquina === "mac" ? "mac" : "pc",
      tarea: typeof ev.tarea === "string" ? ev.tarea : null,
      etapa: ev.etapa as Etapa,
      tipo: ev.tipo,
      datos: ev.datos && typeof ev.datos === "object" ? ev.datos : {},
    };
  } catch {
    return null;
  }
}

export function parsearJsonl(texto: string): Evento[] {
  return texto.split("\n").flatMap((l) => parsearLinea(l) ?? []);
}

/** "mattdam95/monigotes#12" → { repo: "mattdam95/monigotes", numero: 12 }. */
export function partirTarea(id: string): { repo: string; numero: number } | null {
  const m = /^([\w.-]+\/[\w.-]+)#(\d+)$/.exec(id);
  return m ? { repo: m[1]!, numero: Number(m[2]) } : null;
}
