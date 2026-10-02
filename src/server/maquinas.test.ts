import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Maquinas } from "../contrato/api.js";
import type { Sonda } from "./espejo.js";
import { Almacen } from "./almacen.js";
import { crearApp } from "./app.js";
import { MAC_VACIA, crearProveedorMaquinas, macDeFixtures, pcDeFixtures } from "./maquinas.js";
import { pcDeSonda } from "./metricas.js";
import { Seguidor } from "./seguidor.js";

// Los fixtures se leen con rutas relativas a la raíz del repo (desde donde corre vitest).
const sondaFixture = JSON.parse(readFileSync("test/fixtures/sonda-pc.json", "utf8")) as Sonda;
const macFixture = JSON.parse(readFileSync("test/fixtures/mac.json", "utf8")) as Maquinas["mac"];
const AHORA = 1_760_000_000_000;

describe("crearProveedorMaquinas", () => {
  it("criterio 1: devuelve ts ISO (con ahora fijo, exacto), pc igual a pcDeSonda(sonda, conexion) y mac tal cual lo devolvió el doble", async () => {
    const macDoble: Maquinas["mac"] = {
      memoriaUsadaGiB: 14.2,
      memoriaTotalGiB: 24,
      revisor: { salud: "ok", tokPorSegGeneracion: 5.5, tokPorSegPrompt: 16, peticionesEnCurso: 0 },
    };
    const conSonda = await crearProveedorMaquinas({
      pc: async () => ({ sonda: sondaFixture, conexion: "conectada" }),
      mac: async () => macDoble,
      ahora: () => AHORA,
    })();
    expect(conSonda.ts).toBe(new Date(AHORA).toISOString());
    expect(conSonda.pc).toEqual(pcDeSonda(sondaFixture, "conectada"));
    expect(conSonda.mac).toEqual(macDoble);

    const sinSonda = await crearProveedorMaquinas({
      pc: async () => ({ sonda: null, conexion: "sin-espejo" }),
      mac: async () => macDoble,
      ahora: () => AHORA,
    })();
    expect(sinSonda.pc).toEqual(pcDeSonda(null, "sin-espejo"));
  });

  it("criterio 2: cachea la Mac ttlMacMs (10 s por defecto): dos pedidos seguidos llaman a mac() una vez, y pasado el TTL vuelve a llamarla; pc() se llama en cada pedido", async () => {
    const llamadas = { pc: 0, mac: 0 };
    let ahoraMs = 0;
    const proveedor = crearProveedorMaquinas({
      pc: async () => {
        llamadas.pc += 1;
        return { sonda: null, conexion: "sin-espejo" };
      },
      mac: async () => {
        llamadas.mac += 1;
        return MAC_VACIA;
      },
      ahora: () => ahoraMs,
    });
    await proveedor();
    await proveedor();
    expect(llamadas.mac).toBe(1);
    expect(llamadas.pc).toBe(2);
    ahoraMs += 10_001; // pasado el TTL de 10 s
    await proveedor();
    expect(llamadas.mac).toBe(2);
    expect(llamadas.pc).toBe(3);
  });

  it("criterio 3: si mac() rechaza, la respuesta trae mac igual a MAC_VACIA y el proveedor no tira", async () => {
    const proveedor = crearProveedorMaquinas({
      pc: async () => ({ sonda: null, conexion: "sin-espejo" }),
      mac: async () => {
        throw new Error("sin macOS ni red");
      },
      ahora: () => AHORA,
    });
    const res = await proveedor();
    expect(res.mac).toEqual(MAC_VACIA);
    // MAC_VACIA es la Mac sin datos: memoria null y revisor apagado con todo en null.
    expect(res.mac).toEqual({
      memoriaUsadaGiB: null,
      memoriaTotalGiB: null,
      revisor: { salud: "apagado", tokPorSegGeneracion: null, tokPorSegPrompt: null, peticionesEnCurso: null },
    });
  });
});

describe("pcDeFixtures y macDeFixtures", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "panel-maquinas-fixtures-"));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it("criterio 4: con los archivos presentes devuelven su contenido (conexion conectada en la PC)", async () => {
    cpSync("test/fixtures/sonda-pc.json", join(dir, "sonda-pc.json"));
    cpSync("test/fixtures/mac.json", join(dir, "mac.json"));
    expect(await pcDeFixtures(dir)()).toEqual({ sonda: sondaFixture, conexion: "conectada" });
    expect(await macDeFixtures(dir)()).toEqual(macFixture);
  });

  it("criterio 4: con el directorio vacío devuelven { sonda: null, conexion: sin-espejo } y MAC_VACIA", async () => {
    expect(await pcDeFixtures(dir)()).toEqual({ sonda: null, conexion: "sin-espejo" });
    expect(await macDeFixtures(dir)()).toEqual(MAC_VACIA);
  });

  it("criterio 4: con un JSON roto, igual que con el directorio vacío", async () => {
    writeFileSync(join(dir, "sonda-pc.json"), "{ no parsea");
    writeFileSync(join(dir, "mac.json"), "[1, 2");
    expect(await pcDeFixtures(dir)()).toEqual({ sonda: null, conexion: "sin-espejo" });
    expect(await macDeFixtures(dir)()).toEqual(MAC_VACIA);
  });
});

describe("GET /api/maquinas", () => {
  let dir: string;
  let almacen: Almacen;
  let seguidor: Seguidor;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "panel-maquinas-app-"));
    cpSync("test/fixtures/lab", dir, { recursive: true });
    almacen = new Almacen(dir);
    seguidor = new Seguidor(almacen, 60_000);
    seguidor.revisar();
  });
  afterEach(() => seguidor.detener());

  it("criterio 5: responde 200 con ts, pc y mac; con pcDeFixtures y macDeFixtures, los valores esperados de test/fixtures", async () => {
    const maquinas = crearProveedorMaquinas({ pc: pcDeFixtures("test/fixtures"), mac: macDeFixtures("test/fixtures") });
    const r = await crearApp({ almacen, seguidor, maquinas }).request("/api/maquinas");
    expect(r.status).toBe(200);
    const cuerpo = (await r.json()) as Maquinas;
    expect(new Date(cuerpo.ts).toISOString()).toBe(cuerpo.ts);
    expect(cuerpo.pc).toEqual({
      conexion: "conectada",
      gpu: { temperaturaC: 68, potenciaW: 187, vramUsadaGiB: 15.68, vramTotalGiB: 15.98 },
      llm: { salud: "ok", tokPorSegGeneracion: 29.63, tokPorSegPrompt: 437.5, peticionesEnCurso: 1 },
    });
    expect(cuerpo.mac).toEqual({
      memoriaUsadaGiB: 14.2,
      memoriaTotalGiB: 24,
      revisor: { salud: "ok", tokPorSegGeneracion: 5.5, tokPorSegPrompt: 16, peticionesEnCurso: 0 },
    });
    // Sin proveedor la ruta sigue respondiendo 501 (app.ts no se toca).
    expect((await crearApp({ almacen, seguidor }).request("/api/maquinas")).status).toBe(501);
  });
});
