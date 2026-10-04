import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Higiene de la revisión del 2026-10-02 (spec: «Dos arreglos de higiene...», criterio de aceptación 1).
 *
 * `e2e/tarea.spec.ts` no tiene que reimplementar `hora()`: tiene que importarla de `web/src/formato`
 * (el mismo patrón que los otros specs e2e cuando importan del repo). Así, si mañana cambia el
 * formato en `formato.ts`, el e2e lo sigue y detecta la regresión. La parte «sigue pasando» (al
 * abrir un grupo se ve la hora y el tipo) la cubre el propio e2e «los eventos salen en un grupo por
 * etapa, cerrados; al abrir uno se ve la hora y el tipo».
 */

const fuenteTarea = readFileSync(fileURLToPath(new URL("../e2e/tarea.spec.ts", import.meta.url)), "utf8");

describe("higiene: e2e/tarea.spec.ts usa la `hora` de verdad (criterio 1 de la spec)", () => {
  it("importa `hora` de web/src/formato", () => {
    expect(/import\s*\{[^}]*\bhora\b[^}]*\}\s*from\s*"\.\.\/web\/src\/formato(\.js)?"/.test(fuenteTarea)).toBe(true);
  });

  it("no define ninguna función de formato de hora propia", () => {
    expect(/\b(const|let|var)\s+hora\b|\bfunction\s+hora\b/.test(fuenteTarea)).toBe(false);
  });

  it("el test de los grupos de eventos sigue verificando la hora y el tipo al abrir un grupo", () => {
    expect(fuenteTarea).toContain("al abrir uno se ve la hora y el tipo");
    expect(fuenteTarea).toContain(`toContainText(hora("2026-09-27T01:00:21.000Z"))`);
    expect(fuenteTarea).toContain(`toContainText("inicio")`);
  });
});
