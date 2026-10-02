import { describe, expect, it } from "vitest";
import { formatoGiB, formatoTokS, porcentaje } from "./maquinas.js";

/**
 * Aceptación de las funciones puras de `src/contrato/maquinas.ts` (spec: Vista Máquinas).
 * El módulo `maquinas.ts` lo crea esta misma tarea; hasta que exista, estos tests están en rojo.
 * La vista `Maquinas.tsx` se prueba en `e2e/maquinas.spec.ts` contra el build real.
 */

describe("formatoGiB() (spec: Vista Máquinas)", () => {
  it("18.4 → «18,4» (formato es-AR con 1 decimal)", () => {
    expect(formatoGiB(18.4)).toBe("18,4");
  });
  it("15.68 → «15,7» (redondea a 1 decimal)", () => {
    expect(formatoGiB(15.68)).toBe("15,7");
  });
  it("24 → «24,0» (siempre 1 decimal)", () => {
    expect(formatoGiB(24)).toBe("24,0");
  });
  it("null → «—»", () => {
    expect(formatoGiB(null)).toBe("—");
  });
  it("NaN → «—»", () => {
    expect(formatoGiB(Number.NaN)).toBe("—");
  });
});

describe("formatoTokS() (spec: Vista Máquinas)", () => {
  it("29.63 → «29,6»", () => {
    expect(formatoTokS(29.63)).toBe("29,6");
  });
  it("null → «—»", () => {
    expect(formatoTokS(null)).toBe("—");
  });
  it("NaN → «—»", () => {
    expect(formatoTokS(Number.NaN)).toBe("—");
  });
});

describe("porcentaje() (spec: Vista Máquinas)", () => {
  it("(12, 16) → 75", () => {
    expect(porcentaje(12, 16)).toBe(75);
  });
  it("(15.68, 15.98) → 98", () => {
    expect(porcentaje(15.68, 15.98)).toBe(98);
  });
  it("(20, 16) → 100 (acotado a 0–100)", () => {
    expect(porcentaje(20, 16)).toBe(100);
  });
  it("(0, 16) → 0", () => {
    expect(porcentaje(0, 16)).toBe(0);
  });
  it("si falta el usado, (null, 16) → null", () => {
    expect(porcentaje(null, 16)).toBeNull();
  });
  it("si falta el total, (12, null) → null", () => {
    expect(porcentaje(12, null)).toBeNull();
  });
  it("si el total es 0, (1, 0) → null", () => {
    expect(porcentaje(1, 0)).toBeNull();
  });
});
