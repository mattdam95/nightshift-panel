import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { Sonda } from "./espejo.js";
import { gpuDeSonda, metricasLlm, parsearPrometheus, pcDeSonda } from "./metricas.js";

// Los fixtures se leen con rutas relativas a la raíz del repo (desde donde corre vitest).
const fixtureLlama = readFileSync("test/fixtures/metrics-llama.txt", "utf8");
const sonda = JSON.parse(readFileSync("test/fixtures/sonda-pc.json", "utf8")) as Sonda;

describe("parsearPrometheus", () => {
  it("ignora las líneas vacías y los comentarios, y guarda nombre y valor (acepta : y notación científica)", () => {
    const mapa = parsearPrometheus("# HELP llamacpp:x ayuda\n\nllamacpp:x 1.3691e+06\nllamacpp:y 42\n");
    expect(mapa.get("llamacpp:x")).toBe(1369100);
    expect(mapa.get("llamacpp:y")).toBe(42);
    expect(mapa.size).toBe(2);
  });
  it("con el fixture: los valores de llama-server, y ninguna clave empieza con #", () => {
    const mapa = parsearPrometheus(fixtureLlama);
    expect(mapa.get("llamacpp:prompt_tokens_total")).toBe(70000);
    expect(mapa.get("llamacpp:tokens_predicted_seconds_total")).toBe(2700);
    expect(mapa.get("llamacpp:requests_processing")).toBe(1);
    for (const clave of mapa.keys()) expect(clave.startsWith("#")).toBe(false);
  });
});

describe("metricasLlm", () => {
  it("salud 200 → ok, 0 → apagado, cualquier otro código → caido", () => {
    expect(metricasLlm(200, "").salud).toBe("ok");
    expect(metricasLlm(0, "").salud).toBe("apagado");
    expect(metricasLlm(500, "").salud).toBe("caido");
    expect(metricasLlm(404, "").salud).toBe("caido");
  });
  it("con el fixture: tok/s redondeados a 2 decimales y peticiones en curso", () => {
    // llamacpp:tokens_predicted_total / llamacpp:tokens_predicted_seconds_total = 80000 / 2700
    // llamacpp:prompt_tokens_total / llamacpp:prompt_seconds_total = 70000 / 160
    expect(metricasLlm(200, fixtureLlama)).toEqual({
      salud: "ok",
      tokPorSegGeneracion: 29.63,
      tokPorSegPrompt: 437.5,
      peticionesEnCurso: 1,
    });
  });
  it("sin texto ni salud: apagado y los tres números en null", () => {
    expect(metricasLlm(0, "")).toEqual({ salud: "apagado", tokPorSegGeneracion: null, tokPorSegPrompt: null, peticionesEnCurso: null });
  });
  it("si falta alguna métrica de una división, o el divisor es 0, ese campo vale null", () => {
    expect(metricasLlm(200, "llamacpp:tokens_predicted_total 100\n").tokPorSegGeneracion).toBeNull();
    expect(
      metricasLlm(200, "llamacpp:tokens_predicted_total 100\nllamacpp:tokens_predicted_seconds_total 0\n").tokPorSegGeneracion,
    ).toBeNull();
    expect(metricasLlm(200, "llamacpp:prompt_tokens_total 100\n").tokPorSegPrompt).toBeNull();
    expect(metricasLlm(200, "llamacpp:prompt_tokens_total 100\nllamacpp:prompt_seconds_total 0\n").tokPorSegPrompt).toBeNull();
    expect(metricasLlm(200, "").peticionesEnCurso).toBeNull();
  });
});

describe("gpuDeSonda", () => {
  it("convierte mili °C → °C entero, µW → W con 1 decimal, y bytes → GiB con 2 decimales", () => {
    expect(gpuDeSonda({ tempMiliC: 68000, potenciaMicroW: 187000000, vramUsadaB: 16839708672, vramTotalB: 17163091968 })).toEqual({
      temperaturaC: 68,
      potenciaW: 187,
      vramUsadaGiB: 15.68,
      vramTotalGiB: 15.98,
    });
  });
  it("un campo que viene null queda null, y gpuDeSonda(null) devuelve null", () => {
    expect(gpuDeSonda({ tempMiliC: null, potenciaMicroW: 187000000, vramUsadaB: null, vramTotalB: 17163091968 })).toEqual({
      temperaturaC: null,
      potenciaW: 187,
      vramUsadaGiB: null,
      vramTotalGiB: 15.98,
    });
    expect(gpuDeSonda(null)).toBeNull();
  });
});

describe("pcDeSonda", () => {
  const llmApagado = { salud: "apagado", tokPorSegGeneracion: null, tokPorSegPrompt: null, peticionesEnCurso: null };
  it("conectada con la sonda del fixture: arma la parte pc completa", () => {
    expect(pcDeSonda(sonda, "conectada")).toEqual({
      conexion: "conectada",
      gpu: { temperaturaC: 68, potenciaW: 187, vramUsadaGiB: 15.68, vramTotalGiB: 15.98 },
      llm: { salud: "ok", tokPorSegGeneracion: 29.63, tokPorSegPrompt: 437.5, peticionesEnCurso: 1 },
    });
  });
  it("desconectada (sin sonda y con sonda): gpu null y llm apagado con los tres números en null", () => {
    expect(pcDeSonda(null, "desconectada")).toEqual({ conexion: "desconectada", gpu: null, llm: llmApagado });
    expect(pcDeSonda(sonda, "desconectada")).toEqual({ conexion: "desconectada", gpu: null, llm: llmApagado });
  });
});
