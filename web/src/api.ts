import type { ErrorApi } from "../../src/contrato/api";

/** GET a la API. Tira Error con el mensaje del server si responde 4xx/5xx. */
export async function obtener<T>(ruta: string): Promise<T> {
  const r = await fetch(ruta, { headers: { Accept: "application/json" } });
  if (!r.ok) {
    const cuerpo = (await r.json().catch(() => ({ error: r.statusText }))) as ErrorApi;
    throw new Error(cuerpo.error);
  }
  return (await r.json()) as T;
}

/** GET a la API esperando texto plano. Tira Error con el mensaje del server si responde 4xx/5xx. */
export async function obtenerTexto(ruta: string): Promise<string> {
  const r = await fetch(ruta, { headers: { Accept: "text/plain" } });
  if (!r.ok) {
    const cuerpo = (await r.json().catch(() => ({ error: r.statusText }))) as ErrorApi;
    throw new Error(cuerpo.error);
  }
  return await r.text();
}
