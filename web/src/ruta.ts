import { useEffect, useState } from "react";

/**
 * Router mínimo por hash (`#/vivo`, `#/noche/2026-09-27`, `#/tarea/owner/repo/12`).
 * Hash y no History API: `tailscale serve` y la PWA de iOS no necesitan ninguna regla en el server.
 */
export interface Ruta {
  vista: string;
  params: string[];
}

export function leerRuta(hash: string): Ruta {
  const partes = hash.replace(/^#\/?/, "").split("/").filter(Boolean).map(decodeURIComponent);
  return { vista: partes[0] ?? "vivo", params: partes.slice(1) };
}

export function useRuta(): Ruta {
  const [ruta, setRuta] = useState(() => leerRuta(location.hash));
  useEffect(() => {
    const alCambiar = () => setRuta(leerRuta(location.hash));
    addEventListener("hashchange", alCambiar);
    return () => removeEventListener("hashchange", alCambiar);
  }, []);
  return ruta;
}

export const enlace = (...partes: (string | number)[]) => "#/" + partes.map((p) => encodeURIComponent(String(p))).join("/");
