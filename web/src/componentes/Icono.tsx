import type { ReactNode } from "react";

/** Íconos de línea (formato lucide, stroke currentColor) para la barra de pestañas. */
export type NombreIcono = "vivo" | "cola" | "historial" | "maquinas";

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
};

export function Icono({ nombre, tam = 24 }: { nombre: NombreIcono; tam?: number }) {
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
      aria-hidden="true"
    >
      {ICONOS[nombre]}
    </svg>
  );
}

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
  interrumpida: {
    color: "var(--sub)",
    ruta: (
      <>
        <circle cx="12" cy="12" r="10" />
        <path d="M10 9v6" />
        <path d="M14 9v6" />
      </>
    ),
  },
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
  const { color, ruta } = RUTAS_ESTADO[estado] ?? RUTAS_ESTADO.interrumpida;
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
