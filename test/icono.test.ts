import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Icono } from "../web/src/componentes/Icono";

/** Base visual V2: `Icono` suma la prop `grosor` (el `strokeWidth`) y los íconos nuevos. */
describe("Icono", () => {
  it("grosor se refleja en el stroke-width del svg", () => {
    const html = renderToStaticMarkup(createElement(Icono, { nombre: "recargar", grosor: 1.5 }));
    expect(html).toContain('stroke-width="1.5"');
  });

  it("sin grosor usa 2", () => {
    expect(renderToStaticMarkup(createElement(Icono, { nombre: "recargar" }))).toContain('stroke-width="2"');
  });

  it.each(["abajo", "derecha", "atras", "pausa", "recargar", "pr", "juego"] as const)("dibuja el ícono %s", (nombre) => {
    const html = renderToStaticMarkup(createElement(Icono, { nombre }));
    expect(html).toMatch(/<(path|rect|circle)\b/);
  });
});
