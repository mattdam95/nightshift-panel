import { JSX } from "react";
import type { Etapa, Evento } from "../../../src/contrato/eventos";
import { ETAPAS_TAREA, partirTarea } from "../../../src/contrato/eventos";
import { franjas, type Franja } from "../../../src/contrato/franjas";
import { duracion, hora, NOMBRE_ETAPA } from "../formato";

/** Colores de la leyenda y de las franjas (variables de `estilos.css`, nada de hex sueltos). */
const COLOR_ETAPA: Record<Etapa, string> = {
  preparacion: "var(--borde)",
  tests: "var(--sub)",
  implementacion: "var(--pc)",
  verificacion: "var(--acento)",
  revision: "var(--mac)",
  entrega: "var(--ok)",
  noche: "var(--sub)",
  cola: "var(--sub)",
  sistema: "var(--sub)",
};

// Geometría del SVG en unidades de viewBox; con `width: 100%` se escala al ancho disponible.
const ANCHO = 340;
const X0 = 44; // inicio de la línea de tiempo (a la izquierda va la etiqueta de máquina)
const X1 = 300; // fin de la línea (queda margen para la última marca)
const FILA_ALTO = 46; // toques de 44 px de alto a 375 px de ancho de viewport
const FILA_PC_Y = 36;
const FILA_MAC_Y = FILA_PC_Y + FILA_ALTO + 6;
const EJE_Y = FILA_MAC_Y + FILA_ALTO + 16;
const ALTO = EJE_Y + 8;
const COLUMNAS_LEYENDA = [6, 118, 230];
const FILAS_LEYENDA = [2, 16];

export function LineaTiempo({ eventos }: { eventos: Evento[] }): JSX.Element | null {
  const tramos = franjas(eventos);
  if (tramos.length === 0) return null;

  const instantes = eventos.map((e) => Date.parse(e.ts)).filter(Number.isFinite);
  const ini = instantes.length > 0 ? Math.min(...instantes) : 0;
  const fin = instantes.length > 0 ? Math.max(...instantes) : 0;
  const rango = fin - ini;
  // Con rango 0 (todos los eventos con el mismo `ts`) la posición por tiempo es imposible:
  // en ese caso límite las franjas se reparten a partes iguales para que no se superpongan.
  const sinRango = rango <= 0;
  const xDe = (ts: string) => {
    const t = Date.parse(ts);
    if (!Number.isFinite(t) || sinRango) return X0;
    return X0 + ((t - ini) / rango) * (X1 - X0);
  };
  const xPorIndice = (i: number, n: number) => X0 + ((i + 0.5) / Math.max(n, 1)) * (X1 - X0);

  // Una entrada por etapa presente en la noche. En el fixture del 2026-09-27 hay
  // las seis (la entrega de #3 corre en la PC, después de la revisión de la Mac),
  // que es lo que asume `e2e/linea-tiempo.spec.ts` (`toHaveCount(6)`).
  const etapasPresentes = ETAPAS_TAREA.filter((etapa) => tramos.some((f) => f.etapa === etapa));
  // Marcas equiespaciadas: la etiqueta usa `hora()`, que convierte la ISO (UTC) a la
  // zona de Argentina (America/Argentina/Buenos_Aires) internamente antes de formatear.
  const marcas = [0, 1, 2, 3, 4].map((i) => ({
    x: X0 + (i / 4) * (X1 - X0),
    etiqueta: hora(new Date(ini + (i / 4) * rango).toISOString()),
  }));

  return (
    <svg
      className="linea-tiempo"
      data-testid="linea-tiempo"
      viewBox={`0 0 ${ANCHO} ${ALTO}`}
      role="img"
      aria-label="Línea de tiempo de la noche por máquina"
    >
      <Leyenda etapas={etapasPresentes} />

      <Fila
        maquina="PC"
        color="var(--pc)"
        y={FILA_PC_Y}
        tramos={tramos.filter((f) => f.maquina === "pc")}
        xDe={xDe}
        xPorIndice={xPorIndice}
        sinRango={sinRango}
      />
      <Fila
        maquina="Mac"
        color="var(--mac)"
        y={FILA_MAC_Y}
        tramos={tramos.filter((f) => f.maquina === "mac")}
        xDe={xDe}
        xPorIndice={xPorIndice}
        sinRango={sinRango}
      />

      {marcas.map((m) => (
        <text key={m.x} data-testid="marca-tiempo" x={m.x} y={EJE_Y} textAnchor="middle" fontSize="9" fill="var(--sub)">
          {m.etiqueta}
        </text>
      ))}
    </svg>
  );
}

