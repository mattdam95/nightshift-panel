import { expect, test } from "@playwright/test";
import type { DetalleTarea, ResultadoTarea } from "../src/contrato/api.js";

/**
 * Aceptación: íconos de estado en SVG en vez de emojis (spec: Íconos de estado en SVG en vez de emojis).
 *
 * El estado de una tarea se dibuja con `IconoEstado` de `web/src/componentes/Icono.tsx`
 * (`data-testid="icono-estado"`, `data-estado`, `role="img"`, `aria-label` = estado), no con un emoji.
 * El detalle de la tarea se prueba contra un pedido simulado con `page.route`, como en `tarea.spec.ts`
 * (cada spec arma sus datos, no los importa de otra).
 *
 * De solo lectura: no escribe en `.e2e/` (comparte un solo server y una sola copia de datos con las
 * demás specs).
 */

const RUTA_3 = "**/api/tareas/demo/panel/3";

const SPEC =
  "## Objetivo\n\n" +
  "El reloj de la noche muestra la hora actual en la vista del detalle.\n\n" +
  "## Criterios de aceptación\n\n" +
  "- [ ] La hora se actualiza cada minuto\n" +
  "- [ ] Cabe en 375 px de ancho";

const resultadoOk: ResultadoTarea = {
  tarea: "demo/panel#3",
  repo: "demo/panel",
  numero: 3,
  titulo: "Reloj de la noche",
  estado: "lista",
  motivo: "verificación OK y el revisor aprueba",
  inicio: "2026-09-27T01:00:21.000Z",
  fin: "2026-09-27T01:03:36.000Z",
  turnos: 5,
  tokens: 1110,
  llamadas: 4,
  rondasAgente: 2,
  testsAceptacion: ["pnpm lint", "pnpm test"],
  verificacion: {
    ok: true,
    pasos: [
      { comando: "pnpm install --frozen-lockfile", ok: true },
      { comando: "pnpm lint", ok: true },
      { comando: "pnpm test", ok: true },
    ],
  },
  revision: { estado: "aprobar", problemas: [], rondas: 1 },
  notaAgente: "Solo toqué el reloj; nada más cambió.",
  avisos: ["El turno 2 duró más de lo previsto"],
  pr: "https://github.com/demo/panel/pull/4",
};

const detalleOk: DetalleTarea = {
  id: "demo/panel#3",
  fecha: "2026-09-27",
  resultado: resultadoOk,
  eventos: [],
  spec: SPEC,
};

test("historial: la fila 2026-09-27 muestra un icono-estado lista y la 2026-09-26 uno bloqueada, con role img y aria-label", async ({
  page,
}) => {
  await page.goto("/#/historial");
  await expect(page.getByTestId("vista-historial")).toBeVisible();

  const filas = page.getByTestId("noche");
  await expect(filas).toHaveCount(2);
  await expect(filas.first().getByTestId("fecha-noche")).toHaveAttribute("datetime", "2026-09-27");
  await expect(filas.nth(1).getByTestId("fecha-noche")).toHaveAttribute("datetime", "2026-09-26");

  const lista = filas.first().locator('[data-testid="icono-estado"][data-estado="lista"]');
  await expect(lista).toHaveCount(1);
  await expect(lista).toHaveAttribute("role", "img");
  await expect(lista).toHaveAttribute("aria-label", "lista");

  const bloqueada = filas.nth(1).locator('[data-testid="icono-estado"][data-estado="bloqueada"]');
  await expect(bloqueada).toHaveCount(1);
  await expect(bloqueada).toHaveAttribute("role", "img");
  await expect(bloqueada).toHaveAttribute("aria-label", "bloqueada");
});

test("noche 2026-09-26: el único resultado muestra un icono-estado bloqueada", async ({ page }) => {
  await page.goto("/#/noche/2026-09-26");
  await expect(page.getByTestId("vista-noche")).toBeVisible();

  const resultado = page.getByTestId("resultado");
  await expect(resultado).toHaveCount(1);
  await expect(resultado.locator('[data-testid="icono-estado"][data-estado="bloqueada"]')).toHaveCount(1);
});

test("tarea (detalle mockeado, estado lista): tarea-estado muestra un icono-estado lista y su texto sigue diciendo lista", async ({
  page,
}) => {
  await page.route(RUTA_3, (route) => route.fulfill({ json: detalleOk }));

  await page.goto("/#/tarea/demo/panel/3");
  await expect(page.getByTestId("vista-tarea")).toBeVisible();

  const chip = page.getByTestId("tarea-estado");
  await expect(chip).toContainText("lista");
  await expect(chip.locator('[data-testid="icono-estado"][data-estado="lista"]')).toHaveCount(1);
});

test("historial, noche y tarea sin los emojis de estado (✅ ⛔ ⚠ ⏸ 💥)", async ({ page }) => {
  await page.goto("/#/historial");
  await expect(page.getByTestId("vista-historial")).toBeVisible();
  await expect(page.getByTestId("vista-historial")).not.toContainText(/[✅⛔⚠⏸💥]/u);

  await page.goto("/#/noche/2026-09-26");
  await expect(page.getByTestId("vista-noche")).toBeVisible();
  await expect(page.getByTestId("vista-noche")).not.toContainText(/[✅⛔⚠⏸💥]/u);

  await page.route(RUTA_3, (route) => route.fulfill({ json: detalleOk }));
  await page.goto("/#/tarea/demo/panel/3");
  await expect(page.getByTestId("vista-tarea")).toBeVisible();
  await expect(page.getByTestId("vista-tarea")).not.toContainText(/[✅⛔⚠⏸💥]/u);
});
