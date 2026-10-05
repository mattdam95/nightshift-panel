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

export const NOMBRE_ETAPA: Record<string, string> = {
  preparacion: "preparación",
  tests: "tests",
  implementacion: "implementación",
  verificacion: "verificación",
  revision: "revisión",
  entrega: "entrega",
};

const DIAS_CORTOS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
const MESES_CORTOS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

/** "2026-09-27" → "Dom 27 sep". Se calcula con Date.UTC, sin zona horaria; un texto que no sea AAAA-MM-DD vuelve igual. */
export function fechaCorta(aaaammdd: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(aaaammdd);
  if (!m) return aaaammdd;
  const dia = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))).getUTCDay();
  return `${DIAS_CORTOS[dia]} ${Number(m[3])} ${MESES_CORTOS[Number(m[2]) - 1]}`;
}

const DIAS_LARGOS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

/** "2026-10-03" → "Sábado 3 oct". Como fechaCorta, sin zona horaria; un texto que no sea AAAA-MM-DD vuelve igual. */
export function fechaLarga(aaaammdd: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(aaaammdd);
  if (!m) return aaaammdd;
  const dia = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))).getUTCDay();
  return `${DIAS_LARGOS[dia]} ${Number(m[3])} ${MESES_CORTOS[Number(m[2]) - 1]}`;
}
