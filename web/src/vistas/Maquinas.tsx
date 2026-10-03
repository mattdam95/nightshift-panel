import { useEffect, useState } from "react";
import type { Maquinas, MetricasLlm } from "../../../src/contrato/api";
import { formatoGiB, formatoTokS, porcentaje } from "../../../src/contrato/maquinas";
import { obtener } from "../api";

/** Cada 15 s se repite el pedido mientras la vista está abierta. */
const CADA_MS = 15_000;

const TEXTO_CONEXION: Record<Maquinas["pc"]["conexion"], string> = {
  conectada: "conectada",
  desconectada: "desconectada",
  "sin-espejo": "datos locales",
};

const TEXTO_SALUD: Record<MetricasLlm["salud"], string> = {
  ok: "ok",
  caido: "caído",
  apagado: "apagado",
};

/** "12,0 / 16,0 GiB"; si ambos valores faltan, solo «—». */
function memoriaGiB(usada: number | null, total: number | null): string {
  if (usada === null && total === null) return "—";
  return `${formatoGiB(usada)} / ${formatoGiB(total)} GiB`;
}

/** "68 °C"; null → «—». */
function celsius(v: number | null): string {
  return v === null ? "—" : `${v} °C`;
}

/** "187 W"; null → «—». */
function watts(v: number | null): string {
  return v === null ? "—" : `${v} W`;
}

/** Punto de color según la salud: verde ok, rojo caído, gris apagado. */
function PuntoSalud({ salud }: { salud: MetricasLlm["salud"] }) {
  const clase = salud === "ok" ? "punto salud-ok" : salud === "caido" ? "punto salud-caido" : "punto";
  return <span className={clase} aria-hidden="true" />;
}

function Salud({ testid, salud }: { testid: string; salud: MetricasLlm["salud"] }) {
  return (
    <span className="salud" data-testid={testid} data-salud={salud}>
      <PuntoSalud salud={salud} />
      {TEXTO_SALUD[salud]}
    </span>
  );
}

/** Barra de progreso 0–100; si `pct` es null no se dibuja. */
function Barra({ testid, pct }: { testid: string; pct: number | null }) {
  if (pct === null) return null;
  return (
    <div role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} className="barra" data-testid={testid}>
      <div style={{ width: `${pct}%` }} />
    </div>
  );
}

function TarjetaPc({ pc }: { pc: Maquinas["pc"] }) {
  const gpu = pc.gpu;
  const vram = gpu === null ? "—" : memoriaGiB(gpu.vramUsadaGiB, gpu.vramTotalGiB);
  const pct = gpu === null ? null : porcentaje(gpu.vramUsadaGiB, gpu.vramTotalGiB);
  return (
    <article className="tarjeta" data-testid="maquina-pc">
      <div className="fila">
        <h2>PC</h2>
        <span className="sub" data-testid="pc-conexion">
          {TEXTO_CONEXION[pc.conexion]}
        </span>
      </div>
      <dl className="numeros">
        <div>
          <dt>Temperatura</dt>
          <dd data-testid="pc-temperatura">{gpu === null ? "—" : celsius(gpu.temperaturaC)}</dd>
        </div>
        <div>
          <dt>Potencia</dt>
          <dd data-testid="pc-potencia">{gpu === null ? "—" : watts(gpu.potenciaW)}</dd>
        </div>
        <div>
          <dt>VRAM</dt>
          <dd data-testid="pc-vram">{vram}</dd>
        </div>
        <div>
          <dt>Generación</dt>
          <dd data-testid="pc-toks">{formatoTokS(pc.llm.tokPorSegGeneracion)} tok/s</dd>
        </div>
      </dl>
      <Barra testid="pc-vram-barra" pct={pct} />
      <div className="fila">
        <span className="sub">LLM</span>
        <Salud testid="salud-llm" salud={pc.llm.salud} />
      </div>
    </article>
  );
}

function TarjetaMac({ mac }: { mac: Maquinas["mac"] }) {
  return (
    <article className="tarjeta" data-testid="maquina-mac">
      <div className="fila">
        <h2>Mac</h2>
        <span data-testid="mac-memoria">{memoriaGiB(mac.memoriaUsadaGiB, mac.memoriaTotalGiB)}</span>
      </div>
      <Barra testid="mac-memoria-barra" pct={porcentaje(mac.memoriaUsadaGiB, mac.memoriaTotalGiB)} />
      <div className="fila">
        <span className="sub">Revisor</span>
        <Salud testid="salud-revisor" salud={mac.revisor.salud} />
      </div>
    </article>
  );
}

/**
 * Estado de la PC y de la Mac: pide `GET /api/maquinas` al montar y cada 15 s mientras
 * la vista está abierta. Si un pedido falla, se sacan los datos y queda solo el error;
 * el próximo pedido que sale bien vuelve a mostrar las tarjetas (nunca error y datos
 * viejos a la vez). Las respuestas de pedidos que quedaron atrás se ignoran.
 */
export function Maquinas(_props: { params: string[] }) {
  const [datos, setDatos] = useState<Maquinas | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    let vivo = true;
    let ultimo = 0;
    const pedir = () => {
      const n = ++ultimo;
      obtener<Maquinas>("/api/maquinas")
        .then((m) => {
          if (!vivo || n !== ultimo) return;
          setDatos(m);
          setError(null);
          setCargando(false);
        })
        .catch((e: Error) => {
          if (!vivo || n !== ultimo) return;
          setDatos(null);
          setError(e.message);
          setCargando(false);
        });
    };
    pedir();
    const intervalo = setInterval(pedir, CADA_MS);
    return () => {
      vivo = false;
      clearInterval(intervalo);
    };
  }, []);

  return (
    <section className="vista" data-testid="vista-maquinas">
      <header className="cabecera">
        <h1>Máquinas</h1>
      </header>

      {error !== null && (
        <p className="tarjeta error-texto" data-testid="error-maquinas">
          {error}
        </p>
      )}
      {error === null && datos === null && cargando && <p className="vacio">Cargando…</p>}
      {datos !== null && (
        <>
          <TarjetaPc pc={datos.pc} />
          <TarjetaMac mac={datos.mac} />
        </>
      )}
    </section>
  );
}
