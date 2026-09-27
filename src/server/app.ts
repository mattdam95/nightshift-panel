import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import type {
  Accion,
  Cola,
  ConexionPc,
  DetalleTarea,
  EstadoPc,
  Estadisticas,
  Maquinas,
  PedidoAccion,
  ResultadoAccion,
  Salud,
  SnapshotVivo,
} from "../contrato/api.js";
import type { Almacen } from "./almacen.js";
import type { EventoConId, Seguidor } from "./seguidor.js";

/** Lo que el server sabe de la PC. En dev y en los tests no hay espejo: `pc` es "sin-espejo". */
export interface FuentePc {
  conexion(): ConexionPc;
  estadoPc(): EstadoPc | null;
  /** Se llama con cada cambio de conexión o sonda nueva. Devuelve una función para desuscribirse. */
  suscribir(fn: (pc: ConexionPc, estado: EstadoPc | null) => void): () => void;
}

export const sinEspejo: FuentePc = {
  conexion: () => "sin-espejo",
  estadoPc: () => null,
  suscribir: () => () => {},
};

export interface Dependencias {
  almacen: Almacen;
  seguidor: Seguidor;
  pc?: FuentePc;
  version?: string;
  /** Cada cuánto se manda `: ping` por el SSE. */
  pingMs?: number;
  /*
   * Proveedores de las secciones que se implementan en issues `agent`. Si falta uno, su ruta responde 501.
   * Cada issue implementa el suyo en un módulo propio (src/server/<seccion>.ts) y lo conecta en index.ts.
   */
  maquinas?: () => Promise<Maquinas>;
  cola?: () => Promise<Cola>;
  estadisticas?: (semanas: number) => Promise<Estadisticas>;
  tarea?: (id: string) => Promise<DetalleTarea | null>;
  diff?: (id: string) => Promise<string | null>;
  accion?: (accion: Accion, pedido: PedidoAccion) => Promise<ResultadoAccion>;
}

const FECHA = /^\d{4}-\d{2}-\d{2}$/;

export function crearApp(dep: Dependencias): Hono {
  const { almacen, seguidor } = dep;
  const pc = dep.pc ?? sinEspejo;
  const app = new Hono();

  app.onError((err, c) => c.json({ error: err.message }, 500));

  app.get("/api/salud", (c) => c.json<Salud>({ ok: true, version: dep.version ?? "0.0.0", datos: almacen.raiz, pc: pc.conexion() }));

  app.get("/api/vivo", (c) => {
    seguidor.revisar();
    return c.json<SnapshotVivo>({ vivo: seguidor.estado, pc: pc.conexion(), estadoPc: pc.estadoPc(), ultimoId: seguidor.ultimoId });
  });

  app.get("/api/stream", (c) =>
    streamSSE(c, async (stream) => {
      // Cola de envío: los eventos que llegan mientras se escribe otro se mandan en orden.
      let cadena = Promise.resolve();
      const enviar = (msg: { event: string; data: unknown; id?: string }) => {
        cadena = cadena.then(() => stream.writeSSE({ event: msg.event, data: JSON.stringify(msg.data), id: msg.id })).catch(() => {});
      };
      const alEvento = ({ id, evento }: EventoConId) => enviar({ event: "evento", id, data: evento });
      const alNoche = (fecha: string) => enviar({ event: "noche", data: { fecha } });

      // Reconexión: el navegador manda Last-Event-ID y se le reenvía lo que se perdió.
      const desde = c.req.header("Last-Event-ID") ?? c.req.query("desde") ?? null;
      if (desde) for (const e of seguidor.eventosDesde(desde)) alEvento(e);

      seguidor.on("evento", alEvento);
      seguidor.on("noche", alNoche);
      const desuscribir = pc.suscribir((conexion, estadoPc) => enviar({ event: "pc", data: { pc: conexion, estadoPc } }));
      const ping = setInterval(() => {
        cadena = cadena
          .then(() => stream.write(": ping\n\n"))
          .then(() => {})
          .catch(() => {});
      }, dep.pingMs ?? 15_000);

      await new Promise<void>((resolve) => stream.onAbort(resolve));
      clearInterval(ping);
      seguidor.off("evento", alEvento);
      seguidor.off("noche", alNoche);
      desuscribir();
    }),
  );

  app.get("/api/noches", (c) =>
    c.json(
      almacen
        .fechas()
        .reverse()
        .map((f) => almacen.resumen(f)),
    ),
  );

  app.get("/api/noches/:fecha", (c) => {
    const detalle = almacen.detalle(c.req.param("fecha"));
    return detalle ? c.json(detalle) : c.json({ error: "no existe esa noche" }, 404);
  });

  app.get("/api/noches/:fecha/eventos", (c) => {
    const fecha = c.req.param("fecha");
    if (!FECHA.test(fecha)) return c.json({ error: "fecha inválida" }, 400);
    const tarea = c.req.query("tarea");
    const eventos = almacen.eventos(fecha);
    return c.json(tarea ? eventos.filter((e) => e.tarea === tarea) : eventos);
  });

  app.get("/api/noches/:fecha/reporte", (c) => {
    const md = almacen.reporte(c.req.param("fecha"));
    return md === null ? c.json({ error: "no hay reporte" }, 404) : c.body(md, 200, { "Content-Type": "text/markdown; charset=utf-8" });
  });

  const noImplementado = { error: "todavía no implementado" };
  const idDe = (owner: string, repo: string, numero: string) => `${owner}/${repo}#${numero}`;

  app.get("/api/maquinas", async (c) => (dep.maquinas ? c.json(await dep.maquinas()) : c.json(noImplementado, 501)));
  app.get("/api/cola", async (c) => (dep.cola ? c.json(await dep.cola()) : c.json(noImplementado, 501)));
  app.get("/api/estadisticas", async (c) => {
    if (!dep.estadisticas) return c.json(noImplementado, 501);
    const semanas = Math.min(52, Math.max(1, Number(c.req.query("semanas") ?? 8) || 8));
    return c.json(await dep.estadisticas(semanas));
  });
  app.get("/api/tareas/:owner/:repo/:numero", async (c) => {
    if (!dep.tarea) return c.json(noImplementado, 501);
    const { owner, repo, numero } = c.req.param();
    const detalle = await dep.tarea(idDe(owner, repo, numero));
    return detalle ? c.json(detalle) : c.json({ error: "no hay datos de esa tarea" }, 404);
  });
  app.get("/api/tareas/:owner/:repo/:numero/diff", async (c) => {
    if (!dep.diff) return c.json(noImplementado, 501);
    const { owner, repo, numero } = c.req.param();
    const diff = await dep.diff(idDe(owner, repo, numero));
    return diff === null ? c.json({ error: "no hay diff" }, 404) : c.body(diff, 200, { "Content-Type": "text/plain; charset=utf-8" });
  });
  app.post("/api/acciones/:accion", async (c) => {
    if (!dep.accion) return c.json(noImplementado, 501);
    const accion = c.req.param("accion") as Accion;
    if (!["pausar", "reanudar", "juego", "reintentar"].includes(accion)) return c.json({ error: "acción desconocida" }, 400);
    const pedido = (await c.req.json().catch(() => ({}))) as Partial<PedidoAccion>;
    if (pedido.confirmar !== true) return c.json({ error: "falta confirmar: true" }, 400);
    return c.json(await dep.accion(accion, pedido as PedidoAccion));
  });

  app.all("/api/*", (c) => c.json({ error: "ruta inexistente" }, 404));

  return app;
}
