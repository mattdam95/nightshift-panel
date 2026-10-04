import { cpSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { PedidoAccion, ResultadoAccion } from "../contrato/api.js";
import { accionSimulada, crearProveedorAcciones } from "./acciones.js";
import { Almacen } from "./almacen.js";
import { crearApp } from "./app.js";
import type { Ejecutar } from "./mac.js";
import { Seguidor } from "./seguidor.js";

// Los fixtures se leen con rutas relativas a la raíz del repo (desde donde corre vitest).
const REPOS = ["mattdam95/monigotes", "mattdam95/nightshift-panel"];

interface Dobles {
  nightshift: (args: string) => Promise<string>;
  ejecutar: Ejecutar;
  argsNightshift: string[];
  ejecuciones: { comando: string; args: string[] }[];
}

/** Dobles que registran las llamadas; con `fallo` definido rechazan cuando se les llama. */
function dobles(fallo?: unknown): Dobles {
  const argsNightshift: string[] = [];
  const ejecuciones: { comando: string; args: string[] }[] = [];
  const nightshift = async (args: string) => {
    argsNightshift.push(args);
    if (fallo !== undefined) throw fallo;
    return "ok";
  };
  const ejecutar: Ejecutar = async (comando, args) => {
    ejecuciones.push({ comando, args });
    if (fallo !== undefined) throw fallo;
    return "ok";
  };
  return { nightshift, ejecutar, argsNightshift, ejecuciones };
}

const pedidoDe = (tarea?: string): PedidoAccion => (tarea === undefined ? { confirmar: true } : { confirmar: true, tarea });

let dir: string;
let almacen: Almacen;
let seguidor: Seguidor;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "panel-acciones-"));
  cpSync("test/fixtures/lab", dir, { recursive: true });
  almacen = new Almacen(dir);
  seguidor = new Seguidor(almacen, 60_000);
  seguidor.revisar();
});
afterEach(() => seguidor.detener());

describe("criterio 1: pausar, reanudar y juego mandan un solo argumento fijo a nightshift", () => {
  it('pausar llama a nightshift una vez con "pause" y devuelve el mensaje exacto', async () => {
    const d = dobles();
    const proveedor = crearProveedorAcciones({ nightshift: d.nightshift, ejecutar: d.ejecutar, repos: REPOS });
    const resultado = await proveedor("pausar", pedidoDe());
    expect(resultado).toEqual({ ok: true, mensaje: "Pausado: no va a arrancar tareas nuevas" });
    expect(d.argsNightshift).toEqual(["pause"]);
    expect(d.ejecuciones).toEqual([]);
  });
  it('reanudar llama a nightshift una vez con "resume" y devuelve el mensaje exacto', async () => {
    const d = dobles();
    const proveedor = crearProveedorAcciones({ nightshift: d.nightshift, ejecutar: d.ejecutar, repos: REPOS });
    const resultado = await proveedor("reanudar", pedidoDe());
    expect(resultado).toEqual({ ok: true, mensaje: "Reanudado" });
    expect(d.argsNightshift).toEqual(["resume"]);
    expect(d.ejecuciones).toEqual([]);
  });
  it('juego llama a nightshift una vez con "juego" y devuelve el mensaje exacto', async () => {
    const d = dobles();
    const proveedor = crearProveedorAcciones({ nightshift: d.nightshift, ejecutar: d.ejecutar, repos: REPOS });
    const resultado = await proveedor("juego", pedidoDe());
    expect(resultado).toEqual({ ok: true, mensaje: "Modo juego activado" });
    expect(d.argsNightshift).toEqual(["juego"]);
    expect(d.ejecuciones).toEqual([]);
  });
  it('una tarea rara en el pedido ("x; rm -rf /") no cambia el argumento enviado', async () => {
    const d = dobles();
    const proveedor = crearProveedorAcciones({ nightshift: d.nightshift, ejecutar: d.ejecutar, repos: REPOS });
    const rara = "x; rm -rf /";
    await proveedor("pausar", pedidoDe(rara));
    await proveedor("reanudar", pedidoDe(rara));
    await proveedor("juego", pedidoDe(rara));
    expect(d.argsNightshift).toEqual(["pause", "resume", "juego"]);
    expect(d.ejecuciones).toEqual([]);
  });
});

describe("criterio 2: reintentar corre gh en la Mac", () => {
  it("con tarea válida llama a ejecutar una vez con el comando gh exacto y no toca nightshift", async () => {
    const d = dobles();
    const proveedor = crearProveedorAcciones({ nightshift: d.nightshift, ejecutar: d.ejecutar, repos: REPOS });
    const resultado = await proveedor("reintentar", pedidoDe("mattdam95/monigotes#12"));
    expect(resultado).toEqual({ ok: true, mensaje: "Reintento pedido: mattdam95/monigotes#12" });
    expect(d.ejecuciones).toEqual([
      {
        comando: "gh",
        args: ["issue", "edit", "12", "-R", "mattdam95/monigotes", "--remove-label", "agent:blocked", "--add-label", "agent:ready"],
      },
    ]);
    expect(d.argsNightshift).toEqual([]);
  });
});

