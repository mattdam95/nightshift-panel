import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Higiene de la revisión del 2026-10-02: `e2e/tarea.spec.ts` debe usar la `hora` de
 * `web/src/formato.ts` y no una copia propia, para que si cambia el formato el e2e lo detecte.
 */
const texto = readFileSync(fileURLToPath(new URL("../e2e/tarea.spec.ts", import.meta.url)), "utf8");

describe("higiene: e2e/tarea.spec.ts usa la hora de web/src/formato.ts", () => {
  it("importa hora de ../web/src/formato (con o sin .js)", () => {
    expect(/^import \{[^}]*\bhora\b[^}]*\} from "\.\.\/web\/src\/formato(\.js)?";?$/m.test(texto)).toBe(true);
  });

  it("no define una hora propia (const/let/var hora ni function hora)", () => {
    expect(/(?:const|let|var)\s+hora\b/.test(texto)).toBe(false);
    expect(/function\s+hora\b/.test(texto)).toBe(false);
  });
});
