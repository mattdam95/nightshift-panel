// Copia los datos de prueba a .e2e/lab (los tests escriben ahí sin ensuciar test/fixtures).
import { cpSync, rmSync } from "node:fs";
rmSync(".e2e", { recursive: true, force: true });
cpSync("test/fixtures/lab", ".e2e/lab", { recursive: true });
