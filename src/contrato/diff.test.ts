import { describe, expect, it } from "vitest";
import { partirDiff } from "./diff.js";

/**
 * Aceptación de `partirDiff()` (spec: Diff de la tarea: función partirDiff (base del visor)).
 * Función pura: se prueba acá con vitest, sin fixtures de archivo.
 */

// Texto de ejemplo de la spec, armado con un arreglo de líneas y `.join("\n") + "\n"`,
// porque las líneas de contexto empiezan con un espacio que no hay que perder.
const lineasEjemplo = [
  "diff --git a/src/reloj.ts b/src/reloj.ts",
  "new file mode 100644",
  "index 0000000..1a2b3c4",
  "--- /dev/null",
  "+++ b/src/reloj.ts",
  "@@ -0,0 +1,3 @@",
  "+export function horaActual(ahora: Date): string {",
  "+  return ahora.toISOString().slice(11, 19);",
  "+}",
  "diff --git a/src/index.ts b/src/index.ts",
  "index 5d6e7f8..9a0b1c2 100644",
  "--- a/src/index.ts",
  "+++ b/src/index.ts",
  "@@ -1,3 +1,4 @@",
  ' import { saludar } from "./saludo";',
  "-console.log(saludar());",
  '+import { horaActual } from "./reloj";',
  "+console.log(saludar(), horaActual(new Date()));",
  " export {};",
];
const textoEjemplo = lineasEjemplo.join("\n") + "\n";

describe("partirDiff() (spec: Diff de la tarea: función partirDiff (base del visor))", () => {
  it("con el texto de ejemplo: 2 archivos con los nombres, totales y hunks esperados", () => {
    const [primero, segundo] = partirDiff(textoEjemplo);
    expect(partirDiff(textoEjemplo)).toHaveLength(2);

    // Primer archivo: src/reloj.ts, todo agregado.
    expect(primero).toMatchObject({ nombre: "src/reloj.ts", agregadas: 3, borradas: 0 });
    expect(primero?.hunks).toHaveLength(1);
    expect(primero?.hunks[0]?.encabezado).toBe("@@ -0,0 +1,3 @@");
    expect(primero?.hunks[0]?.lineas).toEqual([
      { tipo: "add", texto: "export function horaActual(ahora: Date): string {" },
      { tipo: "add", texto: "  return ahora.toISOString().slice(11, 19);" },
      { tipo: "add", texto: "}" },
    ]);

    // Segundo archivo: src/index.ts, 2 agregadas y 1 borrada.
    expect(segundo).toMatchObject({ nombre: "src/index.ts", agregadas: 2, borradas: 1 });
    expect(segundo?.hunks).toHaveLength(1);
    expect(segundo?.hunks[0]?.lineas).toHaveLength(5);
    expect(segundo?.hunks[0]?.lineas.map((l) => l.tipo)).toEqual(["ctx", "del", "add", "add", "ctx"]);
  });

  it(`"" devuelve []`, () => {
    expect(partirDiff("")).toEqual([]);
  });

  it("con y sin el \\n final da el mismo resultado", () => {
    expect(partirDiff(textoEjemplo)).toEqual(partirDiff(textoEjemplo.slice(0, -1)));
  });

  it("un archivo binario queda con 0 / 0 y sin hunks", () => {
    const texto = ["diff --git a/img.png b/img.png", "Binary files a/img.png and b/img.png differ"].join("\n") + "\n";
    const archivos = partirDiff(texto);
    expect(archivos).toHaveLength(1);
    expect(archivos[0]).toEqual({ nombre: "img.png", agregadas: 0, borradas: 0, hunks: [] });
  });

  it("una línea \\ No newline at end of file tras una línea + no suma líneas ni cambia agregadas", () => {
    const texto =
      [
        "diff --git a/nota.txt b/nota.txt",
        "index 0000000..1a2b3c4 100644",
        "--- a/nota.txt",
        "+++ b/nota.txt",
        "@@ -1 +1 @@",
        "-viejo",
        "+nuevo",
        "\\ No newline at end of file",
      ].join("\n") + "\n";
    const [archivo] = partirDiff(texto);
    expect(archivo).toMatchObject({ agregadas: 1, borradas: 1 });
    expect(archivo?.hunks[0]?.lineas).toEqual([
      { tipo: "del", texto: "viejo" },
      { tipo: "add", texto: "nuevo" },
    ]);
  });

  it("un archivo con dos hunks (1 add y 1 del, y 2 add): hunks.length 2, agregadas 3, borradas 1", () => {
    const texto =
      [
        "diff --git a/dos.ts b/dos.ts",
        "index 1111111..2222222 100644",
        "--- a/dos.ts",
        "+++ b/dos.ts",
        "@@ -1,2 +1,2 @@",
        " contexto",
        "-borrada",
        "+agregada",
        "@@ -5,1 +5,2 @@",
        " contexto",
        "+otra",
        "+y otra",
      ].join("\n") + "\n";
    const [archivo] = partirDiff(texto);
    expect(archivo?.hunks).toHaveLength(2);
    expect(archivo?.agregadas).toBe(3);
    expect(archivo?.borradas).toBe(1);
  });
});
