import { useEffect, useState } from "react";
import type { ResumenNoche } from "../../../src/contrato/api";
import { obtener } from "../api";
import { ICONO_ESTADO } from "../formato";
import { enlace } from "../ruta";

export function Historial(_props: { params: string[] }) {
  const [noches, setNoches] = useState<ResumenNoche[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    obtener<ResumenNoche[]>("/api/noches")
      .then((n) => vivo && setNoches(n))
      .catch((e: Error) => vivo && setError(e.message));
    return () => {
      vivo = false;
    };
  }, []);

  return (
    <section className="vista" data-testid="vista-historial">
      <header className="cabecera">
        <h1>Historial de noches</h1>
      </header>

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
                      {ICONO_ESTADO[estado] ?? "•"}
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
