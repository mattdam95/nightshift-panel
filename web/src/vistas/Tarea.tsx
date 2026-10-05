import { useEffect, useRef, useState } from "react";
import type { DetalleTarea, ResultadoTarea } from "../../../src/contrato/api";
import { agruparPorEtapa, pasosDeVerificacion } from "../../../src/contrato/tarea";
import { Diff } from "../componentes/Diff";
import { Icono, IconoEstado } from "../componentes/Icono";
import "../estilos/tarea.css";
import { obtener, obtenerTexto } from "../api";
import { duracion, hora, NOMBRE_ETAPA } from "../formato";

const mayuscula = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

/** Color del chip de estado (variantes de `tarea.css`); lo que no se conoce queda en gris. */
const CLASE_ESTADO: Record<string, string> = {
  lista: "est-ok",
  bloqueada: "est-error",
  error: "est-error",
  timeout: "est-acento",
};

/** Número de la PR sacado de la URL `…/pull/N`; null si no se puede. */
const numeroPr = (url: string): string | null => /\/pull\/(\d+)/.exec(url)?.[1] ?? null;

const TEXTO_REVISION = {
  aprobar: { texto: "Aprobó", clase: "est-ok" },
  cambios: { texto: "Pidió cambios", clase: "est-acento" },
  "no-disponible": { texto: "No disponible", clase: "est-sub" },
} as const;

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
    <section className="vista detalle-tarea" data-testid="vista-tarea">
      {error !== null && (
        <p className="tarjeta error-texto" data-testid="error-tarea">
          {error}
        </p>
      )}
      {!error && detalle === null && <p className="vacio">Cargando…</p>}

      {detalle && (
        <>
          <header className="cabecera">
            <div className="tarea-barra">
              <button
                type="button"
                className="boton-redondo vidrio"
                aria-label="Volver"
                data-testid="volver"
                onClick={() => window.history.back()}
              >
                <Icono nombre="atras" tam={22} />
              </button>
              {resultado?.pr && (
                <a className="capsula vidrio-azul" data-testid="link-pr" href={resultado.pr} target="_blank" rel="noopener noreferrer">
                  <Icono nombre="pr" tam={18} />
                  {numeroPr(resultado.pr) ? `PR #${numeroPr(resultado.pr)}` : "Ver PR"}
                </a>
              )}
            </div>
            <p className="mono sub tarea-ref" data-testid="tarea-ref">
              {detalle.id}
            </p>
            <h1 data-testid="tarea-titulo">{resultado ? resultado.titulo : detalle.id}</h1>
            <div className="tarea-estado-fila">
              <span
                className={resultado ? `chip ${CLASE_ESTADO[resultado.estado] ?? "est-sub"}` : "chip en-curso"}
                data-testid="tarea-estado"
              >
                {resultado ? (
                  <>
                    <IconoEstado estado={resultado.estado} tam={16} /> {mayuscula(resultado.estado)}
                  </>
                ) : (
                  "En curso"
                )}
              </span>
            </div>
          </header>

          {resultado && (
            <dl className="numeros">
              <div className="tile">
                <dt className="tile-etiqueta">Duración</dt>
                <dd className="tile-valor" data-testid="tarea-duracion">
                  {duracionDe(resultado)}
                </dd>
              </div>
              <div className="tile">
                <dt className="tile-etiqueta">Turnos</dt>
                <dd className="tile-valor" data-testid="tarea-turnos">
                  {resultado.turnos}
                </dd>
              </div>
              <div className="tile">
                <dt className="tile-etiqueta">Tokens</dt>
                <dd className="tile-valor" data-testid="tarea-tokens">
                  {resultado.tokens.toLocaleString("es-AR")}
                </dd>
              </div>
            </dl>
          )}

          {detalle.spec !== null ? (
            <div className="grupo">
              <details className="spec" data-testid="spec">
                <summary className="grupo-fila">
                  <span>Spec</span>
                  <span className="flecha-giro" aria-hidden="true">
                    <Icono nombre="abajo" tam={18} />
                  </span>
                </summary>
                <pre className="mono">{detalle.spec}</pre>
              </details>
            </div>
          ) : (
            <p className="vacio" data-testid="spec-no-disponible">
              No se pudo traer la spec
            </p>
          )}

          <PasosVerificacion pasos={pasosDeVerificacion(detalle)} />

          <h2>Revisión</h2>
          <div className="grupo">
            <div className="grupo-fila">
              <span>Revisor local</span>
              <span
                className={`chip ${resultado?.revision ? TEXTO_REVISION[resultado.revision.estado].clase : "est-sub"}`}
                data-testid="veredicto"
              >
                {resultado?.revision ? TEXTO_REVISION[resultado.revision.estado].texto : "Sin revisión"}
              </span>
            </div>
            {resultado?.revision?.problemas.map((p) => (
              <div key={p} className="grupo-fila error-texto" data-testid="problema">
                {p}
              </div>
            ))}
          </div>

          {resultado?.notaAgente && (
            <>
              <h2>Nota del agente</h2>
              <p className="tarjeta nota-agente" data-testid="nota-agente">
                {resultado.notaAgente}
              </p>
            </>
          )}
          {resultado && resultado.avisos.length > 0 && (
            <ul className="grupo" data-testid="avisos-tarea">
              {resultado.avisos.map((a, i) => (
                <li key={`${a}-${i}`} className="grupo-fila aviso-fila">
                  {a}
                </li>
              ))}
            </ul>
          )}

          {agruparPorEtapa(detalle.eventos).length > 0 && (
            <>
              <h2>Eventos</h2>
              <div className="grupo">
                {agruparPorEtapa(detalle.eventos).map((g, i) => (
                  <details className="etapa" data-testid="etapa-eventos" key={`${g.etapa}-${i}`}>
                    <summary className="grupo-fila">
                      <span>{mayuscula(NOMBRE_ETAPA[g.etapa] ?? g.etapa)}</span>
                      <span className="eventos-der sub">
                        {g.eventos.length}
                        <Icono nombre="derecha" tam={18} />
                      </span>
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
              </div>
            </>
          )}

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
    <>
      <h2>Verificación</h2>
      <ul className="grupo" data-testid="verificacion-pasos">
        {pasos.map((p, i) => (
          <li key={`${p.comando}-${i}`} className="grupo-fila paso-fila" data-testid="paso-verificacion" data-ok={p.ok ? "true" : "false"}>
            <IconoEstado estado={p.ok ? "lista" : "bloqueada"} tam={20} />
            <span className="mono comando-paso">{p.comando}</span>
          </li>
        ))}
      </ul>
    </>
  );
}

/** fin e inicio son ISO obligatorios en `ResultadoTarea`; igual que en Noche, se defiende de fechas raras. */
function duracionDe(r: ResultadoTarea): string {
  const inicio = Date.parse(r.inicio);
  const fin = Date.parse(r.fin);
  return Number.isFinite(inicio) && Number.isFinite(fin) ? duracion(fin - inicio) : "en curso…";
}
