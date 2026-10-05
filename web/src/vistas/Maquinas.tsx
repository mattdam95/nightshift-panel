import { useEffect, useState } from "react";
import type { Maquinas, MetricasLlm } from "../../../src/contrato/api";
import { formatoGiB, formatoTokS, porcentaje } from "../../../src/contrato/maquinas";
import { obtener } from "../api";
import "../estilos/maquinas.css";

/** Cada 15 s se repite el pedido mientras la vista está abierta. */
const CADA_MS = 15_000;

const TEXTO_CONEXION: Record<Maquinas["pc"]["conexion"], string> = {
  conectada: "Conectada",
  desconectada: "Desconectada",
  "sin-espejo": "Datos locales",
};

const CLASE_CONEXION: Record<Maquinas["pc"]["conexion"], string> = {
  conectada: "conexion-ok",
  desconectada: "conexion-caida",
  "sin-espejo": "conexion-local",
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

/** Radio y largo de la circunferencia del anillo de VRAM (viewBox 84×84). */
const RADIO = 34;
const CIRCUNFERENCIA = 2 * Math.PI * RADIO;

/** Anillo de progreso 0–100 (el contenedor lleva el role progressbar); si `pct` es null no se dibuja. */
function Anillo({ testid, pct }: { testid: string; pct: number | null }) {
  if (pct === null) return null;
  const arco = (CIRCUNFERENCIA * pct) / 100;
  return (
    <div role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} className="anillo" data-testid={testid}>
      <svg width="84" height="84" viewBox="0 0 84 84" aria-hidden="true">
        <circle cx="42" cy="42" r={RADIO} fill="none" stroke="var(--relleno)" strokeWidth="9" />
        <circle
          cx="42"
          cy="42"
          r={RADIO}
          fill="none"
          stroke="var(--pc)"
          strokeWidth="9"
          strokeLinecap="round"
          strokeDasharray={`${arco.toFixed(2)} ${CIRCUNFERENCIA.toFixed(2)}`}
          transform="rotate(-90 42 42)"
          data-testid="pc-vram-anillo"
        />
      </svg>
      <span className="anillo-pct">{pct}%</span>
    </div>
  );
}

/** Barra de progreso 0–100 sobre una pista; si `pct` es null no se dibuja. */
function Barra({ testid, pct }: { testid: string; pct: number | null }) {
  if (pct === null) return null;
  return (
    <div role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} className="pista barra-mac" data-testid={testid}>
      <div style={{ width: `${pct}%` }} />
    </div>
  );
}

function TarjetaPc({ pc }: { pc: Maquinas["pc"] }) {
  const gpu = pc.gpu;
  const vram = gpu === null ? "—" : memoriaGiB(gpu.vramUsadaGiB, gpu.vramTotalGiB);
  const pct = gpu === null ? null : porcentaje(gpu.vramUsadaGiB, gpu.vramTotalGiB);
  return (
    <article className="tarjeta maquina" data-testid="maquina-pc">
      <div className="fila maquina-cabecera">
        <h2>PC</h2>
        <span className={`chip ${CLASE_CONEXION[pc.conexion]}`} data-testid="pc-conexion">
          <span className="punto-chip" aria-hidden="true" />
          {TEXTO_CONEXION[pc.conexion]}
        </span>
      </div>
      <div className="vram-fila">
        <Anillo testid="pc-vram-barra" pct={pct} />
        <div className="vram-texto">
          <span className="sub">VRAM</span>
          <span className="vram-valor" data-testid="pc-vram">
            {vram}
          </span>
        </div>
      </div>
      <div className="bloques-pc">
        <div className="tile">
          <span className="tile-etiqueta">Temp.</span>
          <span className="tile-valor" data-testid="pc-temperatura">
            {gpu === null ? "—" : celsius(gpu.temperaturaC)}
          </span>
        </div>
        <div className="tile">
          <span className="tile-etiqueta">Potencia</span>
          <span className="tile-valor" data-testid="pc-potencia">
            {gpu === null ? "—" : watts(gpu.potenciaW)}
          </span>
        </div>
        <div className="tile">
          <span className="tile-etiqueta">Genera</span>
          <span className="tile-valor" data-testid="pc-toks">
            {formatoTokS(pc.llm.tokPorSegGeneracion)} tok/s
          </span>
        </div>
      </div>
      <div className="tile llm-fila">
        <span>LLM · ejecutor y revisor</span>
        <Salud testid="salud-llm" salud={pc.llm.salud} />
      </div>
    </article>
  );
}

function TarjetaMac({ mac }: { mac: Maquinas["mac"] }) {
  return (
    <article className="tarjeta maquina" data-testid="maquina-mac">
      <div className="fila maquina-cabecera">
        <h2>Mac</h2>
        <span className="mac-memoria" data-testid="mac-memoria">
          {memoriaGiB(mac.memoriaUsadaGiB, mac.memoriaTotalGiB)}
        </span>
      </div>
      <Barra testid="mac-memoria-barra" pct={porcentaje(mac.memoriaUsadaGiB, mac.memoriaTotalGiB)} />
      <p className="sub mac-nota">Coordina la noche y sirve el panel. El revisor corre en la PC.</p>
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
