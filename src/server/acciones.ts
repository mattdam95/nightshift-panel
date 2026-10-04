/**
 * Acciones del panel (`POST /api/acciones/:accion`): `pausar`, `reanudar`, `juego` y `reintentar`.
 *
 * - Las tres primeras corren `node dist/cli.js <args>` en la PC vía `Espejo.nightshift`,
 *   con tres argumentos fijos: "pause", "resume" y "juego". El campo `tarea` del pedido se
 *   ignora: nunca se arma el comando con texto que venga del cliente.
 * - `reintentar` corre `gh` en la Mac: le saca la etiqueta `agent:blocked` al issue y le pone
 *   `agent:ready`. Antes de ejecutar nada valida que `pedido.tarea` pase `partirTarea` y que el
 *   repo esté en la lista `PANEL_REPOS`; si no, se rechaza sin ejecutar nada.
 * - El proveedor nunca rechaza: cualquier error del comando se convierte en `{ ok: false, mensaje }`
 *   (mensaje de a lo sumo 200 caracteres).
 * - `accionSimulada` (PANEL_ESPEJO=0: dev y e2e) no ejecuta nada y responde
 *   `{ ok: true, mensaje: "(simulado) <acción>" }` para cualquiera de las cuatro.
 */
import type { Accion, PedidoAccion, ResultadoAccion } from "../contrato/api.js";
import { partirTarea } from "../contrato/eventos.js";
import { ejecutarEnMac, type Ejecutar } from "./mac.js";

export type ProveedorAccion = (accion: Accion, pedido: PedidoAccion) => Promise<ResultadoAccion>;

/** Argumento fijo de `nightshift` y mensaje de éxito de cada acción (reintentar no pasa por acá). */
const Fijos = {
  pausar: { args: "pause", exito: "Pausado: no va a arrancar tareas nuevas" },
  reanudar: { args: "resume", exito: "Reanudado" },
  juego: { args: "juego", exito: "Modo juego activado" },
} as const;

function mensajeDeError(err: unknown, largoMaximo = 200): string {
  const m = err instanceof Error ? err.message : String(err);
  return m.length > largoMaximo ? m.slice(0, largoMaximo) : m;
}

export function crearProveedorAcciones(op: {
  nightshift: (args: string) => Promise<string>; // en index.ts: (a) => espejo.nightshift(a)
  ejecutar?: Ejecutar; // por defecto ejecutarEnMac
  repos: string[];
}): ProveedorAccion {
  const ejecutar = op.ejecutar ?? ejecutarEnMac;
  return async (accion, pedido) => {
    try {
      if (accion === "reintentar") {
        const parte = pedido.tarea ? partirTarea(pedido.tarea) : null;
        if (parte === null) return { ok: false, mensaje: "falta una tarea válida" };
        if (!op.repos.includes(parte.repo)) return { ok: false, mensaje: `repo no permitido: ${parte.repo}` };
        await ejecutar("gh", [
          "issue",
          "edit",
          String(parte.numero),
          "-R",
          parte.repo,
          "--remove-label",
          "agent:blocked",
          "--add-label",
          "agent:ready",
        ]);
        return { ok: true, mensaje: `Reintento pedido: ${pedido.tarea}` };
      }
      const fijo = Fijos[accion];
      await op.nightshift(fijo.args);
      return { ok: true, mensaje: fijo.exito };
    } catch (err) {
      return { ok: false, mensaje: mensajeDeError(err) };
    }
  };
}

/** Sin espejo (dev y e2e): no ejecuta nada, solo confirma la acción. */
export const accionSimulada: ProveedorAccion = async (accion) => ({ ok: true, mensaje: `(simulado) ${accion}` });
