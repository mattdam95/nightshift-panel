import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { Evento } from "../contrato/eventos.js";
import { parsearJsonl } from "../contrato/eventos.js";
import { Almacen } from "./almacen.js";
import type { Ejecutar } from "./mac.js";
import { baseDeTarea, crearProveedorDiff, diffDeFixtures, diffDePr } from "./diff.js";

// Los fixtures se leen con rutas relativas a la raíz del repo (desde donde corre vitest).
const LAB = "test/fixtures/lab";
const FIXTURES = "test/fixtures";
const BASE_DEMO_3 = "594b5aed3825132d3d070794bef4ba7c98897235";
const BASE_DEMO_5 = "1111111111111111111111111111111111111111";
const URL_PR_DEMO_3 = "https://github.com/demo/panel/pull/4";

const lab = new Almacen(LAB);
const eventos27 = parsearJsonl(readFileSync(join(LAB, "logs", "2026-09-27", "events.jsonl"), "utf8"));

function ev(tarea: string, etapa: Evento["etapa"], tipo: string, datos: Record<string, unknown>): Evento {
  return { ts: "2026-09-27T01:00:28.000Z", maquina: "pc", tarea, etapa, tipo, datos };
}

describe("baseDeTarea", () => {
  it("criterio 1: eventos de demo/panel#3 del fixture 2026-09-27 → 594b5aed…", () => {
    const de3 = eventos27.filter((e) => e.tarea === "demo/panel#3");
    expect(baseDeTarea(de3)).toBe(BASE_DEMO_3);
  });

  it("criterio 1: eventos de demo/panel#5 → 1111…", () => {
    const de5 = eventos27.filter((e) => e.tarea === "demo/panel#5");
    expect(baseDeTarea(de5)).toBe(BASE_DEMO_5);
  });

  it("criterio 1: sin eventos o sin evento preparacion/fin (o base no string) → null", () => {
    expect(baseDeTarea([])).toBeNull();
    expect(baseDeTarea([ev("demo/panel#3", "preparacion", "inicio", { rama: "agent/3-reloj" })])).toBeNull();
    expect(baseDeTarea([ev("demo/panel#3", "implementacion", "turno", { n: 1 })])).toBeNull();
    expect(baseDeTarea([ev("demo/panel#3", "preparacion", "fin", { base: 42 })])).toBeNull();
  });

  it("criterio 1: dos eventos preparacion/fin, gana el último", () => {
    const eventos = [
      ev("demo/panel#3", "preparacion", "fin", { base: "aaa111111111111111111111111111111111111111" }),
      ev("demo/panel#3", "preparacion", "fin", { base: "bbb222222222222222222222222222222222222222" }),
    ];
    expect(baseDeTarea(eventos)).toBe("bbb222222222222222222222222222222222222222");
  });
});

