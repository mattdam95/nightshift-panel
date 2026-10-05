/** Formatos de fecha y duración para la UI (hora de Argentina, la del usuario). */
const ZONA = "America/Argentina/Buenos_Aires";

export const hora = (iso: string) => new Date(iso).toLocaleTimeString("es-AR", { hourCycle: "h23", timeZone: ZONA });
export const horaCorta = (iso: string) =>
  new Date(iso).toLocaleTimeString("es-AR", { hourCycle: "h23", hour: "2-digit", minute: "2-digit", timeZone: ZONA });

/** 3725000 → "1 h 02 min"; 95000 → "1 min 35 s". Negativo → "0 s". */
export function duracion(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h} h ${String(m).padStart(2, "0")} min`;
  if (m > 0) return `${m} min ${String(s % 60).padStart(2, "0")} s`;
  return `${s} s`;
}

export const ICONO_ESTADO: Record<string, string> = { lista: "✅", timeout: "⚠️", bloqueada: "⛔", interrumpida: "⏸️", error: "💥" };

export const NOMBRE_ETAPA: Record<string, string> = {
  preparacion: "preparación",
  tests: "tests",
  implementacion: "implementación",
  verificacion: "verificación",
  revision: "revisión",
  entrega: "entrega",
};
