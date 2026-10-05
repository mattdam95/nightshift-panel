import { useEffect, useState } from "react";
import type { Estadisticas, ResumenNoche } from "../../../src/contrato/api";
import { obtener } from "../api";
import { IconoEstado } from "../componentes/Icono";
import { enlace } from "../ruta";

type Semana = Estadisticas["semanas"][number];

const UN_DECIMAL = { minimumFractionDigits: 1, maximumFractionDigits: 1 } as const;

/** «67 %»; «—» si la semana no tiene tareas. */
const tasaTexto = (s: Semana) => (s.tareas === 0 ? "—" : `${Math.round(s.tasaExito * 100)} %`);

/** «20,0 min» (siempre un decimal, es-AR); «—» si la semana no tiene tareas. */
const minutosTexto = (s: Semana) => (s.tareas === 0 ? "—" : `${s.minutosPromedio.toLocaleString("es-AR", UN_DECIMAL)} min`);

/** «2,0 rondas» (siempre un decimal, es-AR); «—» si la semana no tiene tareas. */
const rondasTexto = (s: Semana) => (s.tareas === 0 ? "—" : `${s.rondasRevisionPromedio.toLocaleString("es-AR", UN_DECIMAL)} rondas`);

/** «28/09» a partir de «2026-09-28». */
const diaMes = (desde: string) => `${desde.slice(8, 10)}/${desde.slice(5, 7)}`;

/**
 * Bloque de estadísticas semanales: «Esta semana» (la última del arreglo) y una barra por
 * semana, la más vieja a la izquierda. Las semanas sin tareas llevan `data-vacia` y barra casi nula.
 */
function BloqueEstadisticas({ estadisticas }: { estadisticas: Estadisticas }) {
  const actual = estadisticas.semanas[estadisticas.semanas.length - 1];
  if (actual === undefined) return null;
  return (
    <div className="tarjeta" data-testid="estadisticas">
      <h2>Esta semana</h2>
      <div className="estadisticas-resumen">
        <div className="estadistica">
          <span className="sub">Tasa de éxito</span>
          <span className="valor" data-testid="estadisticas-tasa">
            {tasaTexto(actual)}
          </span>
        </div>
        <div className="estadistica">
          <span className="sub">Minutos por tarea</span>
          <span className="valor" data-testid="estadisticas-minutos">
            {minutosTexto(actual)}
          </span>
        </div>
        <div className="estadistica">
          <span className="sub">Rondas de revisión</span>
          <span className="valor" data-testid="estadisticas-rondas">
            {rondasTexto(actual)}
          </span>
        </div>
      </div>
      <div className="barras-semanas">
        {estadisticas.semanas.map((s) => {
          const pct = s.tareas === 0 ? 0 : Math.round(s.tasaExito * 100);
          return (
            <div
              key={s.desde}
              className="barra-semana"
              data-testid="barra-semana"
              data-desde={s.desde}
              data-tasa={pct}
              {...(s.tareas === 0 ? { "data-vacia": "true" } : {})}
              style={{ height: `${pct}%` }}
              aria-label={s.tareas === 0 ? `Semana del ${diaMes(s.desde)}: sin tareas` : `Semana del ${diaMes(s.desde)}: ${pct} %`}
            />
          );
        })}
      </div>
    </div>
  );
}

export function Historial(_props: { params: string[] }) {
  const [noches, setNoches] = useState<ResumenNoche[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [estadisticas, setEstadisticas] = useState<Estadisticas | null>(null);
  const [errorEstadisticas, setErrorEstadisticas] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    obtener<ResumenNoche[]>("/api/noches")
      .then((n) => vivo && setNoches(n))
      .catch((e: Error) => vivo && setError(e.message));
    return () => {
      vivo = false;
    };
  }, []);

  // Pedido independiente del de las noches: si falla, solo se ve el error y la lista sigue funcionando.
  useEffect(() => {
    let vivo = true;
    obtener<Estadisticas>("/api/estadisticas?semanas=8")
      .then((e) => vivo && setEstadisticas(e))
      .catch((e: Error) => vivo && setErrorEstadisticas(e.message));
    return () => {
      vivo = false;
    };
  }, []);

  return (
    <section className="vista" data-testid="vista-historial">
      <header className="cabecera">
        <h1>Historial de noches</h1>
      </header>

      {errorEstadisticas !== null && (
        <p className="tarjeta error-texto" data-testid="error-estadisticas">
          {errorEstadisticas}
        </p>
      )}
      {estadisticas !== null && <BloqueEstadisticas estadisticas={estadisticas} />}

      {error && (
        <p className="tarjeta error-texto" data-testid="error">
          {error}
        </p>
      )}
      {!error && noches === null && <p className="vacio">Cargando…</p>}
      {noches !== null && noches.length === 0 && <p className="vacio">Todavía no hay noches registradas.</p>}

      {noches && noches.length > 0 && (
        <ul className="lista-noches">
          {noches.map((n) => (
            <li key={n.fecha}>
              <a className="noche" href={enlace("noche", n.fecha)} data-testid="noche">
                <span className="fecha">{n.fecha}</span>
                <span className="sub">{n.tareas === 1 ? "1 tarea" : `${n.tareas} tareas`}</span>
                <span className="estados">
                  {Object.entries(n.estados).map(([estado, cantidad]) => (
                    <span key={estado} className={`estado ${estado}`}>
                      <IconoEstado estado={estado} />
                      {cantidad > 1 ? ` ×${cantidad}` : ""}
                    </span>
                  ))}
                </span>
                {n.fin === null && (
                  <span className="chip en-curso" data-testid="noche-en-curso">
                    En curso
                  </span>
                )}
              </a>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
