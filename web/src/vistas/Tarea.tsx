import { useEffect, useState } from "react";
import type { DetalleTarea, ResultadoTarea } from "../../../src/contrato/api";
import { agruparPorEtapa, pasosDeVerificacion } from "../../../src/contrato/tarea";
import { obtener } from "../api";
import { duracion, hora, ICONO_ESTADO, NOMBRE_ETAPA } from "../formato";

export function Tarea({ params }: { params: string[] }) {
  const [owner, repo, n] = params;
  const valida = params.length === 3 && /^\d+$/.test(n ?? "");
  const [detalle, setDetalle] = useState<DetalleTarea | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!valida) {
      setDetalle(null);
      setError("Tarea inválida");
      return;
    }
    let vivo = true;
    // Al cambiar de tarea se limpia lo anterior: error y datos viejos no comparten pantalla.
    setDetalle(null);
    setError(null);
    obtener<DetalleTarea>(`/api/tareas/${encodeURIComponent(owner ?? "")}/${encodeURIComponent(repo ?? "")}/${n}`)
      .then((d) => vivo && setDetalle(d))
      .catch((e: Error) => vivo && setError(e.message));
    return () => {
      vivo = false;
    };
  }, [owner, repo, n, valida]);

  const resultado = detalle?.resultado ?? null;

  return (
    <section className="vista" data-testid="vista-tarea">
      {error !== null && (
        <p className="tarjeta error-texto" data-testid="error-tarea">
          {error}
        </p>
      )}
      {!error && detalle === null && <p className="vacio">Cargando…</p>}

      {detalle && (
        <>
          <header className="cabecera">
            <div className="fila">
              <h1 data-testid="tarea-titulo">{resultado ? resultado.titulo : detalle.id}</h1>
              <span className={resultado ? "chip" : "chip en-curso"} data-testid="tarea-estado">
                {resultado ? `${ICONO_ESTADO[resultado.estado] ?? ""} ${resultado.estado}` : "En curso"}
              </span>
            </div>
          </header>

          {resultado && (
            <dl className="numeros">
              <div>
                <dt>Duración</dt>
                <dd data-testid="tarea-duracion">{duracionDe(resultado)}</dd>
              </div>
              <div>
                <dt>Turnos</dt>
                <dd data-testid="tarea-turnos">{resultado.turnos}</dd>
              </div>
              <div>
                <dt>Tokens</dt>
                <dd data-testid="tarea-tokens">{resultado.tokens.toLocaleString("es-AR")}</dd>
              </div>
            </dl>
          )}

          {detalle.spec !== null ? (
            <details className="tarjeta spec" data-testid="spec">
              <summary>Spec</summary>
              <pre className="mono">{detalle.spec}</pre>
            </details>
          ) : (
            <p className="vacio" data-testid="spec-no-disponible">
              No se pudo traer la spec
            </p>
          )}

          <PasosVerificacion pasos={pasosDeVerificacion(detalle)} />

          <section className="tarjeta revisor">
            <p data-testid="veredicto">
              <span className="sub">Revisión: </span>
              {resultado?.revision ? resultado.revision.estado : "Sin revisión"}
            </p>
            {resultado?.revision && resultado.revision.problemas.length > 0 && (
              <ul className="lista-simple">
                {resultado.revision.problemas.map((p) => (
                  <li key={p} className="error-texto" data-testid="problema">
                    {p}
                  </li>
                ))}
              </ul>
            )}
          </section>

          {resultado?.notaAgente && (
            <p className="tarjeta" data-testid="nota-agente">
              <span className="sub">Nota del agente: </span>
              {resultado.notaAgente}
            </p>
          )}
          {resultado && resultado.avisos.length > 0 && (
            <ul className="tarjeta lista-simple" data-testid="avisos-tarea">
              {resultado.avisos.map((a, i) => (
                <li key={`${a}-${i}`}>{a}</li>
              ))}
            </ul>
          )}
          {resultado?.pr && (
            <a className="boton" data-testid="link-pr" href={resultado.pr} target="_blank" rel="noopener noreferrer">
              Ver PR
            </a>
          )}

          {agruparPorEtapa(detalle.eventos).map((g, i) => (
            <details className="tarjeta etapa" data-testid="etapa-eventos" key={`${g.etapa}-${i}`}>
              <summary>
                {NOMBRE_ETAPA[g.etapa] ?? g.etapa} ({g.eventos.length})
              </summary>
              <ul className="lista-simple">
                {g.eventos.map((e, j) => (
                  <li key={j} className="mono">
                    {hora(e.ts)} · {e.tipo}
                  </li>
                ))}
              </ul>
            </details>
          ))}
        </>
      )}
    </section>
  );
}

function PasosVerificacion({ pasos }: { pasos: { comando: string; ok: boolean }[] }) {
  if (pasos.length === 0) return null;
  return (
    <ul className="tarjeta lista-simple" data-testid="verificacion-pasos">
      {pasos.map((p, i) => (
        <li
          key={`${p.comando}-${i}`}
          className={p.ok ? "paso paso-ok" : "paso paso-falla"}
          data-testid="paso-verificacion"
          data-ok={p.ok ? "true" : "false"}
        >
          {p.ok ? "✓" : "✗"} {p.comando}
        </li>
      ))}
    </ul>
  );
}

/** fin e inicio son ISO obligatorios en `ResultadoTarea`; igual que en Noche, se defiende de fechas raras. */
function duracionDe(r: ResultadoTarea): string {
  const inicio = Date.parse(r.inicio);
  const fin = Date.parse(r.fin);
  return Number.isFinite(inicio) && Number.isFinite(fin) ? duracion(fin - inicio) : "en curso…";
}
