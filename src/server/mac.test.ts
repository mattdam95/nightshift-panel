import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { medirMac, memoriaDeMac, parsearVmStat, type Ejecutar } from "./mac.js";

// Los fixtures se leen con rutas relativas a la raíz del repo (desde donde corre vitest).
const fixtureVmStat = readFileSync("test/fixtures/vm_stat.txt", "utf8");

// Doble de Ejecutar: ningún comando real en los tests (el sandbox no tiene macOS).
const ejecutarConFixture: Ejecutar = async (comando) => (comando === "sysctl" ? "25769803776\n" : fixtureVmStat);

describe("parsearVmStat", () => {
  it("devuelve tamPagina 16384 y las páginas del fixture, sin los dos puntos ni el punto final", () => {
    const vm = parsearVmStat(fixtureVmStat);
    expect(vm.tamPagina).toBe(16384);
    expect(vm.paginas["Pages active"]).toBe(600000);
    expect(vm.paginas["Pages wired down"]).toBe(200000);
    expect(vm.paginas["Pages occupied by compressor"]).toBe(100000);
  });
  it('ignora las líneas sin la forma <etiqueta>: <número>. y no se traba con "Translation faults"', () => {
    const vm = parsearVmStat(fixtureVmStat);
    // La cabecera no tiene la forma de una línea de páginas: no aparece.
    expect(vm.paginas["Mach Virtual Memory Statistics"]).toBeUndefined();
    // La etiqueta con comillas se parsea igualmente y no rompe las demás.
    const trad = Object.entries(vm.paginas).find(([clave]) => clave.includes("Translation faults"));
    expect(trad?.[1]).toBe(99999999);
  });
});

describe("memoriaDeMac", () => {
  it("calcula la usada (active + wired + compressor) y la total, ambas a 1 decimal", () => {
    // (600000 + 200000 + 100000) * 16384 / 1024 ** 3 = 13.73… → 13.7
    // 25769803776 / 1024 ** 3 = 24
    expect(memoriaDeMac(parsearVmStat(fixtureVmStat), 25769803776)).toEqual({ usadaGiB: 13.7, totalGiB: 24 });
  });
  it("si falta alguna de las tres claves de páginas, cuenta como 0 (no tira)", () => {
    // (0 + 200000 + 100000) * 16384 / 1024 ** 3 = 4.6
    expect(
      memoriaDeMac({ tamPagina: 16384, paginas: { "Pages wired down": 200000, "Pages occupied by compressor": 100000 } }, 0).usadaGiB,
    ).toBe(4.6);
    // (600000 + 0 + 100000) * 16384 / 1024 ** 3 = 10.7
    expect(
      memoriaDeMac({ tamPagina: 16384, paginas: { "Pages active": 600000, "Pages occupied by compressor": 100000 } }, 0).usadaGiB,
    ).toBe(10.7);
    // (600000 + 200000 + 0) * 16384 / 1024 ** 3 = 12.2
    expect(memoriaDeMac({ tamPagina: 16384, paginas: { "Pages active": 600000, "Pages wired down": 200000 } }, 0).usadaGiB).toBe(12.2);
  });
});

describe("medirMac", () => {
  it("llama a sysctl y a vm_stat y devuelve la memoria del fixture", async () => {
    const ejecutados: [string, string[]][] = [];
    const ejecutar: Ejecutar = async (comando, args) => {
      ejecutados.push([comando, args]);
      return comando === "sysctl" ? "25769803776\n" : fixtureVmStat;
    };
    const mac = await medirMac(ejecutar);
    expect(ejecutados).toHaveLength(2);
    expect(ejecutados).toContainEqual(["sysctl", ["-n", "hw.memsize"]]);
    expect(ejecutados).toContainEqual(["vm_stat", []]);
    expect(mac).toEqual({ memoriaUsadaGiB: 13.7, memoriaTotalGiB: 24 });
  });
  it("ya no mide un revisor en la Mac: la respuesta solo trae la memoria", async () => {
    expect(Object.keys(await medirMac(ejecutarConFixture)).sort()).toEqual(["memoriaTotalGiB", "memoriaUsadaGiB"]);
  });
  it("si un ejecutar rechaza o sysctl no da un número, la memoria queda en null y no se propaga la excepción", async () => {
    const vacia = { memoriaUsadaGiB: null, memoriaTotalGiB: null };
    expect(
      await medirMac(async () => {
        throw new Error("fallo del comando");
      }),
    ).toEqual(vacia);
    expect(await medirMac(async (comando) => (comando === "vm_stat" ? Promise.reject(new Error("sin vm_stat")) : "25769803776\n"))).toEqual(
      vacia,
    );
    expect(await medirMac(async (comando) => (comando === "sysctl" ? "nada\n" : fixtureVmStat))).toEqual(vacia);
  });
});
