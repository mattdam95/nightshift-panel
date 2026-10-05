import type { ResultadoTarea } from "../../../src/contrato/api";
import type { Etapa, Evento } from "../../../src/contrato/eventos";
import { ETAPAS_TAREA, partirTarea } from "../../../src/contrato/eventos";
import { filasPorTarea, franjas, type FilaTarea } from "../../../src/contrato/franjas";
import { duracion, horaCorta, NOMBRE_ETAPA } from "../formato";
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

/** Línea de tiempo de la noche por tarea: una fila por tarea, con sus etapas como segmentos sobre el eje común. */
export function LineaTiempoTareas({ eventos, resultados }: { eventos: Evento[]; resultados: ResultadoTarea[] }) {
  const tramos = franjas(eventos);
  if (tramos.length === 0) return null;

  const instantes = eventos.map((e) => Date.parse(e.ts)).filter(Number.isFinite);
  const ini = Math.min(...instantes);
  const fin = Math.max(...instantes);
  const filas = filasPorTarea(tramos, ini, fin);
  const marcas = [0, 1, 2, 3, 4].map((i) => horaCorta(new Date(ini + (i / 4) * (fin - ini)).toISOString()));
  const etapasPresentes = ETAPAS_TAREA.filter((etapa) => tramos.some((f) => f.etapa === etapa));

  return (
    <section className="tarjeta linea-tareas" data-testid="linea-tiempo" aria-label="Línea de tiempo de la noche por tarea">
      <div className="eje-tiempo">
        {marcas.map((m, i) => (
          <span key={i} data-testid="marca-tiempo">
            {m}
          </span>
        ))}
      </div>

      {filas.map((fila) => {
        const partes = partirTarea(fila.tarea);
        const numero = partes ? `#${partes.numero}` : fila.tarea;
        const resultado = resultados.find((r) => r.tarea === fila.tarea);
        const cabecera = (
          <>
            {resultado && <IconoEstado estado={resultado.estado} tam={18} />}
            <span className="fila-tarea-numero">{numero}</span>
            {resultado?.titulo && <span className="fila-tarea-titulo">{resultado.titulo}</span>}
          </>
        );
        return (
          <div key={fila.tarea} className="fila-tarea" data-testid="fila-tarea" data-tarea={fila.tarea}>
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
            <div className="pista pista-tarea">
              {fila.segmentos.map((s) => (
                <span
                  key={`${s.desde}-${s.etapa}`}
                  className="segmento"
                  data-testid="segmento"
                  data-etapa={s.etapa}
                  data-maquina={s.maquina}
                  title={`${numero} · ${NOMBRE_ETAPA[s.etapa] ?? s.etapa} · ${duracion(s.ms)} · ${nombreMaquina(s.maquina)}`}
                  style={{ left: `${s.izquierda}%`, width: `max(4px, ${s.ancho}%)`, background: COLOR_ETAPA[s.etapa] ?? "var(--gris)" }}
                />
              ))}
            </div>
            <p className="fila-tarea-desglose" data-testid="desglose">
              {desglose(fila)}
            </p>
          </div>
        );
      })}

      <div className="leyenda-tiempo">
        {etapasPresentes.map((etapa) => (
          <span key={etapa} className="leyenda-etapa" data-testid="leyenda-etapa">
            <span className="leyenda-punto" style={{ background: COLOR_ETAPA[etapa] ?? "var(--gris)" }} />
            {mayuscula(NOMBRE_ETAPA[etapa] ?? etapa)}
          </span>
        ))}
      </div>
    </section>
  );
}
