import { useEffect, useState } from "react";
import type { DetalleNoche, ResultadoTarea } from "../../../src/contrato/api";
import type { Evento } from "../../../src/contrato/eventos";
import { partirTarea } from "../../../src/contrato/eventos";
import { obtener } from "../api";
import { Icono, IconoEstado } from "../componentes/Icono";
import { LineaTiempoTareas } from "../componentes/LineaTiempoTareas";
import "../estilos/noche.css";
import { duracion, fechaLarga, horaCorta } from "../formato";

export function Noche({ params }: { params: string[] }) {
  const fecha = params[0] ?? "";
  const [detalle, setDetalle] = useState<DetalleNoche | null>(null);
  const [eventos, setEventos] = useState<Evento[]>([]);
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

  useEffect(() => {
    if (!fecha) return;
    let vivo = true;
    setEventos([]);
    obtener<Evento[]>(`/api/noches/${encodeURIComponent(fecha)}/eventos`)
      .then((e) => vivo && setEventos(e))
      .catch(() => vivo && setEventos([]));
    return () => {
      vivo = false;
    };
  }, [fecha]);

  return (
    <section className="vista" data-testid="vista-noche">
      <header className="cabecera">
        <div className="cabecera-volver">
          <a href="#/historial" className="boton-redondo vidrio" aria-label="Volver al historial" data-testid="volver">
            <Icono nombre="atras" tam={22} />
          </a>
        </div>
        <h1>{fechaLarga(fecha)}</h1>
        {detalle && (
          <p className="subtitulo" data-testid="subtitulo-noche">
            {subtitulo(detalle, eventos)}
          </p>
        )}
      </header>

      {error && (
        <p className="tarjeta error-texto" data-testid="error">
          {error}
        </p>
      )}
      {!error && detalle === null && <p className="vacio">Cargando…</p>}

      {detalle && (
        <>
          <LineaTiempoTareas eventos={eventos} resultados={detalle.resultados} />
          <ul className="grupo">
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

/** «22:00 a 07:59 · 2 tareas»; sin eventos, solo «2 tareas»; con la noche abierta suma « · En curso». */
function subtitulo(detalle: DetalleNoche, eventos: Evento[]): string {
  const n = detalle.resultados.length;
  const tareas = n === 1 ? "1 tarea" : `${n} tareas`;
  const instantes = eventos.map((e) => Date.parse(e.ts)).filter(Number.isFinite);
  const rango =
    instantes.length > 0
      ? `${horaCorta(new Date(Math.min(...instantes)).toISOString())} a ${horaCorta(new Date(Math.max(...instantes)).toISOString())} · `
      : "";
  return `${rango}${tareas}${detalle.fin === null ? " · En curso" : ""}`;
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
  const partes = partirTarea(r.tarea);
  return (
    <li className="resultado-v2" data-testid="resultado">
      <IconoEstado estado={r.estado} tam={24} />
      <div className="resultado-cuerpo">
        <span className="sub resultado-etiqueta">
          {partes ? `#${partes.numero}` : r.tarea} · {r.estado}
        </span>
        <span className="resultado-titulo">{r.titulo}</span>
        <span className="sub resultado-resumen">
          {duracionDe(r)} · {r.turnos} turnos · {r.tokens.toLocaleString("es-AR")} tokens
        </span>
        {r.pr && (
          <a className="capsula vidrio-azul" data-testid="link-pr" href={r.pr}>
            <Icono nombre="pr" tam={16} />
            Ver PR
          </a>
        )}
        {r.pregunta && (
          <p className="tile resultado-pregunta">
            <span className="sub">Pregunta del agente: </span>
            <span data-testid="pregunta">{r.pregunta}</span>
          </p>
        )}
      </div>
    </li>
  );
}

function Reporte({ fecha }: { fecha: string }) {
  const [texto, setTexto] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const ver = async () => {
    // El reporte es text/markdown, no JSON: se pide con fetch y se muestra tal cual,
    // sin recortar ni agregar nada. El archivo de la copia de datos trae el encabezado
    // `# Noche del <fecha>` y el test de aceptación espera ver `# Noche del <fecha>`
    // dentro del pre (que incluye el texto `Noche del <fecha>` que pide la spec).
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
    <div className="reporte-bloque">
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