function Leyenda({ etapas }: { etapas: Etapa[] }) {
  return (
    <g>
      {etapas.map((etapa, i) => {
        const col = COLUMNAS_LEYENDA[i % COLUMNAS_LEYENDA.length]!;
        const fila = FILAS_LEYENDA[Math.floor(i / COLUMNAS_LEYENDA.length)] ?? FILAS_LEYENDA[0]!;
        return (
          <g key={etapa} data-testid="leyenda-etapa">
            <rect x={col} y={fila} width="10" height="10" rx="3" fill={COLOR_ETAPA[etapa]} />
            <text x={col + 14} y={fila + 8.5} fontSize="9" fill="var(--sub)">
              {NOMBRE_ETAPA[etapa]}
            </text>
          </g>
        );
      })}
    </g>
  );
}

function Fila({
  maquina,
  color,
  y,
  tramos,
  xDe,
  xPorIndice,
  sinRango,
}: {
  maquina: string;
  color: string;
  y: number;
  tramos: Franja[];
  xDe: (ts: string) => number;
  xPorIndice: (i: number, n: number) => number;
  sinRango: boolean;
}) {
  return (
    <g data-testid={maquina === "PC" ? "fila-pc" : "fila-mac"}>
      <rect x="2" y={y} width={ANCHO - 4} height={FILA_ALTO} rx="8" fill="var(--tarjeta)" stroke="var(--borde)" />
      <text x="22" y={y + FILA_ALTO / 2 + 4} textAnchor="middle" fontSize="11" fontWeight="600" fill={color}>
        {maquina}
      </text>
      {tramos.map((f, i) => {
        // Con rango 0 no hay escala de tiempo: cada franja ocupa su hueco por índice.
        const xIni = sinRango ? xPorIndice(i, tramos.length) : xDe(f.desde);
        const xFin = sinRango ? xIni + 2 : xDe(f.hasta);
        return <FranjaRecta key={`${f.desde}-${f.etapa}`} franja={f} y={y} xIni={xIni} xFin={xFin} />;
      })}
    </g>
  );
}

/**
 * Una franja: recta coloreada con su `<title>`, envuelta en un enlace al detalle de la tarea.
 *
 * Ojo: el `<a>` está dentro del `<svg>`, y React lo crea en el **namespace SVG** (no es un ancla
 * HTML): es el elemento `<a>` de SVG2, cuyo atributo `href` navega al hacer clic (comprobado en
 * el build: `namespaceURI === "http://www.w3.org/2000/svg"`). No reemplazarlo por un ancla HTML.
 */
function FranjaRecta({ franja, y, xIni, xFin }: { franja: Franja; y: number; xIni: number; xFin: number }) {
  const ancho = Math.max(2, xFin - xIni);
  const detalle = partirTarea(franja.tarea);
  const titulo = `${franja.tarea} · ${NOMBRE_ETAPA[franja.etapa]} · ${duracion(Date.parse(franja.hasta) - Date.parse(franja.desde))}`;
  const recta = (
    <>
      <title>{titulo}</title>
      <rect x={xIni} y={y + 3} width={ancho} height={FILA_ALTO - 6} rx="4" fill={COLOR_ETAPA[franja.etapa]} />
    </>
  );
  if (!detalle) return <g data-testid="franja">{recta}</g>;
  return (
    <a data-testid="franja" href={`#/tarea/${detalle.repo}/${detalle.numero}`}>
      {recta}
    </a>
  );
}
