import { appendFileSync, cpSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { DetalleNoche, ResumenNoche, SnapshotVivo } from "../contrato/api.js";
import { Almacen } from "./almacen.js";
import { crearApp } from "./app.js";
import { planSincronizacion } from "./espejo.js";
import { Seguidor, type EventoConId } from "./seguidor.js";

let dir: string;
let almacen: Almacen;
let seguidor: Seguidor;
const linea = (tipo: string, datos = {}) =>
  JSON.stringify({ ts: new Date().toISOString(), maquina: "pc", tarea: "demo/panel#5", etapa: "implementacion", tipo, datos }) + "\n";

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "panel-"));
  cpSync("test/fixtures/lab", dir, { recursive: true });
  almacen = new Almacen(dir);
  seguidor = new Seguidor(almacen, 60_000);
  seguidor.revisar();
});
afterEach(() => seguidor.detener());

describe("Almacen", () => {
  it("lista las noches y resume la cerrada y la abierta", () => {
    // slice: las issues pueden sumar noches de ejemplo más viejas a test/fixtures/lab.
    expect(almacen.fechas().slice(-2)).toEqual(["2026-09-26", "2026-09-27"]);
    expect(almacen.resumen("2026-09-26")).toMatchObject({
      fin: expect.any(String),
      motivoFin: "cola vacía",
      estados: { bloqueada: 1 },
      hayReporte: true,
    });
    expect(almacen.resumen("2026-09-27")).toMatchObject({ fin: null, estados: { lista: 1 }, hayReporte: false });
  });
  it("rechaza fechas con otro formato (no sale de la carpeta)", () => {
    expect(almacen.eventos("../../etc")).toEqual([]);
    expect(almacen.reporte("../x")).toBeNull();
  });
});

describe("Seguidor", () => {
  it("emite solo líneas completas, con id = número de línea", () => {
    const recibidos: EventoConId[] = [];
    seguidor.on("evento", (e: EventoConId) => recibidos.push(e));
    const archivo = almacen.archivoEventos("2026-09-27");
    const nueva = linea("turno", { tokens: 5 });
    appendFileSync(archivo, nueva.slice(0, 20));
    seguidor.revisar();
    expect(recibidos).toHaveLength(0);
    appendFileSync(archivo, nueva.slice(20));
    seguidor.revisar();
    expect(recibidos.map((r) => r.id)).toEqual(["2026-09-27:38"]);
    expect(seguidor.estado.tarea?.turnos).toBe(3);
  });
  it("cambia de noche cuando aparece una carpeta más nueva", () => {
    const noches: string[] = [];
    seguidor.on("noche", (f: string) => noches.push(f));
    mkdirSync(join(dir, "logs", "2026-09-28"));
    writeFileSync(
      almacen.archivoEventos("2026-09-28"),
      JSON.stringify({ ts: "t", maquina: "pc", tarea: null, etapa: "noche", tipo: "inicio", datos: {} }) + "\n",
    );
    seguidor.revisar();
    expect(noches).toEqual(["2026-09-28"]);
    expect(seguidor.estado).toMatchObject({ fecha: "2026-09-28", noche: { activa: true }, terminadas: [] });
  });
  it("eventosDesde devuelve lo posterior a un id", () => {
    expect(seguidor.eventosDesde("2026-09-27:35").map((e) => e.id)).toEqual(["2026-09-27:36", "2026-09-27:37"]);
    expect(seguidor.eventosDesde("2026-09-26:2")).toHaveLength(37);
  });
});

