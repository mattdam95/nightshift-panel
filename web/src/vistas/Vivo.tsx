import { useEffect, useRef, useState } from "react";
import { NOMBRE_ACCION, accionesVisibles, textoConfirmacion } from "../../../src/contrato/acciones";
import { ETAPAS_TAREA } from "../../../src/contrato/eventos";
import { limiteTarea, type TareaVivo } from "../../../src/contrato/vivo";
import { Icono, IconoEstado } from "../componentes/Icono";
import { duracion, hora, horaCorta, NOMBRE_ETAPA } from "../formato";
import { enlace } from "../ruta";
import "../estilos/vivo.css";
import { useAcciones } from "../useAcciones";
import type { Vivo as DatosVivo } from "../useVivo";

function useAhora(cadaMs = 1000): number {
  const [ahora, setAhora] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setAhora(Date.now()), cadaMs);
    return () => clearInterval(t);
  }, [cadaMs]);
  return ahora;
}

export function Vivo({ datos }: { datos: DatosVivo }) {
  const { vivo, estadoPc } = datos;
  const ahora = useAhora();
  const noche = vivo.noche;
  const { pendiente, enviando, resultado, pedir, cancelar, confirmar } = useAcciones();
  const refConfirmacion = useRef<HTMLDivElement>(null);
  const acciones = accionesVisibles(estadoPc, noche?.activa === true);
  const enCola = vivo.cola.filter((id) => id !== vivo.tarea?.id && !vivo.terminadas.some((t) => t.id === id));

  // La confirmación vive en la zona de acciones (arriba): al abrirla se trae a la vista
  // (para el reintentar, cuyo botón está abajo en la lista de terminadas).
  useEffect(() => {
    if (pendiente) refConfirmacion.current?.scrollIntoView({ block: "nearest" });
  }, [pendiente]);

  return (
    <section className="vista" data-testid="vista-vivo">
      <header className="cabecera">
        <div className="cabecera-acciones">
          <button
            type="button"
            className="capsula vidrio-amarillo"
            data-testid="accion-juego"
            disabled={enviando}
            onClick={() => pedir("juego")}
          >
            <Icono nombre="juego" tam={22} />
            {NOMBRE_ACCION.juego}
          </button>
        </div>
        <h1>En vivo</h1>
        <div className="cabecera-fila">
          <p className="subtitulo" data-testid="titulo-noche">
            {noche?.activa
              ? `Noche en curso · desde ${horaCorta(noche.inicio)}`
              : noche
                ? `Noche terminada · ${noche.fin?.motivo ?? ""}`
                : "Sin noche"}
            {noche?.hasta && noche.activa && ` · Hasta las ${horaCorta(noche.hasta)}`}
          </p>
          {(acciones.length > 0 || pendiente || resultado) && (
            <div className="acciones-v2" data-testid="acciones">
              {acciones.length > 0 && (
                <div className="fila acciones-fila">
                  {acciones.map((a) => (
                    <button
                      key={a}
                      type="button"
                      className="capsula vidrio"
                      data-testid={`accion-${a}`}
                      disabled={enviando}
                      onClick={() => pedir(a)}
                    >
                      {a === "pausar" && <Icono nombre="pausa" tam={15} />}
                      {NOMBRE_ACCION[a]}
                    </button>
                  ))}
                </div>
              )}
              {pendiente && (
                <div className="confirmacion tile" data-testid="confirmacion" ref={refConfirmacion}>
                  <p>{textoConfirmacion(pendiente.accion, pendiente.tarea)}</p>
                  <div className="fila">
                    <button type="button" className="capsula vidrio" data-testid="confirmar-accion" disabled={enviando} onClick={confirmar}>
                      Confirmar
                    </button>
                    <button type="button" className="capsula vidrio" data-testid="cancelar-accion" disabled={enviando} onClick={cancelar}>
                      Cancelar
                    </button>
                  </div>
                  {enviando && <p className="sub">Enviando…</p>}
                </div>
              )}
              {resultado && (
                <p
                  data-testid="resultado-accion"
                  data-ok={String(resultado.ok)}
                  className={`tile resultado-accion${resultado.ok ? "" : " error-texto"}`}
                >
                  {resultado.mensaje}
                </p>
              )}
            </div>
          )}
        </div>
      </header>

      {vivo.tarea ? (
        <TareaEnCurso tarea={vivo.tarea} limite={limiteTarea(vivo)} ahora={ahora} />
      ) : (
        <div className="tarjeta vacio-vivo">
          <span className="vacio-circulo">
            <Icono nombre="vivo" tam={30} />
          </span>
          <p className="vacio-titulo">No hay ninguna tarea corriendo.</p>
          <p className="subtitulo">La próxima noche se arma desde la Mac o con /armar en Telegram.</p>
        </div>
      )}

      {enCola.length > 0 && (
        <>
          <h2>En cola</h2>
          <ul className="grupo" data-testid="cola-vivo">
            {enCola.map((id) => {
              const [repo, numero] = id.split("#");
              return (
                <li key={id} className="grupo-fila">
                  <div className="fila-texto">
                    <span>#{numero}</span>
                    <span className="sub">{repo}</span>
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}

      {vivo.terminadas.length > 0 && (
        <>
          <h2>Terminadas esta noche</h2>
          <ul className="grupo" data-testid="terminadas">
            {[...vivo.terminadas].reverse().map((t) => (
              <li key={t.id + t.inicio} className="grupo-fila" data-testid="terminada">
                <IconoEstado estado={t.estado} tam={20} />
                <div className="fila-texto">
                  <a href={enlace("tarea", ...t.id.replace("#", "/").split("/"))}>{t.id}</a>
                  <span className="sub">{t.titulo || t.motivo}</span>
                </div>
                <div className="fila-botones">
                  {t.pr && (
                    <a href={t.pr} className="capsula vidrio-azul capsula-chica">
                      PR
                    </a>
                  )}
                  {t.estado === "bloqueada" && (
                    <button
                      type="button"
                      className="capsula vidrio capsula-chica"
                      data-testid="accion-reintentar"
                      disabled={enviando}
                      onClick={() => pedir("reintentar", t.id)}
                    >
                      {NOMBRE_ACCION.reintentar}
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </>
      )}

      {vivo.avisos.length > 0 && (
        <details className="grupo" data-testid="avisos">
          <summary className="grupo-fila">Avisos del sistema ({vivo.avisos.length})</summary>
          <ul className="lista-simple mono">
            {[...vivo.avisos].reverse().map((a, i) => (
              <li key={i}>
                {hora(a.ts)} {a.tipo} {a.mensaje}
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}

function TareaEnCurso({ tarea, limite, ahora }: { tarea: TareaVivo; limite: Date | null; ahora: number }) {
  const actual = ETAPAS_TAREA.indexOf(tarea.etapa);
  return (
    <details open className="tarjeta destacada" data-testid="tarea-en-curso">
      <summary className="tarea-resumen">
        <strong data-testid="tarea-id">{tarea.id}</strong>
        <span className={`chip ${tarea.maquina}`} data-testid="tarea-maquina">
          {tarea.maquina === "mac" ? "Mac" : "PC"}
        </span>
        <span className="flecha" aria-hidden="true">
          ▾
        </span>
      </summary>
      {tarea.titulo && <p className="titulo-tarea">{tarea.titulo}</p>}

      <ol className="etapas" aria-label="Etapas">
        {ETAPAS_TAREA.map((e, i) => (
          <li
            key={e}
            className={i < actual ? "hecha" : i === actual ? "actual" : ""}
            data-testid={i === actual ? "etapa-actual" : undefined}
          >
            {NOMBRE_ETAPA[e]}
          </li>
        ))}
      </ol>

      <dl className="numeros">
        <div>
          <dt>Transcurrido</dt>
          <dd>{duracion(ahora - Date.parse(tarea.inicio))}</dd>
        </div>
        <div>
          <dt>Queda</dt>
          <dd data-testid="tiempo-restante">{limite ? duracion(limite.getTime() - ahora) : "—"}</dd>
        </div>
        <div>
          <dt>Turnos</dt>
          <dd data-testid="turnos">
            {tarea.turnos}
            {tarea.presupuesto ? ` / ${tarea.presupuesto.maxTurnos}` : ""}
          </dd>
        </div>
        <div>
          <dt>Tokens</dt>
          <dd>{tarea.tokens.toLocaleString("es-AR")}</dd>
        </div>
      </dl>

      {tarea.verificacion.length > 0 && (
        <ul className="lista-simple mono" data-testid="verificacion">
          {tarea.verificacion.map((p, i) => (
            <li key={i}>
              {p.ok ? "✓" : "✗"} {p.comando}
            </li>
          ))}
        </ul>
      )}
      {tarea.revision && (
        <p data-testid="veredicto">
          Revisor: <strong>{tarea.revision.veredicto}</strong>
          {tarea.revision.problemas.length > 0 && ` · ${tarea.revision.problemas.length} problema(s)`}
        </p>
      )}

      <details data-testid="herramientas">
        <summary>Herramientas ({tarea.herramientas.length})</summary>
        <ul className="feed mono" data-testid="feed-herramientas">
          {[...tarea.herramientas].reverse().map((h, i) => (
            <li key={h.ts + i} className={h.error ? "error" : ""} data-testid="herramienta">
              <span className="sub">{hora(h.ts)}</span> {h.nombre} · {h.resumen}
            </li>
          ))}
        </ul>
      </details>
    </details>
  );
}
