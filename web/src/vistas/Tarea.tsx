import { useEffect, useRef, useState } from "react";
import type { DetalleTarea, ResultadoTarea } from "../../../src/contrato/api";
import { agruparPorEtapa, pasosDeVerificacion } from "../../../src/contrato/tarea";
import { Diff } from "../componentes/Diff";
import { obtener, obtenerTexto } from "../api";
import { duracion, hora, ICONO_ESTADO, NOMBRE_ETAPA } from "../formato";

export function Tarea({ params }: { params: string[] }) {
  const [owner, repo, n] = params;
  const valida = params.length === 3 && /^\d+$/.test(n ?? "");
  const [detalle, setDetalle] = useState<DetalleTarea | null>(null);
  const [error, setError] = useState<string | null>(null);
  // El diff se pide recién cuando se abre el bloque; se descarta todo al cambiar de tarea.
  const [diffTexto, setDiffTexto] = useState<string | null>(null);
  const [diffError, setDiffError] = useState<string | null>(null);
  const [diffPedido, setDiffPedido] = useState(false);
  // Generación: cada cambio de tarea invalida las respuestas de diff en vuelo (mismo patrón de `vivo`).
  const generacion = useRef(0);

  useEffect(() => {
    generacion.current += 1;
    if (!valida) {
      setDetalle(null);
      setError("Tarea inválida");
      return;
    }
    let vivo = true;
    // Al cambiar de tarea se limpia lo anterior: error y datos viejos no comparten pantalla.
    setDetalle(null);
    setError(null);
    setDiffTexto(null);
    setDiffError(null);
    setDiffPedido(false);
    obtener<DetalleTarea>(`/api/tareas/${encodeURIComponent(owner ?? "")}/${encodeURIComponent(repo ?? "")}/${n}`)
      .then((d) => vivo && setDetalle(d))
      .catch((e: Error) => vivo && setError(e.message));
    return () => {
      vivo = false;
    };
  }, [owner, repo, n, valida]);

  const resultado = detalle?.resultado ?? null;

  // El `open` del <details> lo maneja el DOM: solo se pide la primera vez que se abre.
  const alAbrirDiff = (e: React.SyntheticEvent<HTMLDetailsElement>) => {
    if (!e.currentTarget.open) return;
    if (diffPedido || diffTexto !== null || diffError !== null) return;
    setDiffPedido(true);
    // Si cambiamos de tarea antes de que llegue la respuesta, la generación ya cambió y se descarta.
    const generacionActual = generacion.current;
    obtenerTexto(`/api/tareas/${encodeURIComponent(owner ?? "")}/${encodeURIComponent(repo ?? "")}/${n}/diff`)
      .then((t) => {
        if (generacionActual === generacion.current) setDiffTexto(t);
      })
      .catch((err: Error) => {
        if (generacionActual === generacion.current) setDiffError(err.message);
      });
  };

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

          <details className="tarjeta diff" data-testid="diff-tarea" key={`${owner}/${repo}/${n}`} onToggle={alAbrirDiff}>
            <summary>Cambios (diff)</summary>
            {diffPedido && diffTexto === null && diffError === null && (
              <p className="vacio" data-testid="diff-cargando">
                Cargando…
              </p>
            )}
            {diffTexto !== null && <Diff texto={diffTexto} />}
            {diffError !== null && (
              <p className="error-texto" data-testid="diff-error">
                {diffError}
              </p>
            )}
          </details>
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
