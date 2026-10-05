import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { Almacen } from "./almacen.js";
import { crearProveedorDiff } from "./diff.js";

// Corrección de la revisión nocturna del 2026-10-05 (PR #41): el fixture y la caché que no vence.
// Los fixtures se leen con rutas relativas a la raíz del repo (desde donde corre vitest).
const LAB = "test/fixtures/lab";
const FIXTURE_DIFF = "test/fixtures/diffs/demo_panel-3.diff";
const URL_PR_DEMO_3 = "https://github.com/demo/panel/pull/4";
const BASE_DEMO_3 = "594b5aed3825132d3d070794bef4ba7c98897235";

const lab = new Almacen(LAB);

describe("criterio 1: el fixture demo_panel-3.diff", () => {
  it("termina en ' export {};\\n', split(\\n) tiene largo 20 y la primera línea es el diff de src/reloj.ts", () => {
    const contenido = readFileSync(FIXTURE_DIFF, "utf8");
    expect(contenido.endsWith(" export {};\n")).toBe(true);
    expect(contenido.split("\n")).toHaveLength(20);
    expect(contenido.split("\n")[0]).toBe("diff --git a/src/reloj.ts b/src/reloj.ts");
  });
});

describe("criterios 2 y 3: la caché no se vuelve eterna cuando la tarea se entrega", () => {
  function escenario() {
    let enCurso: string | null = "demo/panel#3";
    let ahoraMs = 0;
    const llamadas = { enCurso: 0, pr: [] as string[] };
    const proveedor = crearProveedorDiff({
      almacen: lab,
      tareaEnCurso: () => enCurso,
      diffEnCurso: async (idCarpeta: string, base: string) => {
        llamadas.enCurso += 1;
        return `DIFF-ENCURSO ${idCarpeta} ${base}`;
      },
      diffPr: async (urlPr: string) => {
        llamadas.pr.push(urlPr);
        return `DIFF-PR ${urlPr}`;
      },
      ahora: () => ahoraMs,
    });
    return {
      proveedor,
      entregar: () => {
        enCurso = null;
      },
      setAhora: (ms: number) => {
        ahoraMs = ms;
      },
      llamadas,
    };
  }

  it("criterio 2: pedido en curso con ahora 0 → diffEnCurso una vez; entregada con ahora 1000 → diffPr con el PR y su texto", async () => {
    const e = escenario();
    expect(await e.proveedor("demo/panel#3")).toBe(`DIFF-ENCURSO demo_panel-3 ${BASE_DEMO_3}`);
    expect(e.llamadas.enCurso).toBe(1);
    expect(e.llamadas.pr).toEqual([]);

    e.entregar();
    e.setAhora(1000); // dentro del TTL: lo que saca al diff viejo no puede ser el vencimiento
    expect(await e.proveedor("demo/panel#3")).toBe(`DIFF-PR ${URL_PR_DEMO_3}`);
    expect(e.llamadas.pr).toEqual([URL_PR_DEMO_3]);
    expect(e.llamadas.enCurso).toBe(1);
  });

  it("criterio 3: tres horas después de la entrega, el pedido no vuelve a llamar a diffPr (1 vez en total)", async () => {
    const e = escenario();
    await e.proveedor("demo/panel#3");
    e.entregar();
    e.setAhora(1000);
    expect(await e.proveedor("demo/panel#3")).toBe(`DIFF-PR ${URL_PR_DEMO_3}`);
    expect(e.llamadas.pr).toHaveLength(1);

    e.setAhora(3 * 60 * 60 * 1000);
    expect(await e.proveedor("demo/panel#3")).toBe(`DIFF-PR ${URL_PR_DEMO_3}`);
    expect(e.llamadas.pr).toHaveLength(1);
  });
});
