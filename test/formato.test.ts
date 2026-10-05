import { describe, expect, it } from "vitest";
import { hora, horaCorta } from "../web/src/formato.js";

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
