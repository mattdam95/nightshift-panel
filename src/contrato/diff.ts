/**
 * Parte un diff de git en archivos, hunks y líneas. Función pura: base del visor de diff (issue #26);
 * se prueba acá con vitest (`diff.test.ts`), sin fixtures de archivo.
 */

export interface LineaDiff {
  tipo: "add" | "del" | "ctx";
  texto: string; // texto sin el prefijo +, - o espacio
}

export interface HunkDiff {
  encabezado: string; // la línea `@@ … @@` completa
  lineas: LineaDiff[];
}

export interface ArchivoDiff {
  nombre: string;
  agregadas: number;
  borradas: number;
  hunks: HunkDiff[];
}

/** La ruta de `b/`: lo que sigue al último ` b/` de la línea `diff --git a/… b/…`. */
function nombreDe(linea: string): string {
  const i = linea.lastIndexOf(" b/");
  return i === -1 ? "" : linea.slice(i + 3);
}

export function partirDiff(texto: string): ArchivoDiff[] {
  const archivos: ArchivoDiff[] = [];
  let actual: ArchivoDiff | null = null;
  let hunk: HunkDiff | null = null;

  for (const linea of texto.split("\n")) {
    if (linea.startsWith("diff --git ")) {
      actual = { nombre: nombreDe(linea), agregadas: 0, borradas: 0, hunks: [] };
      archivos.push(actual);
      hunk = null;
      continue;
    }
    if (!actual) continue;
    if (linea.startsWith("@@")) {
      hunk = { encabezado: linea, lineas: [] };
      actual.hunks.push(hunk);
      continue;
    }
    // Antes del primer @@ (`new file mode`, `index`, `---`, `+++`, `Binary files …`) se ignora.
    if (!hunk) continue;
    if (linea.startsWith("+")) {
      hunk.lineas.push({ tipo: "add", texto: linea.slice(1) });
      actual.agregadas++;
    } else if (linea.startsWith("-")) {
      hunk.lineas.push({ tipo: "del", texto: linea.slice(1) });
      actual.borradas++;
    } else if (linea.startsWith(" ")) {
      hunk.lineas.push({ tipo: "ctx", texto: linea.slice(1) });
    }
    // Cualquier otra línea (`\ No newline at end of file`, una vacía) se ignora.
  }

  return archivos;
}
