import { useRef, useState, type PointerEvent as EventoPuntero } from "react";
import type { ResultadoTarea } from "../../../src/contrato/api";
import type { Etapa, Evento } from "../../../src/contrato/eventos";
import { ETAPAS_TAREA, partirTarea } from "../../../src/contrato/eventos";
import { filasPorTarea, franjas, segmentoEn, segmentosLupa, type FilaTarea } from "../../../src/contrato/franjas";
import { duracion, hora, horaCorta, NOMBRE_ETAPA } from "../formato";
import { IconoEstado } from "./Icono";

/** Color de cada etapa (variables de `estilos.css`, nada de hex sueltos). */
const COLOR_ETAPA: Partial<Record<Etapa, string>> = {
  preparacion: "var(--gris)",
  tests: "var(--celeste)",
  implementacion: "var(--pc)",
  verificacion: "var(--acento)",
  revision: "var(--mac)", // color de la etapa, no de la máquina: desde el 2026-10-04 la revisión corre en la PC
  entrega: "var(--ok)",
};

const mayuscula = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
const nombreMaquina = (m: string) => (m === "mac" ? "Mac" : "PC");

/** Gesto de la lupa: se mantiene el dedo `ESPERA_MS`; si se mueve más de `UMBRAL_PX` antes, es un arrastre y se cancela. */
const ESPERA_MS = 250;
const UMBRAL_PX = 8;
const ZOOM = 6;
const ANCHO_LUPA = 200;

const colorDe = (etapa: Etapa) => COLOR_ETAPA[etapa] ?? "var(--gris)";
const pctDe = (clientX: number, caja: DOMRect) =>
  caja.width > 0 ? Math.min(100, Math.max(0, ((clientX - caja.left) / caja.width) * 100)) : 0;

interface Gesto {
  x: number;
  caja: DOMRect;
  pct: number;
  activo: boolean;
  cancelado: boolean;
}

interface Seleccion {
  tarea: string;
  indice: number;
}

/**
 * Desglose de una fila: las etapas que suman 60 s o más, y también toda etapa que corrió en la Mac (es lo poco
 * frecuente y lo que vale la pena ver aunque sea corta), en el orden de las etapas: «Tests 58 min 17 s · Revisión (Mac) 2 min 40 s».
 */
function desglose(fila: FilaTarea): string {
  const partes: string[] = [];
  for (const etapa of ETAPAS_TAREA) {
    for (const maquina of ["pc", "mac"] as const) {
      const ms = fila.segmentos.filter((s) => s.etapa === etapa && s.maquina === maquina).reduce((suma, s) => suma + s.ms, 0);
      if (ms <= 0) continue;
      if (ms < 60_000 && maquina !== "mac") continue;
      partes.push(`${mayuscula(NOMBRE_ETAPA[etapa] ?? etapa)}${maquina === "mac" ? " (Mac)" : ""} ${duracion(ms)}`);
    }
  }
  return partes.join(" · ");
}

