import type { Etapa, Evento, EstadoTarea, Maquina } from "./eventos.js";

/**
 * Estado "en vivo" de una noche, derivado solo de los eventos.
 * Es una función pura: la usan el server (snapshot de /api/vivo) y el cliente (aplica cada evento del SSE).
 */
export interface EstadoVivo {
  /** Fecha de la carpeta de logs (`YYYY-MM-DD`). */
  fecha: string | null;
  noche: NocheVivo | null;
  /** Última cola informada por `cola/estado`. */
  cola: string[];
  tarea: TareaVivo | null;
  terminadas: TareaTerminada[];
  /** Últimos eventos de `sistema` y errores de cola (los más nuevos al final). */
  avisos: { ts: string; tipo: string; mensaje: string }[];
  ultimoTs: string | null;
}

export interface NocheVivo {
  inicio: string;
  /** Hora límite de la noche (`--until`), ISO. */
  hasta: string | null;
  activa: boolean;
  fin?: { ts: string; motivo: string };
}

export interface TareaVivo {
  id: string;
  titulo: string;
  rama: string | null;
  inicio: string;
  etapa: Etapa;
  maquina: Maquina;
  presupuesto: { maxHoras: number; maxTurnos: number; prioridad: string; fase: string } | null;
  ronda: number;
  turnos: number;
  tokens: number;
  /** Últimas llamadas a herramientas (máximo `MAX_HERRAMIENTAS`), las más nuevas al final. */
  herramientas: LlamadaHerramienta[];
  verificacion: { comando: string; ok: boolean; ms?: number }[];
  revision: { veredicto: string; problemas: string[] } | null;
  pr: string | null;
}

export interface LlamadaHerramienta {
  ts: string;
  etapa: Etapa;
  nombre: string;
  resumen: string;
  error: boolean;
}

export interface TareaTerminada {
  id: string;
  titulo: string;
  estado: EstadoTarea | string;
  motivo: string;
  pr: string | null;
  inicio: string;
  fin: string;
}

export const MAX_HERRAMIENTAS = 40;
const MAX_AVISOS = 20;

export function estadoInicial(fecha: string | null = null): EstadoVivo {
  return { fecha, noche: null, cola: [], tarea: null, terminadas: [], avisos: [], ultimoTs: null };
}

const texto = (v: unknown): string => (typeof v === "string" ? v : v === undefined || v === null ? "" : JSON.stringify(v));
const numero = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);

