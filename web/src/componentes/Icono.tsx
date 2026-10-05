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