/** Una fila de la línea de tiempo: cabecera, pista con el gesto de la lupa y desglose. */
function FilaTareaVista({
  fila,
  resultado,
  seleccionado,
  alElegir,
}: {
  fila: FilaTarea;
  resultado: ResultadoTarea | undefined;
  seleccionado: number | null;
  alElegir: (tarea: string, indice: number) => void;
}) {
  const partes = partirTarea(fila.tarea);
  const numero = partes ? `#${partes.numero}` : fila.tarea;
  const [lupa, setLupa] = useState<{ pct: number; ancho: number } | null>(null);
  const gesto = useRef<Gesto | null>(null);
  const espera = useRef<number | undefined>(undefined);

  const limpiar = () => {
    window.clearTimeout(espera.current);
    gesto.current = null;
    setLupa(null);
  };

  const alBajar = (e: EventoPuntero<HTMLButtonElement>) => {
    if (e.button !== 0) return;
    limpiar();
    const caja = e.currentTarget.getBoundingClientRect();
    const actual: Gesto = { x: e.clientX, caja, pct: pctDe(e.clientX, caja), activo: false, cancelado: false };
    gesto.current = actual;
    e.currentTarget.setPointerCapture(e.pointerId);
    espera.current = window.setTimeout(() => {
      if (gesto.current !== actual || actual.cancelado) return;
      actual.activo = true;
      setLupa({ pct: actual.pct, ancho: caja.width });
    }, ESPERA_MS);
  };

  const alMover = (e: EventoPuntero<HTMLButtonElement>) => {
    const g = gesto.current;
    if (!g || g.cancelado) return;
    g.pct = pctDe(e.clientX, g.caja);
    if (g.activo) {
      setLupa({ pct: g.pct, ancho: g.caja.width });
    } else if (Math.abs(e.clientX - g.x) > UMBRAL_PX) {
      // Se movió antes de que se active: es un scroll o un arrastre, no una selección.
      g.cancelado = true;
      window.clearTimeout(espera.current);
    }
  };

  const alSoltar = (e: EventoPuntero<HTMLButtonElement>) => {
    const g = gesto.current;
    limpiar();
    if (!g || g.cancelado) return;
    const indice = segmentoEn(fila.segmentos, g.activo ? g.pct : pctDe(e.clientX, g.caja));
    if (indice >= 0) alElegir(fila.tarea, indice);
  };

  const cabecera = (
    <>
      {resultado && <IconoEstado estado={resultado.estado} tam={18} />}
      <span className="fila-tarea-numero">{numero}</span>
      {resultado?.titulo && <span className="fila-tarea-titulo">{resultado.titulo}</span>}
    </>
  );
  const enLupa = lupa ? fila.segmentos[segmentoEn(fila.segmentos, lupa.pct)] : undefined;
  const izquierdaLupa = lupa ? Math.min(Math.max(lupa.pct * (lupa.ancho / 100) - ANCHO_LUPA / 2, -6), Math.max(-6, lupa.ancho - 194)) : 0;

  return (
    <div className="fila-tarea" data-testid="fila-tarea" data-tarea={fila.tarea}>
      <div className="fila-tarea-cabecera">
        {partes ? (
          <a className="fila-tarea-enlace" data-testid="fila-tarea-enlace" href={`#/tarea/${partes.repo}/${partes.numero}`}>
            {cabecera}
          </a>
        ) : (
          <span className="fila-tarea-enlace" data-testid="fila-tarea-enlace">
            {cabecera}
          </span>
        )}
        <span className="fila-tarea-duracion">{duracion(fila.ms)}</span>
      </div>

      <div className="pista-zona">
        <button
          type="button"
          className="pista pista-tarea"
          data-testid="pista-tarea"
          aria-label={`Línea de tiempo de ${numero}: mantené para ampliar`}
          onPointerDown={alBajar}
          onPointerMove={alMover}
          onPointerUp={alSoltar}
          onPointerCancel={limpiar}
          onContextMenu={(e) => e.preventDefault()}
        >
          {fila.segmentos.map((s, i) => (
            <span
              key={`${s.desde}-${s.etapa}`}
              className="segmento"
              data-testid="segmento"
              data-etapa={s.etapa}
              data-maquina={s.maquina}
              data-seleccionado={seleccionado === i ? "true" : undefined}
              title={`${numero} · ${NOMBRE_ETAPA[s.etapa] ?? s.etapa} · ${duracion(s.ms)} · ${nombreMaquina(s.maquina)}`}
              style={{ left: `${s.izquierda}%`, width: `max(4px, ${s.ancho}%)`, background: colorDe(s.etapa) }}
            />
          ))}
          {lupa && <span className="cursor-lupa" data-testid="cursor-lupa" style={{ left: `${lupa.pct}%` }} />}
        </button>

        {lupa && enLupa && (
          <div className="lupa vidrio" data-testid="lupa" aria-live="polite" style={{ left: izquierdaLupa }}>
            <div className="pista lupa-pista">
              {segmentosLupa(fila.segmentos, lupa.pct, ZOOM).map((s, i) => (
                <span
                  key={i}
                  className="lupa-segmento"
                  style={{ left: `${s.izquierda}%`, width: `max(6px, ${s.ancho}%)`, background: colorDe(fila.segmentos[i]!.etapa) }}
                />
              ))}
              <span className="lupa-centro" />
            </div>
            <div className="lupa-etiqueta" data-testid="lupa-etiqueta">
              <span className="lupa-punto" style={{ background: colorDe(enLupa.etapa) }} />
              {mayuscula(NOMBRE_ETAPA[enLupa.etapa] ?? enLupa.etapa)} · {duracion(enLupa.ms)}
            </div>
            <div className="lupa-horas" data-testid="lupa-horas">
              {hora(enLupa.desde)} → {hora(enLupa.hasta)} · {nombreMaquina(enLupa.maquina)}
            </div>
          </div>
        )}
      </div>

      <p className="fila-tarea-desglose" data-testid="desglose">
        {desglose(fila)}
      </p>
    </div>
  );
}

