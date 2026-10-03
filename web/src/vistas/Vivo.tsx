import { useEffect, useRef, useState } from "react";
import { NOMBRE_ACCION, accionesVisibles, textoConfirmacion } from "../../../src/contrato/acciones";
import { ETAPAS_TAREA } from "../../../src/contrato/eventos";
import { limiteTarea, type TareaVivo } from "../../../src/contrato/vivo";
import { duracion, hora, horaCorta, ICONO_ESTADO, NOMBRE_ETAPA } from "../formato";
import { enlace } from "../ruta";
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

  // La confirmación vive en la tarjeta de acciones (arriba): al abrirla se trae a la vista
  // (para el reintentar, cuyo botón está abajo en la lista de terminadas).
  useEffect(() => {
    if (pendiente) refConfirmacion.current?.scrollIntoView({ block: "nearest" });
  }, [pendiente]);

  return (
    <section className="vista" data-testid="vista-vivo">
      <header className="cabecera">
        <h1 data-testid="titulo-noche">
          {noche?.activa
            ? `Noche en curso · desde ${horaCorta(noche.inicio)}`
            : noche
              ? `Noche terminada · ${noche.fin?.motivo ?? ""}`
              : "Sin noche"}
        </h1>
        {noche?.hasta && noche.activa && <p className="sub">Hasta las {horaCorta(noche.hasta)}</p>}
      </header>

      <div className="tarjeta" data-testid="acciones">
        <div className="fila acciones-fila">
          {accionesVisibles(estadoPc).map((a) => (
            <button key={a} type="button" className="boton" data-testid={`accion-${a}`} disabled={enviando} onClick={() => pedir(a)}>
              {NOMBRE_ACCION[a]}
            </button>
          ))}
        </div>
        {pendiente && (
          <div className="confirmacion" data-testid="confirmacion" ref={refConfirmacion}>
            <p>{textoConfirmacion(pendiente.accion, pendiente.tarea)}</p>
            <div className="fila">
              <button type="button" className="boton" data-testid="confirmar-accion" disabled={enviando} onClick={confirmar}>
                Confirmar
              </button>
              <button type="button" className="boton" data-testid="cancelar-accion" disabled={enviando} onClick={cancelar}>
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
            className={`tarjeta resultado-accion${resultado.ok ? "" : " error-texto"}`}
          >
            {resultado.mensaje}
          </p>
        )}
      </div>

      {vivo.tarea ? (
        <TareaEnCurso tarea={vivo.tarea} limite={limiteTarea(vivo)} ahora={ahora} />
      ) : (
        <p className="vacio">No hay ninguna tarea corriendo.</p>
      )}

      {vivo.cola.length > 0 && (
        <div className="tarjeta" data-testid="cola-vivo">
          <h2>En cola</h2>
          <ul className="lista-simple">
            {vivo.cola
              .filter((id) => id !== vivo.tarea?.id && !vivo.terminadas.some((t) => t.id === id))
              .map((id) => (
                <li key={id}>{id}</li>
              ))}
          </ul>
        </div>
      )}

      {vivo.terminadas.length > 0 && (
        <div className="tarjeta" data-testid="terminadas">
          <h2>Terminadas esta noche</h2>
          <ul className="lista-simple">
            {[...vivo.terminadas].reverse().map((t) => (
              <li key={t.id + t.inicio} data-testid="terminada">
                <span>{ICONO_ESTADO[t.estado] ?? "•"}</span> <a href={enlace("tarea", ...t.id.replace("#", "/").split("/"))}>{t.id}</a>{" "}
                <span className="sub">{t.titulo || t.motivo}</span>
                {t.pr && (
                  <>
                    {" "}
                    · <a href={t.pr}>PR</a>
                  </>
                )}
                {t.estado === "bloqueada" && (
                  <button
                    type="button"
                    className="boton"
                    data-testid="accion-reintentar"
                    disabled={enviando}
                    onClick={() => pedir("reintentar", t.id)}
                  >
                    {NOMBRE_ACCION.reintentar}
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {vivo.avisos.length > 0 && (
        <details className="tarjeta" data-testid="avisos">
          <summary>Avisos del sistema ({vivo.avisos.length})</summary>
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
    <div className="tarjeta destacada" data-testid="tarea-en-curso">
      <div className="fila">
        <strong data-testid="tarea-id">{tarea.id}</strong>
        <span className={`chip ${tarea.maquina}`} data-testid="tarea-maquina">
          {tarea.maquina === "mac" ? "Mac" : "PC"}
        </span>
      </div>
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

      <h2>Herramientas</h2>
      <ul className="feed mono" data-testid="feed-herramientas">
        {[...tarea.herramientas].reverse().map((h, i) => (
          <li key={h.ts + i} className={h.error ? "error" : ""} data-testid="herramienta">
            <span className="sub">{hora(h.ts)}</span> {h.nombre} · {h.resumen}
          </li>
        ))}
      </ul>
    </div>
  );
}
