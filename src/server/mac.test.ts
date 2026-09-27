import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { medirMac, memoriaDeMac, parsearVmStat, type Ejecutar, type Pedir } from "./mac.js";

/** vm_stat con la forma real de macOS (valores inventados). */
const VM_STAT = readFileSync("test/fixtures/vm_stat.txt", "utf8");
/** `sysctl -n hw.memsize` de una Mac de 24 GiB (24 × 1024 ** 3). */
const MEMSIZE = "25769803776\n";

/**
 * Doblado para medirMac: `ejecutar` devuelve el fixture para `vm_stat` y el memsize para `sysctl`,
 * y `pedir` resuelve con `salud` (o lo rechaza si es un Error). Anota todas las llamadas para
 * verificarlos sin correr comandos reales ni fetch reales (el sandbox no tiene macOS ni red).
 */
const dobles = (salud: { ok: boolean; status: number } | Error = { ok: true, status: 200 }) => {
  const ejecutadas: { comando: string; args: string[] }[] = [];
  const pedidas: { url: string; signal: unknown }[] = [];
  const ejecutar: Ejecutar = async (comando, args) => {
    ejecutadas.push({ comando, args });
    if (comando === "sysctl") return MEMSIZE;
    if (comando === "vm_stat") return VM_STAT;
    throw new Error(`comando inesperado: ${comando}`);
  };
  const pedir: Pedir = async (url, opciones) => {
    pedidas.push({ url, signal: opciones.signal });
    if (salud instanceof Error) throw salud;
    return salud;
  };
  return { ejecutar, pedir, ejecutadas, pedidas };
};

describe("parsearVmStat", () => {
  it("devuelve el tamaño de página y las páginas del fixture, sin el punto final", () => {
    const vm = parsearVmStat(VM_STAT);
    expect(vm.tamPagina).toBe(16384);
    expect(vm.paginas["Pages active"]).toBe(600000);
    expect(vm.paginas["Pages wired down"]).toBe(200000);
    expect(vm.paginas["Pages occupied by compressor"]).toBe(100000);
  });

  it("ignora las líneas sin la forma <etiqueta>: <número>. y 'Translation faults' no rompe el parseo", () => {
    const vm = parsearVmStat(VM_STAT);
    // La cabecera ("Mach Virtual Memory Statistics: (page size of ...)") no es una página.
    expect(vm.paginas).not.toHaveProperty("Mach Virtual Memory Statistics");
    // 'Translation faults' (con comillas) no rompe el parseo: las demás claves siguen ahí.
    expect(vm.paginas["Pages active"]).toBe(600000);
    expect(vm.paginas["Swapouts"]).toBe(0);
  });
});

describe("memoriaDeMac", () => {
  const VM = parsearVmStat(VM_STAT);

  it("calcula la memoria usada y la total, ambas con 1 decimal", () => {
    // (600000 + 200000 + 100000) * 16384 / 1024 ** 3 = 13.73… → 13.7
    // 25769803776 / 1024 ** 3 = 24
    const m = memoriaDeMac(VM, 25769803776);
    expect(m.usadaGiB).toBe(Math.round((((600000 + 200000 + 100000) * 16384) / 1024 ** 3) * 10) / 10);
    expect(m.usadaGiB).toBe(13.7);
    expect(m.totalGiB).toBe(Math.round((25769803776 / 1024 ** 3) * 10) / 10);
    expect(m.totalGiB).toBe(24);
  });

  it("si falta alguna de las tres claves de páginas, cuenta como 0 (no tira)", () => {
    expect(memoriaDeMac({ tamPagina: 16384, paginas: {} }, 25769803776)).toEqual({ usadaGiB: 0, totalGiB: 24 });
    const soloActiva = { ...VM, paginas: { "Pages active": 600000 } };
    // 600000 * 16384 / 1024 ** 3 = 9.15… → 9.2 (wired y compressor faltan y cuentan como 0).
    expect(memoriaDeMac(soloActiva, 25769803776)).toEqual({
      usadaGiB: Math.round(((600000 * 16384) / 1024 ** 3) * 10) / 10,
      totalGiB: 24,
    });
  });
});

