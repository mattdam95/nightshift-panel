import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Íconos de estado en SVG en vez de emojis (spec: Íconos de estado en SVG):
 * el mapa de emojis `ICONO_ESTADO` dejó de existir; nada en `web/src` lo menciona
 * (equivale a `grep -rn "ICONO_ESTADO" web/src` sin resultados).
 */
const RAIZ_WEB = fileURLToPath(new URL("../web/src", import.meta.url));

function rutas(dir: string): string[] {
  return readdirSync(dir).flatMap((nombre) => {
    const ruta = join(dir, nombre);
    return statSync(ruta).isDirectory() ? rutas(ruta) : [ruta];
  });
}

describe("sin ICONO_ESTADO en web/src", () => {
  it("ningún archivo de web/src menciona ICONO_ESTADO", () => {
    const ofensores = rutas(RAIZ_WEB).filter((ruta) => readFileSync(ruta, "utf8").includes("ICONO_ESTADO"));
    expect(ofensores).toEqual([]);
  });
});
