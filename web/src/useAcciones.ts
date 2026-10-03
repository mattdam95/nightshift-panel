import { useRef, useState } from "react";
import type { Accion, PedidoAccion, ResultadoAccion } from "../../src/contrato/api";

export interface PendienteAccion {
  accion: Accion;
  /** Solo para `reintentar`: "owner/repo#N". */
  tarea?: string;
}

/**
 * Estado de los botones de acciones de la vista En vivo.
 * `pendiente`: la confirmación abierta (null si no hay). `enviando`: hay un POST en curso.
 * `resultado`: respuesta del último pedido confirmado.
 * `pedir` abre la confirmación (reemplaza la anterior y borra el resultado); `confirmar`
 * manda el POST y al responder cierra la confirmación; `cancelar` cierra sin mandar nada.
 */
export function useAcciones() {
  const [pendiente, setPendiente] = useState<PendienteAccion | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] = useState<ResultadoAccion | null>(null);
  const enCurso = useRef(false);

  const pedir = (accion: Accion, tarea?: string) => {
    setPendiente({ accion, tarea });
    setResultado(null);
  };

  const cancelar = () => {
    if (!enCurso.current) setPendiente(null);
  };

  const confirmar = () => {
    const p = pendiente;
    if (!p || enCurso.current) return;
    enCurso.current = true;
    setEnviando(true);
    const cuerpo: PedidoAccion = { confirmar: true };
    if (p.tarea) cuerpo.tarea = p.tarea;
    fetch(`/api/acciones/${p.accion}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(cuerpo),
    })
      .then(async (r) => {
        const json = (await r.json().catch(() => null)) as { ok?: boolean; mensaje?: string; error?: string } | null;
        if (r.ok) {
          setResultado({ ok: true, mensaje: json?.mensaje ?? "Listo." });
        } else {
          setResultado({ ok: false, mensaje: json?.error || `El server respondió ${r.status}` });
        }
      })
      .catch(() => {
        setResultado({ ok: false, mensaje: "No se pudo conectar con el panel" });
      })
      .finally(() => {
        enCurso.current = false;
        setEnviando(false);
        setPendiente(null);
      });
  };

  return { pendiente, enviando, resultado, pedir, cancelar, confirmar };
}
