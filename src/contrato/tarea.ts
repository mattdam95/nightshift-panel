import type { DetalleTarea } from "./api.js";
import type { Etapa, Evento } from "./eventos.js";

/**
 * Funciones puras de la vista de detalle de tarea (`#/tarea/<owner>/<repo>/<n>`).
 * La vista en sí vive en `web/src/vistas/Tarea.tsx` y se prueba en `e2e/tarea.spec.ts`;
 * lo que se prueba acá con vitest es este módulo (tests en `tarea.test.ts`).
 */

/**
 * Pasos de verificación. Si `resultado.verificacion.pasos` existe, esos (comando y ok). Si no, salen de los eventos
 * `etapa === "verificacion"` y `tipo === "paso"` (`datos.comando`, `datos.ok`) de la **última ronda**: cada ronda termina
 * en un evento `tipo === "resultado"`; se usa la última ronda cerrada, o los `paso` sueltos si todavía no hay `resultado`.
 */
export function pasosDeVerificacion(d: DetalleTarea): { comando: string; ok: boolean }[] {
  const fijos = d.resultado?.verificacion?.pasos;
  if (fijos) return fijos.map((p) => ({ comando: p.comando, ok: p.ok }));

  const verificacion = d.eventos.filter((e) => e.etapa === "verificacion");
  let ultimo = -1; // índice del último `resultado`
  let anterior = -1; // índice del `resultado` anterior (o -1 si es la primera ronda)
  verificacion.forEach((e, i) => {
    if (e.tipo === "resultado") {
      anterior = ultimo;
      ultimo = i;
    }
  });
  // Con `resultado`: solo los pasos de la última ronda cerrada. Sin `resultado`: todos los pasos sueltos.
  const desde = ultimo === -1 ? 0 : anterior + 1;
  const hasta = ultimo === -1 ? verificacion.length : ultimo;
  return verificacion
    .filter((e, i) => i >= desde && i < hasta && e.tipo === "paso")
    .map((e) => ({
      comando: typeof e.datos.comando === "string" ? e.datos.comando : "",
      ok: e.datos.ok === true,
    }));
}

/**
 * Grupos de eventos **consecutivos** con la misma etapa, en orden. Cada cambio de etapa abre un grupo nuevo.
 */
export function agruparPorEtapa(eventos: Evento[]): { etapa: Etapa; eventos: Evento[] }[] {
  const grupos: { etapa: Etapa; eventos: Evento[] }[] = [];
  for (const e of eventos) {
    const ultimo = grupos[grupos.length - 1];
    if (ultimo && ultimo.etapa === e.etapa) {
      ultimo.eventos.push(e);
    } else {
      grupos.push({ etapa: e.etapa, eventos: [e] });
    }
  }
  return grupos;
}
