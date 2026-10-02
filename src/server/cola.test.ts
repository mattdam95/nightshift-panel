import { cpSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Cola, ItemCola } from "../contrato/api.js";
import { Almacen } from "./almacen.js";
import { crearApp } from "./app.js";
import { clasificarCola, crearProveedorCola, traerDeFixtures, type IssueGh } from "./cola.js";
import { Seguidor } from "./seguidor.js";

// Los fixtures se leen con rutas relativas a la raíz del repo (desde donde corre vitest).
const REPOS = ["mattdam95/monigotes", "mattdam95/nightshift-panel"];
const colaJson = JSON.parse(readFileSync("test/fixtures/cola.json", "utf8")) as Record<string, IssueGh[]>;
const ids = (lista: ItemCola[]) => lista.map((item) => item.id);

let dir: string;
let almacen: Almacen;
let seguidor: Seguidor;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "panel-cola-"));
  cpSync("test/fixtures/lab", dir, { recursive: true });
  almacen = new Almacen(dir);
  seguidor = new Seguidor(almacen, 60_000);
  seguidor.revisar();
});
afterEach(() => seguidor.detener());

describe("clasificarCola", () => {
  it("criterio 1: listas (agent:ready), sinDefinir (solo agent) y bloqueadas (agent:blocked), en orden por repo y número; done y running no aparecen", () => {
    const cola = clasificarCola(colaJson);
    expect(ids(cola.listas)).toEqual(["mattdam95/monigotes#12", "mattdam95/nightshift-panel#5", "mattdam95/nightshift-panel#21"]);
    expect(ids(cola.sinDefinir)).toEqual(["mattdam95/nightshift-panel#19"]);
    expect(ids(cola.bloqueadas)).toEqual(["mattdam95/nightshift-panel#7"]);
    const todos = [...cola.listas, ...cola.sinDefinir, ...cola.bloqueadas].map((item) => item.id);
    expect(todos).not.toContain("mattdam95/monigotes#9");
    expect(todos).not.toContain("mattdam95/nightshift-panel#30");
  });
  it("criterio 2: id = owner/repo#N y titulo, url y etiquetas (solo nombres, en el orden del issue) copiados del issue", () => {
    const cola = clasificarCola(colaJson);
    expect(cola.listas.find((item) => item.id === "mattdam95/monigotes#12")).toMatchObject({
      id: "mattdam95/monigotes#12",
      titulo: "Ordenar la lista de monigotes por fecha",
      url: "https://github.com/mattdam95/monigotes/issues/12",
      etiquetas: ["agent", "agent:ready"],
    });
  });
  it("criterio 3: pregunta = la línea **Pregunta:** del último comentario que la tiene, sin bordes; sin la marca, la propiedad no existe", () => {
    const cola = clasificarCola(colaJson);
    expect(cola.bloqueadas.find((item) => item.id === "mattdam95/nightshift-panel#7")?.pregunta).toBe("¿Puedo tocar el lockfile?");
    for (const item of [...cola.listas, ...cola.sinDefinir, ...cola.bloqueadas]) {
      if (item.id !== "mattdam95/nightshift-panel#7") expect("pregunta" in item).toBe(false);
    }
  });
});

describe("crearProveedorCola", () => {
  it("criterio 4: cachea 60 s — dos invocaciones seguidas llaman a traer una sola vez por repo; a los 61 s vuelve a llamarlo", async () => {
    const llamadas: string[] = [];
    const traer = async (repo: string) => {
      llamadas.push(repo);
      return colaJson[repo] ?? [];
    };
    let ahoraMs = 0;
    const proveedor = crearProveedorCola({ repos: REPOS, traer, ahora: () => ahoraMs });
    await proveedor();
    expect([...llamadas].sort()).toEqual([...REPOS].sort());
    llamadas.length = 0;
    await proveedor();
    expect(llamadas).toEqual([]);
    ahoraMs += 61_000;
    await proveedor();
    expect([...llamadas].sort()).toEqual([...REPOS].sort());
  });
  it("criterio 5: si traer rechaza para un repo, ese repo se omite y los issues de los demás salen igual (no tira)", async () => {
    const traer = async (repo: string) => {
      if (repo === "mattdam95/nightshift-panel") throw new Error("sin red");
      return colaJson[repo] ?? [];
    };
    const proveedor = crearProveedorCola({ repos: REPOS, traer, ahora: () => 0 });
    const cola = await proveedor();
    expect(ids(cola.listas)).toEqual(["mattdam95/monigotes#12"]);
    expect(ids(cola.sinDefinir)).toEqual([]);
    expect(ids(cola.bloqueadas)).toEqual([]);
  });
});

describe("traerDeFixtures", () => {
  it("criterio 6: devuelve los issues del repo pedido, [] para un repo que no está en el JSON, y [] sin tirar si la carpeta no existe", async () => {
    const traer = traerDeFixtures("test/fixtures");
    expect((await traer("mattdam95/nightshift-panel")).map((issue) => issue.number)).toEqual([21, 5, 7, 30, 19]);
    expect(await traer("alguien/otro-repo")).toEqual([]);
    expect(await (await traerDeFixtures("carpeta-que-no-existe"))("mattdam95/monigotes")).toEqual([]);
  });
  it("criterio 6: con el proveedor, GET /api/cola responde 200 con las tres listas clasificadas; sin el proveedor sigue respondiendo 501", async () => {
    const cola = crearProveedorCola({ repos: REPOS, traer: traerDeFixtures("test/fixtures"), ahora: () => 0 });
    const r = await crearApp({ almacen, seguidor, cola }).request("/api/cola");
    expect(r.status).toBe(200);
    const cuerpo = (await r.json()) as Cola;
    expect(ids(cuerpo.listas)).toEqual(["mattdam95/monigotes#12", "mattdam95/nightshift-panel#5", "mattdam95/nightshift-panel#21"]);
    expect(ids(cuerpo.sinDefinir)).toEqual(["mattdam95/nightshift-panel#19"]);
    expect(ids(cuerpo.bloqueadas)).toEqual(["mattdam95/nightshift-panel#7"]);
    expect((await crearApp({ almacen, seguidor }).request("/api/cola")).status).toBe(501);
  });
});
