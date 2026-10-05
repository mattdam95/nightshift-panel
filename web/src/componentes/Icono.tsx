import type { ReactNode } from "react";

/** Íconos de línea (formato lucide, stroke currentColor): barra de pestañas, flechas y acciones. */
export type NombreIcono =
  "vivo" | "cola" | "historial" | "maquinas" | "abajo" | "derecha" | "atras" | "pausa" | "recargar" | "pr" | "juego";

const ICONOS: Record<NombreIcono, ReactNode> = {
  vivo: <path d="M22 12h-4l-3 9L9 3l-3 9H2" />,
  cola: (
    <>
      <path d="M8 6h13" />
      <path d="M8 12h13" />
      <path d="M8 18h13" />
      <path d="M3 6h.01" />
      <path d="M3 12h.01" />
      <path d="M3 18h.01" />
    </>
  ),
  historial: (
    <>
      <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
      <path d="M3 3v5h5" />
      <path d="M12 7v5l4 2" />
    </>
  ),
  maquinas: (
    <>
      <rect x="2" y="3" width="20" height="7" rx="2" />
      <rect x="2" y="14" width="20" height="7" rx="2" />
      <path d="M6 6.5h.01" />
      <path d="M6 17.5h.01" />
    </>
  ),
  abajo: <path d="m6 9 6 6 6-6" />,
  derecha: <path d="m9 6 6 6-6 6" />,
  atras: <path d="m15 6-6 6 6 6" />,
  pausa: (
    <>
      <rect x="6" y="4" width="4" height="16" rx="1.5" />
      <rect x="14" y="4" width="4" height="16" rx="1.5" />
    </>
  ),
  recargar: (
    <>
      <path d="M21 12a9 9 0 1 1-2.64-6.36" />
      <path d="M21 3v6h-6" />
    </>
  ),
  pr: (
    <>
      <circle cx="6" cy="6" r="3" />
      <circle cx="18" cy="18" r="3" />
      <path d="M6 9v12" />
      <path d="M13 6h3a2 2 0 0 1 2 2v7" />
    </>
  ),
  juego: (
    <>
      <path d="M6 11h4" />
      <path d="M8 9v4" />
      <circle cx="15" cy="12" r="1" />
      <circle cx="18" cy="10" r="1" />
      <path d="M17.3 5H6.7a4 4 0 0 0-4 3.6l-1 8.7A2.2 2.2 0 0 0 3.9 20c.7 0 1.4-.4 1.8-1L7 17h10l1.3 2c.4.6 1.1 1 1.8 1a2.2 2.2 0 0 0 2.2-2.7l-1-8.7A4 4 0 0 0 17.3 5z" />
    </>
  ),
};

export function Icono({ nombre, tam = 24, grosor = 2 }: { nombre: NombreIcono; tam?: number; grosor?: number }) {
  return (
    <svg
      width={tam}
      height={tam}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={grosor}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {ICONOS[nombre]}
    </svg>
  );
}

/** Ícono de estado `interrumpida`; también es el de cualquier estado desconocido. */
const RUTA_INTERRUMPIDA: { color: string; ruta: ReactNode } = {
  color: "var(--sub)",
  ruta: (
    <>
      <circle cx="12" cy="12" r="10" />
      <path d="M10 9v6" />
      <path d="M14 9v6" />
    </>
  ),
};

/** Íconos de estado de las tareas: color (variables de estilos.css) y ruta de línea por estado. */
export const RUTAS_ESTADO: Record<string, { color: string; ruta: ReactNode }> = {
  lista: {
    color: "var(--ok)",
    ruta: (
      <>
        <circle cx="12" cy="12" r="10" />
        <path d="m8.5 12 2.5 2.5 4.5-5" />
      </>
    ),
  },
  bloqueada: {
    color: "var(--error)",
    ruta: (
      <>
        <circle cx="12" cy="12" r="10" />
        <path d="m5 5 14 14" />
      </>
    ),
  },
  timeout: {
    color: "var(--acento)",
    ruta: (
      <>
        <circle cx="12" cy="12" r="10" />
        <path d="M12 6v6l4 2" />
      </>
    ),
  },
  interrumpida: RUTA_INTERRUMPIDA,
  error: {
    color: "var(--error)",
    ruta: (
      <>
        <circle cx="12" cy="12" r="10" />
        <path d="m15 9-6 6" />
        <path d="m9 9 6 6" />
      </>
    ),
  },
};

/** Ícono de línea del estado de una tarea; cualquier estado desconocido usa el de interrumpida. */
export function IconoEstado({ estado, tam = 18 }: { estado: string; tam?: number }) {
  const { color, ruta } = RUTAS_ESTADO[estado] ?? RUTA_INTERRUMPIDA;
  return (
    <svg
      width={tam}
      height={tam}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      role="img"
      aria-label={estado}
      data-testid="icono-estado"
      data-estado={estado}
      style={{ color }}
    >
      {ruta}
    </svg>
  );
}