describe("API", () => {
  it("GET /api/vivo devuelve el estado reducido y el último id", async () => {
    const r = await crearApp({ almacen, seguidor }).request("/api/vivo");
    const snap = (await r.json()) as SnapshotVivo;
    expect(snap).toMatchObject({ pc: "sin-espejo", ultimoId: "2026-09-27:37", vivo: { tarea: { id: "demo/panel#5" } } });
  });
  it("GET /api/noches y /api/noches/:fecha", async () => {
    const app = crearApp({ almacen, seguidor });
    const lista = (await (await app.request("/api/noches")).json()) as ResumenNoche[];
    expect(lista.map((n) => n.fecha).slice(0, 2)).toEqual(["2026-09-27", "2026-09-26"]);
    const det = (await (await app.request("/api/noches/2026-09-26")).json()) as DetalleNoche;
    expect(det.resultados[0]).toMatchObject({ estado: "bloqueada", pregunta: expect.any(String) });
    expect((await app.request("/api/noches/2020-01-01")).status).toBe(404);
  });
  it("GET /api/noches/:fecha/eventos filtra por tarea", async () => {
    const r = await crearApp({ almacen, seguidor }).request("/api/noches/2026-09-27/eventos?tarea=" + encodeURIComponent("demo/panel#3"));
    const eventos = (await r.json()) as { tarea: string }[];
    expect(eventos.length).toBeGreaterThan(10);
    expect(eventos.every((e) => e.tarea === "demo/panel#3")).toBe(true);
  });
  it("las secciones sin proveedor responden 501, y las acciones exigen confirmar", async () => {
    const app = crearApp({ almacen, seguidor });
    expect((await app.request("/api/cola")).status).toBe(501);
    const conAccion = crearApp({ almacen, seguidor, accion: async () => ({ ok: true, mensaje: "hecho" }) });
    expect((await conAccion.request("/api/acciones/pausar", { method: "POST", body: "{}" })).status).toBe(400);
    expect((await conAccion.request("/api/acciones/borrar", { method: "POST", body: '{"confirmar":true}' })).status).toBe(400);
    const r = await conAccion.request("/api/acciones/pausar", { method: "POST", body: '{"confirmar":true}' });
    expect(await r.json()).toEqual({ ok: true, mensaje: "hecho" });
  });
  it("rutas inexistentes de /api dan 404 JSON", async () => {
    const r = await crearApp({ almacen, seguidor }).request("/api/nada");
    expect(r.status).toBe(404);
    expect(await r.json()).toEqual({ error: "ruta inexistente" });
  });
  it("el SSE reenvía lo perdido desde Last-Event-ID y después transmite en vivo", async () => {
    const ctrl = new AbortController();
    const r = await crearApp({ almacen, seguidor }).request("/api/stream", {
      headers: { "Last-Event-ID": "2026-09-27:36" },
      signal: ctrl.signal,
    });
    expect(r.headers.get("content-type")).toContain("text/event-stream");
    const lector = r.body!.getReader();
    const leer = async (hasta: string) => {
      let texto = "";
      while (!texto.includes(hasta)) texto += new TextDecoder().decode((await lector.read()).value);
      return texto;
    };
    expect(await leer("2026-09-27:37")).toContain("event: evento");
    appendFileSync(almacen.archivoEventos("2026-09-27"), linea("turno"));
    seguidor.revisar();
    expect(await leer("2026-09-27:38")).toContain('"tipo":"turno"');
    ctrl.abort();
  });
});

describe("planSincronizacion", () => {
  const remotos = [
    { ruta: "logs/2026-09-27/events.jsonl", tam: 100, mtime: 10 },
    { ruta: "state/noches/2026-09-27.json", tam: 50, mtime: 20 },
    { ruta: "reports/2026-09-27.md", tam: 5, mtime: 30 },
    { ruta: "logs/2026-09-27/../../etc/passwd", tam: 5, mtime: 30 },
  ];
  it("completa los jsonl desde el final y reemplaza lo que cambió", () => {
    const local: Record<string, { tam: number; mtime: number }> = {
      "logs/2026-09-27/events.jsonl": { tam: 60, mtime: 1 },
      "reports/2026-09-27.md": { tam: 5, mtime: 30.4 },
    };
    expect(planSincronizacion(remotos, (r) => local[r] ?? null)).toEqual([
      { ruta: "logs/2026-09-27/events.jsonl", desde: 60 },
      { ruta: "state/noches/2026-09-27.json", desde: 0 },
    ]);
  });
});
