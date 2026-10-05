import type { Accion, EstadoPc } from "./api.js";

export const NOMBRE_ACCION: Record<Accion, string> = {
  pausar: "Pausar",
  reanudar: "Reanudar",
  juego: "Modo juego",
  reintentar: "Reintentar",
};

/**
 * Botones de la tarjeta de acciones: ["reanudar"] si `estadoPc?.pausado === true`; si no, ["pausar"] cuando hay una
 * noche activa (`nocheActiva`, también con `estadoPc` null); y [] sin noche. "juego" no está acá: es un botón aparte, siempre visible.
 */
export function accionesVisibles(estadoPc: EstadoPc | null, nocheActiva: boolean): Accion[] {
  if (estadoPc?.pausado === true) return ["reanudar"];
  return nocheActiva ? ["pausar"] : [];
}

/** Texto de la confirmación. `tarea` solo se usa en reintentar. */
export function textoConfirmacion(accion: Accion, tarea?: string): string {
  switch (accion) {
    case "pausar":
      return "Pausar la noche: no va a arrancar tareas nuevas.";
    case "reanudar":
      return "Reanudar la noche: vuelve a arrancar tareas.";
    case "juego":
      return "Modo juego: corta la tarea en curso y apaga el llama-server de la PC.";
    case "reintentar":
      return `Reintentar ${tarea || "la tarea"}: vuelve a la cola como lista para la próxima noche.`;
  }
}
