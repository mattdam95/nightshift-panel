import { useEffect, useRef, useState } from "react";
import type { ConexionPc, EstadoPc, SnapshotVivo } from "../../src/contrato/api";
import type { Evento } from "../../src/contrato/eventos";
import { aplicarEvento, estadoInicial, type EstadoVivo } from "../../src/contrato/vivo";
import { obtener } from "./api";

export type ConexionStream = "conectando" | "en-vivo" | "reconectando";

export interface Vivo {
  vivo: EstadoVivo;
  pc: ConexionPc;
  estadoPc: EstadoPc | null;
  stream: ConexionStream;
}

/** Número de línea de un id SSE `<fecha>:<n>`, para descartar eventos repetidos. */
function linea(id: string | null, fecha: string | null): number {
  if (!id) return 0;
  const [f, n] = id.split(":");
  return f === fecha ? Number(n) || 0 : 0;
}

/**
 * Estado en vivo: snapshot de /api/vivo y después cada evento del SSE, aplicado con el mismo
 * reductor que usa el server. Al volver a primer plano (iOS corta el SSE en segundo plano) se
 * resincroniza desde el snapshot.
 */
export function useVivo(): Vivo {
  const [estado, setEstado] = useState<Vivo>({ vivo: estadoInicial(), pc: "desconectada", estadoPc: null, stream: "conectando" });
  const ultimo = useRef<{ id: string | null; fecha: string | null }>({ id: null, fecha: null });

  useEffect(() => {
    let fuente: EventSource | null = null;
    let cancelado = false;

    const conectar = async () => {
      fuente?.close();
      setEstado((s) => ({ ...s, stream: s.stream === "en-vivo" ? "reconectando" : s.stream }));
      let snap: SnapshotVivo;
      try {
        snap = await obtener<SnapshotVivo>("/api/vivo");
      } catch {
        if (!cancelado) setTimeout(conectar, 3000);
        return;
      }
      if (cancelado) return;
      ultimo.current = { id: snap.ultimoId, fecha: snap.vivo.fecha };
      setEstado({ vivo: snap.vivo, pc: snap.pc, estadoPc: snap.estadoPc, stream: "conectando" });

      const url = "/api/stream" + (snap.ultimoId ? `?desde=${encodeURIComponent(snap.ultimoId)}` : "");
      fuente = new EventSource(url);
      fuente.onopen = () => setEstado((s) => ({ ...s, stream: "en-vivo" }));
      fuente.onerror = () => setEstado((s) => ({ ...s, stream: "reconectando" }));
      fuente.addEventListener("evento", (m) => {
        const msg = m as MessageEvent<string>;
        const { fecha } = ultimo.current;
        if (linea(msg.lastEventId, fecha) <= linea(ultimo.current.id, fecha)) return;
        ultimo.current.id = msg.lastEventId;
        const ev = JSON.parse(msg.data) as Evento;
        setEstado((s) => ({ ...s, vivo: aplicarEvento(s.vivo, ev) }));
      });
      fuente.addEventListener("noche", (m) => {
        const { fecha } = JSON.parse((m as MessageEvent<string>).data) as { fecha: string };
        ultimo.current = { id: null, fecha };
        setEstado((s) => ({ ...s, vivo: estadoInicial(fecha) }));
      });
      fuente.addEventListener("pc", (m) => {
        const { pc, estadoPc } = JSON.parse((m as MessageEvent<string>).data) as { pc: ConexionPc; estadoPc: EstadoPc | null };
        setEstado((s) => ({ ...s, pc, estadoPc }));
      });
    };

    const alVolver = () => {
      if (document.visibilityState === "visible") void conectar();
    };
    void conectar();
    document.addEventListener("visibilitychange", alVolver);
    return () => {
      cancelado = true;
      fuente?.close();
      document.removeEventListener("visibilitychange", alVolver);
    };
  }, []);

  return estado;
}