/** Aplica un evento. No muta `estado`: devuelve uno nuevo (sirve para `useReducer`). */
export function aplicarEvento(estado: EstadoVivo, ev: Evento): EstadoVivo {
  const s: EstadoVivo = { ...estado, ultimoTs: ev.ts };
  const d = ev.datos;

  if (ev.etapa === "noche") {
    if (ev.tipo === "inicio") {
      // Una noche relanzada vuelve a emitir `inicio` en el mismo archivo: se reinicia la noche pero se conserva lo terminado.
      return { ...s, noche: { inicio: ev.ts, hasta: texto(d.hasta) || null, activa: true }, tarea: null };
    }
    if (ev.tipo === "fin" && s.noche) {
      return { ...s, noche: { ...s.noche, activa: false, fin: { ts: ev.ts, motivo: texto(d.motivo) } }, tarea: null };
    }
    return s;
  }

  if (ev.etapa === "cola" && ev.tipo === "estado") {
    return { ...s, cola: Array.isArray(d.listas) ? d.listas.map(texto) : [] };
  }

  if (ev.etapa === "sistema" || (ev.etapa === "cola" && ev.tipo === "error")) {
    const mensaje = texto(d.mensaje ?? d.razon ?? d.error ?? (d.codigo !== undefined ? `código ${texto(d.codigo)}` : ""));
    s.avisos = [...s.avisos, { ts: ev.ts, tipo: `${ev.etapa}/${ev.tipo}`, mensaje }].slice(-MAX_AVISOS);
    return s;
  }

  if (!ev.tarea) return s;

  if (ev.etapa === "preparacion" && ev.tipo === "inicio") {
    const p = d.presupuesto as TareaVivo["presupuesto"] | undefined;
    s.tarea = {
      id: ev.tarea,
      titulo: texto(d.titulo),
      rama: texto(d.rama) || null,
      inicio: ev.ts,
      etapa: "preparacion",
      maquina: ev.maquina,
      presupuesto: p && typeof p === "object" ? p : null,
      ronda: 0,
      turnos: 0,
      tokens: 0,
      herramientas: [],
      verificacion: [],
      revision: null,
      pr: null,
    };
    return s;
  }

  // Un evento de una tarea que no vimos arrancar (el panel se conectó a mitad): se crea con lo que se sabe.
  const previa = s.tarea && s.tarea.id === ev.tarea ? s.tarea : tareaVacia(ev.tarea, ev.ts);
  const t: TareaVivo = { ...previa, etapa: ev.etapa, maquina: ev.maquina };

  switch (`${ev.etapa}/${ev.tipo}`) {
    case "tests/agente-inicio":
    case "implementacion/agente-inicio":
      t.ronda = numero(d.ronda) || t.ronda + 1;
      break;
    case "tests/turno":
    case "implementacion/turno":
      t.turnos += 1;
      t.tokens += numero(d.tokens);
      break;
    case "tests/herramienta":
    case "implementacion/herramienta":
    case "tests/herramienta-error":
    case "implementacion/herramienta-error":
      t.herramientas = [
        ...t.herramientas,
        { ts: ev.ts, etapa: ev.etapa, nombre: texto(d.nombre), resumen: texto(d.resumen), error: ev.tipo === "herramienta-error" },
      ].slice(-MAX_HERRAMIENTAS);
      break;
    case "verificacion/paso":
      t.verificacion = [...t.verificacion, { comando: texto(d.comando), ok: d.ok === true, ms: numero(d.ms) || undefined }];
      break;
    case "verificacion/resultado":
      break;
    case "revision/inicio":
      // Nueva ronda de verificación + revisión: se limpia la verificación anterior.
      t.revision = null;
      break;
    case "revision/veredicto":
      t.revision = { veredicto: texto(d.veredicto), problemas: Array.isArray(d.problemas) ? d.problemas.map(texto) : [] };
      break;
    case "revision/no-disponible":
      t.revision = { veredicto: "no-disponible", problemas: [texto(d.error)] };
      break;
    case "entrega/pr":
      t.pr = texto(d.url) || null;
      break;
    case "entrega/resultado": {
      const fin: TareaTerminada = {
        id: t.id,
        titulo: t.titulo,
        estado: texto(d.estado),
        motivo: texto(d.motivo),
        pr: texto(d.pr) || t.pr,
        inicio: t.inicio,
        fin: ev.ts,
      };
      return { ...s, tarea: null, terminadas: [...s.terminadas.filter((x) => x.id !== t.id || x.inicio !== t.inicio), fin] };
    }
  }
  if (ev.etapa === "implementacion" && ev.tipo === "agente-inicio") t.verificacion = [];
  s.tarea = t;
  return s;
}

function tareaVacia(id: string, ts: string): TareaVivo {
  return {
    id,
    titulo: "",
    rama: null,
    inicio: ts,
    etapa: "preparacion",
    maquina: "pc",
    presupuesto: null,
    ronda: 0,
    turnos: 0,
    tokens: 0,
    herramientas: [],
    verificacion: [],
    revision: null,
    pr: null,
  };
}

export function reducirEventos(eventos: Evento[], fecha: string | null = null): EstadoVivo {
  return eventos.reduce(aplicarEvento, estadoInicial(fecha));
}

/**
 * Hora en que se corta la tarea en curso: lo que llegue primero entre el límite de horas de la
 * tarea (`presupuesto.maxHoras`) y el `hasta` de la noche. null si no se sabe.
 */
export function limiteTarea(estado: Pick<EstadoVivo, "noche" | "tarea">): Date | null {
  const candidatos: number[] = [];
  if (estado.noche?.hasta) candidatos.push(Date.parse(estado.noche.hasta));
  const t = estado.tarea;
  if (t?.presupuesto?.maxHoras) candidatos.push(Date.parse(t.inicio) + t.presupuesto.maxHoras * 3_600_000);
  const validos = candidatos.filter(Number.isFinite);
  return validos.length ? new Date(Math.min(...validos)) : null;
}