/** Línea de tiempo de la noche por tarea: una fila por tarea, con sus etapas como segmentos sobre el eje común. */
export function LineaTiempoTareas({ eventos, resultados }: { eventos: Evento[]; resultados: ResultadoTarea[] }) {
  const [seleccion, setSeleccion] = useState<Seleccion | null>(null);
  const tramos = franjas(eventos);
  if (tramos.length === 0) return null;

  const instantes = eventos.map((e) => Date.parse(e.ts)).filter(Number.isFinite);
  const ini = Math.min(...instantes);
  const fin = Math.max(...instantes);
  const filas = filasPorTarea(tramos, ini, fin);
  const marcas = [0, 1, 2, 3, 4].map((i) => horaCorta(new Date(ini + (i / 4) * (fin - ini)).toISOString()));
  const etapasPresentes = ETAPAS_TAREA.filter((etapa) => tramos.some((f) => f.etapa === etapa));

  const filaElegida = seleccion ? filas.find((f) => f.tarea === seleccion.tarea) : undefined;
  const segmentoElegido = seleccion && filaElegida ? filaElegida.segmentos[seleccion.indice] : undefined;
  const partesElegida = filaElegida ? partirTarea(filaElegida.tarea) : null;
  const resultadoElegido = filaElegida ? resultados.find((r) => r.tarea === filaElegida.tarea) : undefined;

  return (
    <section className="tarjeta linea-tareas" data-testid="linea-tiempo" aria-label="Línea de tiempo de la noche por tarea">
      <div className="eje-tiempo">
        {marcas.map((m, i) => (
          <span key={i} data-testid="marca-tiempo">
            {m}
          </span>
        ))}
      </div>

      {filas.map((fila) => (
        <FilaTareaVista
          key={fila.tarea}
          fila={fila}
          resultado={resultados.find((r) => r.tarea === fila.tarea)}
          seleccionado={seleccion?.tarea === fila.tarea ? seleccion.indice : null}
          alElegir={(tarea, indice) => setSeleccion({ tarea, indice })}
        />
      ))}

      {segmentoElegido && filaElegida && (
        <div className="tile seleccion" data-testid="seleccion">
          <span className="seleccion-punto" style={{ background: colorDe(segmentoElegido.etapa) }} />
          <div className="seleccion-texto">
            <span className="seleccion-titulo">
              {partesElegida ? `#${partesElegida.numero}` : filaElegida.tarea}
              {resultadoElegido?.titulo ? ` · ${resultadoElegido.titulo}` : ""}
            </span>
            <span className="sub seleccion-detalle">
              {mayuscula(NOMBRE_ETAPA[segmentoElegido.etapa] ?? segmentoElegido.etapa)} · {duracion(segmentoElegido.ms)} ·{" "}
              {hora(segmentoElegido.desde)} → {hora(segmentoElegido.hasta)} · {nombreMaquina(segmentoElegido.maquina)}
            </span>
          </div>
          {partesElegida && (
            <a
              className="capsula vidrio-azul"
              data-testid="seleccion-ver-tarea"
              href={`#/tarea/${partesElegida.repo}/${partesElegida.numero}`}
            >
              Ver tarea
            </a>
          )}
        </div>
      )}

      <div className="leyenda-tiempo">
        {etapasPresentes.map((etapa) => (
          <span key={etapa} className="leyenda-etapa" data-testid="leyenda-etapa">
            <span className="leyenda-punto" style={{ background: colorDe(etapa) }} />
            {mayuscula(NOMBRE_ETAPA[etapa] ?? etapa)}
          </span>
        ))}
      </div>
      <p className="ayuda-lupa">Mantené el dedo sobre una fila para ampliarla y deslizá para recorrer; al soltar queda elegida la etapa.</p>
    </section>
  );
}
