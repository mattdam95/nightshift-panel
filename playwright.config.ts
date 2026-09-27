import { defineConfig, devices } from "@playwright/test";

// Los e2e corren contra el build real con datos de prueba copiados a .e2e/lab (sin PC ni SSH).
// e2e/preparar.mjs arma esa carpeta; los tests le agregan eventos para simular una noche en vivo.
const PUERTO = 8790;

export default defineConfig({
  testDir: "e2e",
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: { baseURL: `http://127.0.0.1:${PUERTO}`, trace: "retain-on-failure" },
  projects: [{ name: "iphone", use: { ...devices["iPhone 15"], browserName: "chromium" } }],
  webServer: {
    command: `node e2e/preparar.mjs && pnpm build && PANEL_ESPEJO=0 PANEL_DATOS=.e2e/lab PANEL_FIXTURES=test/fixtures PANEL_PUERTO=${PUERTO} node dist/server/index.js`,
    url: `http://127.0.0.1:${PUERTO}/api/salud`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
