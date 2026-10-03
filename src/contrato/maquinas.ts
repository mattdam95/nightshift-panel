/**
 * Funciones puras de la vista Máquinas (spec: Vista Máquinas).
 * Formatos de métricas de la PC y de la Mac; los tests están en `maquinas.test.ts`.
 */

/** Siempre 1 decimal, formato es-AR (coma). */
function unoDecimal(v: number): string {
  return v.toLocaleString("es-AR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

/** 18.4 → "18,4"; null o NaN → "—". Siempre 1 decimal, formato es-AR. */
export function formatoGiB(v: number | null): string {
  if (v === null || Number.isNaN(v)) return "—";
  return unoDecimal(v);
}

/** 29.63 → "29,6"; null o NaN → "—". */
export function formatoTokS(v: number | null): string {
  if (v === null || Number.isNaN(v)) return "—";
  return unoDecimal(v);
}

/** Porcentaje entero 0–100 de usado/total. null si falta alguno o total <= 0. Se acota a 0–100. */
export function porcentaje(usado: number | null, total: number | null): number | null {
  if (usado === null || Number.isNaN(usado) || total === null || Number.isNaN(total) || total <= 0) return null;
  return Math.min(100, Math.max(0, Math.round((usado / total) * 100)));
}
