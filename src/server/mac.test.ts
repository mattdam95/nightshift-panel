import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { medirMac, memoriaDeMac, parsearVmStat, type Ejecutar, type Pedir } from "./mac.js";

// Los fixtures se leen con rutas relativas a la raíz del repo (desde donde corre vitest).
const fixtureVmStat = readFileSync("test/fixtures/vm_stat.txt", "utf8");

// Dobles de Ejecutar/Pedir: ningún comando real ni fetch real en los tests (el sandbox no tiene macOS ni red).
const ejecutarConFixture: Ejecutar = async (comando) => (comando === "sysctl" ? "25769803776\n" : fixtureVmStat);
const pedirCon =
  (respuesta: { ok: boolean; status: number }): Pedir =>
  async () =>
    respuesta;

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
  it("llama a sysctl y a vm_stat, pide <revisorUrl>/health, y devuelve la memoria del fixture", async () => {
    const ejecutados: [string, string[]][] = [];
    const urls: string[] = [];
    const ejecutar: Ejecutar = async (comando, args) => {
      ejecutados.push([comando, args]);
      return comando === "sysctl" ? "25769803776\n" : fixtureVmStat;
    };
    const pedir: Pedir = async (url) => {
      urls.push(url);
      return { ok: true, status: 200 };
    };
    const mac = await medirMac(ejecutar, pedir, "http://mi-mac:8081");
    expect(ejecutados).toHaveLength(2);
    expect(ejecutados).toContainEqual(["sysctl", ["-n", "hw.memsize"]]);
    expect(ejecutados).toContainEqual(["vm_stat", []]);
    expect(urls).toEqual(["http://mi-mac:8081/health"]);
    expect(mac.memoriaUsadaGiB).toBe(13.7);
    expect(mac.memoriaTotalGiB).toBe(24);
  });
  it("sin revisorUrl usa el por defecto: http://100.100.215.96:8081/health", async () => {
    const urls: string[] = [];
    const pedir: Pedir = async (url) => {
      urls.push(url);
      return { ok: true, status: 200 };
    };
    await medirMac(ejecutarConFixture, pedir);
    expect(urls).toEqual(["http://100.100.215.96:8081/health"]);
  });
  it("si un ejecutar rechaza, la memoria queda en null, el resto sale igual y no se propaga la excepción", async () => {
    const revisorOk = { salud: "ok", tokPorSegGeneracion: null, tokPorSegPrompt: null, peticionesEnCurso: null };
    const ejecutarRoto: Ejecutar = async () => {
      throw new Error("fallo del comando");
    };
    const mac = await medirMac(ejecutarRoto, pedirCon({ ok: true, status: 200 }));
    expect(mac).toEqual({ memoriaUsadaGiB: null, memoriaTotalGiB: null, revisor: revisorOk });

    const ejecutarSinVmStat: Ejecutar = async (comando) =>
      comando === "vm_stat" ? Promise.reject(new Error("sin vm_stat")) : "25769803776\n";
    const mac2 = await medirMac(ejecutarSinVmStat, pedirCon({ ok: true, status: 200 }));
    expect(mac2.memoriaUsadaGiB).toBeNull();
    expect(mac2.memoriaTotalGiB).toBeNull();
    expect(mac2.revisor).toEqual(revisorOk);
  });
  it("revisor.salud: ok con { ok: true, status: 200 }, caido con { ok: false, status: 503 }, apagado si pedir rechaza", async () => {
    const ok = await medirMac(ejecutarConFixture, pedirCon({ ok: true, status: 200 }));
    expect(ok.revisor.salud).toBe("ok");
    const caido = await medirMac(ejecutarConFixture, pedirCon({ ok: false, status: 503 }));
    expect(caido.revisor.salud).toBe("caido");
    const apagado = await medirMac(ejecutarConFixture, async () => {
      throw new Error("sin red");
    });
    expect(apagado.revisor.salud).toBe("apagado");
  });
  it("los tok/s y peticiones en curso del revisor quedan en null por ahora", async () => {
    const ok = await medirMac(ejecutarConFixture, pedirCon({ ok: true, status: 200 }));
    expect(ok.revisor).toEqual({ salud: "ok", tokPorSegGeneracion: null, tokPorSegPrompt: null, peticionesEnCurso: null });
    const apagado = await medirMac(ejecutarConFixture, async () => {
      throw new Error("sin red");
    });
    expect(apagado.revisor).toEqual({ salud: "apagado", tokPorSegGeneracion: null, tokPorSegPrompt: null, peticionesEnCurso: null });
  });
  it("pasa un AbortSignal en opciones.signal a pedir", async () => {
    let senalRecibida: unknown;
    const pedir: Pedir = async (_url, opciones) => {
      senalRecibida = opciones.signal;
      return { ok: true, status: 200 };
    };
    await medirMac(ejecutarConFixture, pedir);
    expect(senalRecibida).toBeInstanceOf(AbortSignal);
  });
});