describe("medirMac", () => {
  const revisorOk = { salud: "ok", tokPorSegGeneracion: null, tokPorSegPrompt: null, peticionesEnCurso: null };

  it("llama a sysctl y a vm_stat, pide <revisorUrl>/health y arma la memoria", async () => {
    const { ejecutar, pedir, ejecutadas, pedidas } = dobles();
    const r = await medirMac(ejecutar, pedir);
    expect(ejecutadas).toContainEqual({ comando: "sysctl", args: ["-n", "hw.memsize"] });
    expect(ejecutadas).toContainEqual({ comando: "vm_stat", args: [] });
    expect(ejecutadas).toHaveLength(2);
    expect(pedidas.map((p) => p.url)).toEqual(["http://100.100.215.96:8081/health"]);
    expect(r.memoriaUsadaGiB).toBe(13.7);
    expect(r.memoriaTotalGiB).toBe(24);
    expect(r.revisor).toEqual(revisorOk);
  });

  it("usa la revisorUrl que le pasen", async () => {
    const { ejecutar, pedir, pedidas } = dobles();
    await medirMac(ejecutar, pedir, "http://192.168.0.10:9000");
    expect(pedidas.map((p) => p.url)).toEqual(["http://192.168.0.10:9000/health"]);
  });

  it("si sysctl rechaza, la memoria queda en null y el resto sale igual", async () => {
    const { pedir } = dobles();
    const ejecutar: Ejecutar = async (comando) => {
      if (comando === "sysctl") throw new Error("sin sysctl");
      return VM_STAT;
    };
    const r = await medirMac(ejecutar, pedir);
    expect(r.memoriaUsadaGiB).toBeNull();
    expect(r.memoriaTotalGiB).toBeNull();
    expect(r.revisor).toEqual(revisorOk);
  });

  it("si vm_stat rechaza, la memoria queda en null y el resto sale igual", async () => {
    const { pedir } = dobles();
    const ejecutar: Ejecutar = async (comando) => {
      if (comando === "vm_stat") throw new Error("sin vm_stat");
      return MEMSIZE;
    };
    const r = await medirMac(ejecutar, pedir);
    expect(r.memoriaUsadaGiB).toBeNull();
    expect(r.memoriaTotalGiB).toBeNull();
    expect(r.revisor).toEqual(revisorOk);
  });

  it("revisor.salud: 200 → 'ok', 503 → 'caido', y pedir que rechaza → 'apagado'", async () => {
    const { ejecutar } = dobles();
    const ok = await medirMac(ejecutar, dobles({ ok: true, status: 200 }).pedir);
    expect(ok.revisor.salud).toBe("ok");
    const caido = await medirMac(ejecutar, dobles({ ok: false, status: 503 }).pedir);
    expect(caido.revisor.salud).toBe("caido");
    const apagado = await medirMac(ejecutar, dobles(new Error("ECONNREFUSED")).pedir);
    expect(apagado.revisor.salud).toBe("apagado");
  });

  it("los tok/s y peticionesEnCurso del revisor son siempre null por ahora", async () => {
    const { ejecutar, pedir } = dobles();
    const r = await medirMac(ejecutar, pedir);
    expect(r.revisor.tokPorSegGeneracion).toBeNull();
    expect(r.revisor.tokPorSegPrompt).toBeNull();
    expect(r.revisor.peticionesEnCurso).toBeNull();
  });

  it("pasa un AbortSignal a pedir", async () => {
    const { ejecutar, pedir, pedidas } = dobles();
    await medirMac(ejecutar, pedir);
    expect(pedidas).toHaveLength(1);
    expect(pedidas[0]?.signal).toBeInstanceOf(AbortSignal);
  });
});
