import { describe, expect, it } from "vitest";
import { fechaCorta, fechaLarga, hora, horaCorta } from "../web/src/formato.js";

/**
 * Aceptación de los arreglos chicos (spec: Arreglos chicos — horas).
 *
 * Las horas después de medianoche (00:xx en Argentina) salían como `24:xx` porque `hour12: false`
 * en `es-AR` representa medianoche como 24. Con `hourCycle: "h23"` salen `00:xx`.
 */

describe("hora y horaCorta: medianoche sale 00:xx, no 24:xx", () => {
  it('hora("2026-10-04T03:02:12.000Z") es "00:02:12" (03:02 UTC es 00:02 en Argentina)', () => {
    expect(hora("2026-10-04T03:02:12.000Z")).toBe("00:02:12");
  });

  it('horaCorta("2026-10-04T03:02:12.000Z") es "00:02"', () => {
    expect(horaCorta("2026-10-04T03:02:12.000Z")).toBe("00:02");
  });

  it('hora("2026-10-03T23:42:30.000Z") es "20:42:30" (la hora normal no cambia)', () => {
    expect(hora("2026-10-03T23:42:30.000Z")).toBe("20:42:30");
  });
});

describe("fechaCorta: «Dom 27 sep» a partir de AAAA-MM-DD, sin zona horaria", () => {
  it.each([
    ["2026-09-27", "Dom 27 sep"],
    ["2026-10-05", "Lun 5 oct"],
    ["2026-09-26", "Sáb 26 sep"],
    ["2026-09-30", "Mié 30 sep"],
    ["2026-01-01", "Jue 1 ene"],
    ["2026-12-25", "Vie 25 dic"],
    ["2026-09-29", "Mar 29 sep"],
  ])("%s → %s", (fecha, esperado) => {
    expect(fechaCorta(fecha)).toBe(esperado);
  });
});

describe("fechaLarga: «Sábado 3 oct» a partir de AAAA-MM-DD, sin zona horaria", () => {
  it.each([
    ["2026-10-03", "Sábado 3 oct"],
    ["2026-09-27", "Domingo 27 sep"],
    ["2026-10-05", "Lunes 5 oct"],
    ["2026-09-29", "Martes 29 sep"],
    ["2026-09-30", "Miércoles 30 sep"],
    ["2026-01-01", "Jueves 1 ene"],
    ["2026-12-25", "Viernes 25 dic"],
  ])("%s → %s", (fecha, esperado) => {
    expect(fechaLarga(fecha)).toBe(esperado);
  });

  it("un texto que no es una fecha vuelve igual", () => {
    expect(fechaLarga("ayer")).toBe("ayer");
  });
});
