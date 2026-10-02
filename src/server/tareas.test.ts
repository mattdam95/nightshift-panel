import { cpSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { DetalleTarea } from "../contrato/api.js";
import { Almacen } from "./almacen.js";
import { crearApp } from "./app.js";
import { Seguidor } from "./seguidor.js";
import { crearProveedorTarea, specDeFixtures, specDeGh, ubicarTarea, type TraerSpec } from "./tareas.js";

// Los fixtures se leen con rutas relativas a la raíz del repo (desde donde corre vitest).
const LAB = "test/fixtures/lab";
const lab = new Almacen(LAB);
const SPEC = "## Objetivo\nMostrar el reloj de la noche.\n\n## Criterios de aceptación\n- [ ] Muestra la hora actual\n";

describe("ubicarTarea", () => {
  it("criterio 1: demo/panel#3 → 2026-09-27, estado lista y 26 eventos", () => {
    const ubicada = ubicarTarea(lab, "demo/panel#3");
    expect(ubicada).not.toBeNull();
    expect(ubicada?.fecha).toBe("2026-09-27");
    expect(ubicada?.resultado?.estado).toBe("lista");
    expect(ubicada?.eventos).toHaveLength(26);
  });

  it("criterio 1: demo/panel#5 → 2026-09-27, sin resultado (en curso) y 8 eventos", () => {
    const ubicada = ubicarTarea(lab, "demo/panel#5");
    expect(ubicada).not.toBeNull();
    expect(ubicada?.fecha).toBe("2026-09-27");
    expect(ubicada?.resultado).toBeNull();
    expect(ubicada?.eventos).toHaveLength(8);
  });

  it("criterio 1: demo/panel#1 → 2026-09-26 y estado bloqueada", () => {
    const ubicada = ubicarTarea(lab, "demo/panel#1");
    expect(ubicada).not.toBeNull();
    expect(ubicada?.fecha).toBe("2026-09-26");
    expect(ubicada?.resultado?.estado).toBe("bloqueada");
  });

  it("criterio 1: demo/panel#999 (no aparece) y un id inválido → null", () => {
    expect(ubicarTarea(lab, "demo/panel#999")).toBeNull();
    expect(ubicarTarea(lab, "hola")).toBeNull();
  });

  it("criterio 2: si la tarea aparece en dos noches, gana la más nueva", () => {
    const dir = mkdtempSync(join(tmpdir(), "panel-tareas-"));
    for (const fecha of ["2026-09-01", "2026-09-02"]) {
      const carpeta = join(dir, "logs", fecha);
      mkdirSync(carpeta, { recursive: true });
      writeFileSync(
        join(carpeta, "events.jsonl"),
        JSON.stringify({
          ts: `${fecha}T01:00:00.000Z`,
          maquina: "pc",
          tarea: "a/b#1",
          etapa: "implementacion",
          tipo: "turno",
          datos: { n: 1 },
        }) + "\n",
      );
    }
    const ubicada = ubicarTarea(new Almacen(dir), "a/b#1");
    expect(ubicada?.fecha).toBe("2026-09-02");
    expect(ubicada?.eventos).toHaveLength(1);
    expect(ubicada?.resultado).toBeNull();
  });
});

describe("crearProveedorTarea", () => {
  it("criterio 3: devuelve { id, fecha, resultado, eventos, spec } con la spec del doble", async () => {
    const llamadas: { repo: string; numero: number }[] = [];
    const traerSpec: TraerSpec = async (repo, numero) => {
      llamadas.push({ repo, numero });
      return SPEC;
    };
    const tarea = crearProveedorTarea({ almacen: lab, traerSpec, ahora: () => 0 });
    const detalle = await tarea("demo/panel#3");
    expect(detalle).not.toBeNull();
    expect(detalle?.id).toBe("demo/panel#3");
    expect(detalle?.fecha).toBe("2026-09-27");
    expect(detalle?.resultado?.estado).toBe("lista");
    expect(detalle?.eventos).toHaveLength(26);
    expect(detalle?.spec).toBe(SPEC);
    expect(llamadas).toEqual([{ repo: "demo/panel", numero: 3 }]);
  });

  it("criterio 3: tarea inexistente → null sin llamar a traerSpec", async () => {
    const llamadas: string[] = [];
    const traerSpec: TraerSpec = async (repo, numero) => {
      llamadas.push(`${repo}#${numero}`);
      return SPEC;
    };
    const tarea = crearProveedorTarea({ almacen: lab, traerSpec, ahora: () => 0 });
    expect(await tarea("demo/panel#999")).toBeNull();
    expect(llamadas).toEqual([]);
  });

  it("criterio 3: con ahora controlado, dos pedidos seguidos llaman a traerSpec una vez y a los 300 000 ms la vuelven a llamar", async () => {
    let llamadas = 0;
    let ahoraMs = 0;
    const traerSpec: TraerSpec = async () => {
      llamadas += 1;
      return SPEC;
    };
    const tarea = crearProveedorTarea({ almacen: lab, traerSpec, ahora: () => ahoraMs });
    await tarea("demo/panel#3");
    expect(llamadas).toBe(1);
    await tarea("demo/panel#3");
    expect(llamadas).toBe(1);
    ahoraMs += 300_000;
    await tarea("demo/panel#3");
    expect(llamadas).toBe(2);
  });

  it("criterio 3: si traerSpec rechaza, spec null sin tirar, y el pedido siguiente la vuelve a llamar", async () => {
    let llamadas = 0;
    const traerSpec: TraerSpec = async () => {
      llamadas += 1;
      if (llamadas === 1) throw new Error("sin red");
      return SPEC;
    };
    const tarea = crearProveedorTarea({ almacen: lab, traerSpec, ahora: () => 0 });
    const primero = await tarea("demo/panel#3");
    expect(primero).not.toBeNull();
    expect(primero?.spec).toBeNull();
    expect(primero?.fecha).toBe("2026-09-27");
    const segundo = await tarea("demo/panel#3");
    expect(llamadas).toBe(2);
    expect(segundo?.spec).toBe(SPEC);
  });
});

describe("specDeFixtures", () => {
  const escribir = (dir: string, contenido: string) => {
    mkdirSync(join(dir, "issues"), { recursive: true });
    writeFileSync(join(dir, "issues", "demo_panel-3.json"), contenido);
  };

  it("criterio 4: con issues/demo_panel-3.json válido devuelve el body", async () => {
    const dir = mkdtempSync(join(tmpdir(), "panel-spec-"));
    escribir(dir, JSON.stringify({ body: SPEC }));
    expect(await specDeFixtures(dir)("demo/panel", 3)).toBe(SPEC);
  });

  it("criterio 4: archivo ausente, JSON roto o sin body string → null", async () => {
    const dir = mkdtempSync(join(tmpdir(), "panel-spec-"));
    expect(await specDeFixtures(dir)("demo/panel", 3)).toBeNull();
    escribir(dir, "{ esto no es JSON ");
    expect(await specDeFixtures(dir)("demo/panel", 3)).toBeNull();
    escribir(dir, JSON.stringify({ otra: "cosa" }));
    expect(await specDeFixtures(dir)("demo/panel", 3)).toBeNull();
    escribir(dir, JSON.stringify({ body: 42 }));
    expect(await specDeFixtures(dir)("demo/panel", 3)).toBeNull();
  });
});

describe("specDeGh", () => {
  it("criterio 4: llama a gh issue view con -R y devuelve el body", async () => {
    const llamados: { comando: string; args: string[] }[] = [];
    const ejecutar = async (comando: string, args: string[]) => {
      llamados.push({ comando, args });
      return JSON.stringify({ body: SPEC });
    };
    expect(await specDeGh(ejecutar)("demo/panel", 3)).toBe(SPEC);
    expect(llamados).toEqual([{ comando: "gh", args: ["issue", "view", "3", "-R", "demo/panel", "--json", "body"] }]);
  });

  it("criterio 4: si ejecutar rechaza o no devuelve JSON con body → null", async () => {
    const queRechaza = async () => {
      throw new Error("sin gh");
    };
    expect(await specDeGh(queRechaza)("demo/panel", 3)).toBeNull();
    const noJson = async () => "no soy JSON";
    expect(await specDeGh(noJson)("demo/panel", 3)).toBeNull();
    const sinBody = async () => JSON.stringify({ otra: "cosa" });
    expect(await specDeGh(sinBody)("demo/panel", 3)).toBeNull();
  });
});

describe("GET /api/tareas/:owner/:repo/:numero", () => {
  let dir: string;
  let almacen: Almacen;
  let seguidor: Seguidor;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "panel-tareas-http-"));
    cpSync(LAB, dir, { recursive: true });
    almacen = new Almacen(dir);
    seguidor = new Seguidor(almacen, 60_000);
    seguidor.revisar();
  });
  afterEach(() => seguidor.detener());

  it("criterio 5: demo/panel/3 responde 200 con fecha, estado lista, 26 eventos y la spec del doble", async () => {
    const tarea = crearProveedorTarea({ almacen, traerSpec: async () => SPEC, ahora: () => 0 });
    const r = await crearApp({ almacen, seguidor, tarea }).request("/api/tareas/demo/panel/3");
    expect(r.status).toBe(200);
    const cuerpo = (await r.json()) as DetalleTarea;
    expect(cuerpo.id).toBe("demo/panel#3");
    expect(cuerpo.fecha).toBe("2026-09-27");
    expect(cuerpo.resultado?.estado).toBe("lista");
    expect(cuerpo.eventos).toHaveLength(26);
    expect(cuerpo.spec).toBe(SPEC);
  });

  it("criterio 5: demo/panel/999 responde 404", async () => {
    const tarea = crearProveedorTarea({ almacen, traerSpec: async () => null, ahora: () => 0 });
    const r = await crearApp({ almacen, seguidor, tarea }).request("/api/tareas/demo/panel/999");
    expect(r.status).toBe(404);
  });
});
