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
  const xDe = (ts: string) => {
    const t = Date.parse(ts);
    if (!Number.isFinite(t) || rango <= 0) return X0;
    return X0 + ((t - ini) / rango) * (X1 - X0);
  };

  const etapasPresentes = ETAPAS_TAREA.filter((etapa) => tramos.some((f) => f.etapa === etapa));
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

      <Fila maquina="PC" color="var(--pc)" y={FILA_PC_Y} tramos={tramos.filter((f) => f.maquina === "pc")} xDe={xDe} />
      <Fila maquina="Mac" color="var(--mac)" y={FILA_MAC_Y} tramos={tramos.filter((f) => f.maquina === "mac")} xDe={xDe} />

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
}: {
  maquina: string;
  color: string;
  y: number;
  tramos: Franja[];
  xDe: (ts: string) => number;
}) {
  return (
    <g data-testid={maquina === "PC" ? "fila-pc" : "fila-mac"}>
      <rect x="2" y={y} width={ANCHO - 4} height={FILA_ALTO} rx="8" fill="var(--tarjeta)" stroke="var(--borde)" />
      <text x="22" y={y + FILA_ALTO / 2 + 4} textAnchor="middle" fontSize="11" fontWeight="600" fill={color}>
        {maquina}
      </text>
      {tramos.map((f) => (
        <FranjaRecta key={`${f.desde}-${f.etapa}`} franja={f} y={y} xDe={xDe} />
      ))}
    </g>
  );
}

/** Una franja: recta coloreada con su `<title>`, envuelta en un enlace al detalle de la tarea. */
function FranjaRecta({ franja, y, xDe }: { franja: Franja; y: number; xDe: (ts: string) => number }) {
  const desde = xDe(franja.desde);
  const hasta = xDe(franja.hasta);
  const ancho = Math.max(2, hasta - desde);
  const detalle = partirTarea(franja.tarea);
  const titulo = `${franja.tarea} · ${NOMBRE_ETAPA[franja.etapa]} · ${duracion(Date.parse(franja.hasta) - Date.parse(franja.desde))}`;
  const recta = (
    <>
      <title>{titulo}</title>
      <rect x={desde} y={y + 3} width={ancho} height={FILA_ALTO - 6} rx="4" fill={COLOR_ETAPA[franja.etapa]} />
    </>
  );
  if (!detalle) return <g data-testid="franja">{recta}</g>;
  return (
    <a data-testid="franja" href={`#/tarea/${detalle.repo}/${detalle.numero}`}>
      {recta}
    </a>
  );
}
