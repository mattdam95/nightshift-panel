import type { Accion, EstadoPc } from "./api.js";

export const NOMBRE_ACCION: Record<Accion, string> = {
  pausar: "Pausar",
  reanudar: "Reanudar",
  juego: "Modo juego",
  reintentar: "Reintentar",
};

/** Botones de la fila general: ["reanudar", "juego"] si `estadoPc?.pausado === true`; en cualquier otro caso (también con null) ["pausar", "juego"]. */
export function accionesVisibles(estadoPc: EstadoPc | null): Accion[] {
  return estadoPc?.pausado === true ? ["reanudar", "juego"] : ["pausar", "juego"];
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