describe("crearProveedorDiff", () => {
  function dobles(tareaEnCurso: () => string | null) {
    const llamadas = { enCurso: [] as [string, string][], pr: [] as string[] };
    const diffEnCurso = async (idCarpeta: string, base: string) => {
      llamadas.enCurso.push([idCarpeta, base]);
      return `DIFF-ENCURSO ${idCarpeta}`;
    };
    const diffPr = async (urlPr: string) => {
      llamadas.pr.push(urlPr);
      return `DIFF-PR ${urlPr}`;
    };
    return { llamadas, tareaEnCurso, diffEnCurso, diffPr };
  }

  it('criterio 2: demo/panel#5 en curso → diffEnCurso("demo_panel-5", base) y su texto; no llama a diffPr', async () => {
    const d = dobles(() => "demo/panel#5");
    const proveedor = crearProveedorDiff({ almacen: lab, ahora: () => 0, ...d });
    const diff = await proveedor("demo/panel#5");
    expect(diff).toBe("DIFF-ENCURSO demo_panel-5");
    expect(d.llamadas.enCurso).toEqual([["demo_panel-5", BASE_DEMO_5]]);
    expect(d.llamadas.pr).toEqual([]);
  });

  it("criterio 2: demo/panel#3 entregada sin tarea en curso → diffPr con la url del PR y su texto; no llama a diffEnCurso", async () => {
    const d = dobles(() => null);
    const proveedor = crearProveedorDiff({ almacen: lab, ahora: () => 0, ...d });
    const diff = await proveedor("demo/panel#3");
    expect(diff).toBe(`DIFF-PR ${URL_PR_DEMO_3}`);
    expect(d.llamadas.pr).toEqual([URL_PR_DEMO_3]);
    expect(d.llamadas.enCurso).toEqual([]);
  });

  it("criterio 2: demo/panel#1 (bloqueada, sin PR), demo/panel#999 (inexistente) e id inválido → null, sin llamar a ninguna fuente", async () => {
    const d = dobles(() => null);
    const proveedor = crearProveedorDiff({ almacen: lab, ahora: () => 0, ...d });
    expect(await proveedor("demo/panel#1")).toBeNull();
    expect(await proveedor("demo/panel#999")).toBeNull();
    expect(await proveedor("hola")).toBeNull();
    expect(d.llamadas.enCurso).toEqual([]);
    expect(d.llamadas.pr).toEqual([]);
  });

  it("criterio 3: tarea en curso: dos pedidos seguidos llaman a diffEnCurso una vez; a los 59 999 ms sigue en caché y a los 60 000 ms se llama de nuevo", async () => {
    let ahoraMs = 0;
    let llamadas = 0;
    const diffEnCurso = async () => {
      llamadas += 1;
      return "DIFF-ENCURSO";
    };
    const diffPr = async () => {
      throw new Error("diffPr no debe llamarse");
    };
    const proveedor = crearProveedorDiff({ almacen: lab, tareaEnCurso: () => "demo/panel#5", diffEnCurso, diffPr, ahora: () => ahoraMs });
    await proveedor("demo/panel#5");
    await proveedor("demo/panel#5");
    expect(llamadas).toBe(1);
    ahoraMs = 59_999;
    await proveedor("demo/panel#5");
    expect(llamadas).toBe(1);
    ahoraMs = 60_000;
    await proveedor("demo/panel#5");
    expect(llamadas).toBe(2);
  });

  it("criterio 3: tarea entregada: dos pedidos separados por horas llaman a diffPr una vez (sin vencimiento)", async () => {
    let ahoraMs = 0;
    let llamadas = 0;
    const diffPr = async () => {
      llamadas += 1;
      return "DIFF-PR";
    };
    const diffEnCurso = async () => {
      throw new Error("diffEnCurso no debe llamarse");
    };
    const proveedor = crearProveedorDiff({ almacen: lab, tareaEnCurso: () => null, diffEnCurso, diffPr, ahora: () => ahoraMs });
    await proveedor("demo/panel#3");
    ahoraMs += 3 * 60 * 60 * 1000;
    await proveedor("demo/panel#3");
    expect(llamadas).toBe(1);
  });

  it("criterio 3: si la fuente del diff en curso rechaza, el proveedor rechaza con el mismo mensaje y el pedido siguiente vuelve a llamarla", async () => {
    let ahoraMs = 0;
    let llamadas = 0;
    const diffEnCurso = async () => {
      llamadas += 1;
      if (llamadas === 1) throw new Error("git no responde");
      return "DIFF-ENCURSO";
    };
    const diffPr = async () => {
      throw new Error("diffPr no debe llamarse");
    };
    const proveedor = crearProveedorDiff({ almacen: lab, tareaEnCurso: () => "demo/panel#5", diffEnCurso, diffPr, ahora: () => ahoraMs });
    await expect(proveedor("demo/panel#5")).rejects.toThrow("git no responde");
    expect(await proveedor("demo/panel#5")).toBe("DIFF-ENCURSO");
    expect(llamadas).toBe(2);
  });

  it("criterio 3: si diffPr rechaza, el proveedor rechaza con el mismo mensaje y el pedido siguiente vuelve a llamarla", async () => {
    let ahoraMs = 0;
    let llamadas = 0;
    const diffPr = async () => {
      llamadas += 1;
      if (llamadas === 1) throw new Error("sin gh");
      return "DIFF-PR";
    };
    const diffEnCurso = async () => {
      throw new Error("diffEnCurso no debe llamarse");
    };
    const proveedor = crearProveedorDiff({ almacen: lab, tareaEnCurso: () => null, diffEnCurso, diffPr, ahora: () => ahoraMs });
    await expect(proveedor("demo/panel#3")).rejects.toThrow("sin gh");
    expect(await proveedor("demo/panel#3")).toBe("DIFF-PR");
    expect(llamadas).toBe(2);
  });
});

describe("diffDeFixtures", () => {
  it("criterio 4: demo/panel#3 → el contenido de diffs/demo_panel-3.diff (empieza con diff --git a/src/reloj.ts)", async () => {
    const esperado = readFileSync(join(FIXTURES, "diffs", "demo_panel-3.diff"), "utf8");
    const diff = await diffDeFixtures(FIXTURES)("demo/panel#3");
    expect(diff).toBe(esperado);
    expect(diff).toMatch(/^diff --git a\/src\/reloj\.ts/);
    expect(diff).toContain("+export function horaActual");
  });

  it("criterio 4: demo/panel#99 (sin archivo) y el id inválido ../../etc#1 → null", async () => {
    const deFixtures = diffDeFixtures(FIXTURES);
    expect(await deFixtures("demo/panel#99")).toBeNull();
    expect(await deFixtures("../../etc#1")).toBeNull();
  });
});

describe("diffDePr", () => {
  it('criterio 5: llama a ejecutar con ("gh", ["pr", "diff", url]) y devuelve su salida', async () => {
    const llamados: { comando: string; args: string[] }[] = [];
    const ejecutar: Ejecutar = async (comando, args) => {
      llamados.push({ comando, args });
      return "SALIDA-DEL-PR";
    };
    expect(await diffDePr(ejecutar)(URL_PR_DEMO_3)).toBe("SALIDA-DEL-PR");
    expect(llamados).toEqual([{ comando: "gh", args: ["pr", "diff", URL_PR_DEMO_3] }]);
  });

  it("criterio 5: si ejecutar rechaza, diffDePr rechaza", async () => {
    const queRechaza: Ejecutar = async () => {
      throw new Error("sin gh");
    };
    await expect(diffDePr(queRechaza)(URL_PR_DEMO_3)).rejects.toThrow("sin gh");
  });

  it("criterio 5: una URL que no empieza con https://github.com/ rechaza sin ejecutar nada", async () => {
    const llamados: string[] = [];
    const ejecutar: Ejecutar = async (comando, args) => {
      llamados.push(`${comando} ${args.join(" ")}`);
      return "SALIDA";
    };
    await expect(diffDePr(ejecutar)("https://gitlab.com/demo/panel/-/merge_requests/1")).rejects.toThrow();
    expect(llamados).toEqual([]);
  });
});
