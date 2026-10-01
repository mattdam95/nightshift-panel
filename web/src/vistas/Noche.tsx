import { useEffect, useState } from "react";
import type { DetalleNoche, ResultadoTarea } from "../../../src/contrato/api";
import { obtener } from "../api";
import { duracion, ICONO_ESTADO } from "../formato";

export function Noche({ params }: { params: string[] }) {
  const fecha = params[0] ?? "";
  const [detalle, setDetalle] = useState<DetalleNoche | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!fecha) {
      setError("Falta la fecha de la noche");
      return;
    }
    let vivo = true;
    setDetalle(null);
    setError(null);
    obtener<DetalleNoche>(`/api/noches/${encodeURIComponent(fecha)}`)
      .then((d) => vivo && setDetalle(d))
      .catch((e: Error) => vivo && setError(e.message));
    return () => {
      vivo = false;
    };
  }, [fecha]);

  return (
    <section className="vista" data-testid="vista-noche">
      <header className="cabecera">
        <h1>Noche del {fecha}</h1>
        {detalle?.fin === null && <p className="sub">En curso…</p>}
      </header>

      {error && (
        <p className="tarjeta error-texto" data-testid="error">
          {error}
        </p>
      )}
      {!error && detalle === null && <p className="vacio">Cargando…</p>}

      {detalle && (
        <>
          <ul className="resultados">
            {detalle.resultados.map((r) => (
              <Resultado key={r.tarea} r={r} />
            ))}
          </ul>
          {detalle.hayReporte && <Reporte fecha={fecha} />}
        </>
      )}
    </section>
  );
}

/**
 * Duración de la tarea. Una noche en curso puede llegar con `fin` ausente (null):
 * sin fecha de fin no hay duración, se muestra "en curso…" en vez de "NaN s".
 */
function duracionDe(r: ResultadoTarea): string {
  const inicio = Date.parse(r.inicio);
  const fin = r.fin ? Date.parse(r.fin) : NaN;
  if (!Number.isFinite(inicio) || !Number.isFinite(fin)) return "en curso…";
  return duracion(fin - inicio);
}

function Resultado({ r }: { r: ResultadoTarea }) {
  return (
    <li className="tarjeta" data-testid="resultado">
      <div className="fila">
        <strong>
          {ICONO_ESTADO[r.estado] ?? "•"} {r.tarea}
        </strong>
        <span className="sub">{r.estado}</span>
      </div>
      <p className="titulo-tarea">{r.titulo}</p>
      <p className="resumen">
        {duracionDe(r)} · {r.turnos} turnos · {r.tokens.toLocaleString("es-AR")} tokens
      </p>
      {r.pr && (
        <p className="detalle-extra">
          <a data-testid="link-pr" href={r.pr}>
            Ver PR
          </a>
        </p>
      )}
      {r.pregunta && (
        <p className="pregunta">
          <span className="sub">Pregunta del agente: </span>
          <span data-testid="pregunta">{r.pregunta}</span>
        </p>
      )}
    </li>
  );
}

function Reporte({ fecha }: { fecha: string }) {
  const [texto, setTexto] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const ver = async () => {
    // El reporte es text/markdown, no JSON: se pide con fetch y se muestra tal cual.
    try {
      const r = await fetch(`/api/noches/${encodeURIComponent(fecha)}/reporte`);
      if (!r.ok) {
        setError("No se pudo traer el reporte");
        return;
      }
      setError(null);
      setTexto(await r.text());
    } catch {
      setError("No se pudo traer el reporte");
    }
  };

  return (
    <div className="tarjeta reporte-bloque">
      <button className="boton" data-testid="ver-reporte" onClick={ver}>
        Ver reporte
      </button>
      {error !== null && (
        <p className="tarjeta error-texto" data-testid="error-reporte">
          {error}
        </p>
      )}
      {texto !== null && (
        <pre className="mono reporte" data-testid="reporte">
          {texto}
        </pre>
      )}
    </div>
  );
}