describe("criterio 3: rechazos sin ejecutar nada", () => {
  it('sin tarea o con id que no pasa partirTarea devuelve "falta una tarea válida"', async () => {
    const d = dobles();
    const proveedor = crearProveedorAcciones({ nightshift: d.nightshift, ejecutar: d.ejecutar, repos: REPOS });
    for (const tarea of [undefined, "hola", "a/b#", "a/b#1; ls"]) {
      const resultado = await proveedor("reintentar", pedidoDe(tarea));
      expect(resultado).toEqual({ ok: false, mensaje: "falta una tarea válida" });
    }
    expect(d.argsNightshift).toEqual([]);
    expect(d.ejecuciones).toEqual([]);
  });
  it('con repo fuera de la lista devuelve "repo no permitido: <repo>"', async () => {
    const d = dobles();
    const proveedor = crearProveedorAcciones({ nightshift: d.nightshift, ejecutar: d.ejecutar, repos: REPOS });
    const resultado = await proveedor("reintentar", pedidoDe("otro/repo#3"));
    expect(resultado).toEqual({ ok: false, mensaje: "repo no permitido: otro/repo" });
    expect(d.argsNightshift).toEqual([]);
    expect(d.ejecuciones).toEqual([]);
  });
});

describe("criterio 4: los errores del comando se convierten en ok:false y el proveedor nunca rechaza", () => {
  it('si nightshift rechaza con Error("ssh: timeout") el resultado es { ok: false, mensaje: "ssh: timeout" }', async () => {
    const d = dobles(new Error("ssh: timeout"));
    const proveedor = crearProveedorAcciones({ nightshift: d.nightshift, ejecutar: d.ejecutar, repos: REPOS });
    await expect(proveedor("pausar", pedidoDe())).resolves.toEqual({ ok: false, mensaje: "ssh: timeout" });
  });
  it("lo mismo si rechaza ejecutar (reintentar con tarea válida)", async () => {
    const d = dobles(new Error("gh: no token"));
    const proveedor = crearProveedorAcciones({ nightshift: d.nightshift, ejecutar: d.ejecutar, repos: REPOS });
    await expect(proveedor("reintentar", pedidoDe("mattdam95/monigotes#12"))).resolves.toEqual({
      ok: false,
      mensaje: "gh: no token",
    });
  });
  it("un mensaje de error de 500 caracteres se corta a 200", async () => {
    const d = dobles(new Error("x".repeat(500)));
    const proveedor = crearProveedorAcciones({ nightshift: d.nightshift, ejecutar: d.ejecutar, repos: REPOS });
    const resultado = await proveedor("pausar", pedidoDe());
    expect(resultado.ok).toBe(false);
    expect(resultado.mensaje).toHaveLength(200);
  });
});

describe("criterio 5: accionSimulada", () => {
  it('devuelve { ok: true, mensaje: "(simulado) <acción>" } para las cuatro acciones', async () => {
    await expect(accionSimulada("pausar", pedidoDe())).resolves.toEqual({ ok: true, mensaje: "(simulado) pausar" });
    await expect(accionSimulada("reanudar", pedidoDe())).resolves.toEqual({ ok: true, mensaje: "(simulado) reanudar" });
    await expect(accionSimulada("juego", pedidoDe())).resolves.toEqual({ ok: true, mensaje: "(simulado) juego" });
    await expect(accionSimulada("reintentar", pedidoDe())).resolves.toEqual({ ok: true, mensaje: "(simulado) reintentar" });
  });
});

describe("criterio 6: integración con crearApp", () => {
  const appConAccion = () => {
    const d = dobles();
    const app = crearApp({
      almacen,
      seguidor,
      accion: crearProveedorAcciones({ nightshift: d.nightshift, ejecutar: d.ejecutar, repos: REPOS }),
    });
    return { app, d };
  };

  it("POST /api/acciones/pausar con confirmar responde 200 con el resultado del proveedor", async () => {
    const { app, d } = appConAccion();
    const r = await app.request("/api/acciones/pausar", { method: "POST", body: '{"confirmar":true}' });
    expect(r.status).toBe(200);
    expect((await r.json()) as ResultadoAccion).toEqual({ ok: true, mensaje: "Pausado: no va a arrancar tareas nuevas" });
    expect(d.argsNightshift).toEqual(["pause"]);
  });
  it("sin confirmar responde 400 y el doble no se llama", async () => {
    const { app, d } = appConAccion();
    const r = await app.request("/api/acciones/pausar", { method: "POST", body: "{}" });
    expect(r.status).toBe(400);
    expect(d.argsNightshift).toEqual([]);
    expect(d.ejecuciones).toEqual([]);
  });
  it("POST /api/acciones/cualquiera responde 400", async () => {
    const { app, d } = appConAccion();
    const r = await app.request("/api/acciones/cualquiera", { method: "POST", body: '{"confirmar":true}' });
    expect(r.status).toBe(400);
    expect(d.argsNightshift).toEqual([]);
    expect(d.ejecuciones).toEqual([]);
  });
});
