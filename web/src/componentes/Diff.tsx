import { partirDiff } from "../../../src/contrato/diff";
import type { LineaDiff } from "../../../src/contrato/diff";

/**
 * Visor de diff (spec: Diff de la tarea: visor). Un bloque plegable por archivo, cerrado por
 * defecto; las líneas agregadas en verde y las borradas en rojo (colores en estilos.css).
 */
export function Diff({ texto }: { texto: string }) {
  const archivos = partirDiff(texto);
  if (archivos.length === 0) {
    return (
      <p className="vacio" data-testid="diff-vacio">
        Sin cambios
      </p>
    );
  }
  return (
    <>
      {archivos.map((a, i) => (
        <details className="tarjeta archivo" data-testid="archivo-diff" key={`${a.nombre}-${i}`}>
          <summary>
            <span className="ruta" data-testid="archivo-nombre">
              {a.nombre}
            </span>
            <span className="num mas" data-testid="archivo-mas">
              +{a.agregadas}
            </span>
            <span className="num menos" data-testid="archivo-menos">
              −{a.borradas}
            </span>
          </summary>
          {a.hunks.map((h, j) => (
            <div className="hunk" data-testid="hunk-diff" key={j}>
              <div className="encabezado mono">{h.encabezado}</div>
              <div className="lineas" data-testid="lineas-diff">
                {h.lineas.map((l, k) => (
                  <div className="linea mono" data-testid="linea-diff" data-tipo={l.tipo} key={k}>
                    {prefijo(l.tipo)}
                    {l.texto}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </details>
      ))}
    </>
  );
}

function prefijo(tipo: LineaDiff["tipo"]): string {
  return tipo === "add" ? "+" : tipo === "del" ? "-" : " ";
}
