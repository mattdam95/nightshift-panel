import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// La SPA vive en web/. En dev, /api va al server Hono (`pnpm dev:server`, puerto 8787).
export default defineConfig({
  root: "web",
  plugins: [react()],
  build: { outDir: "../dist/web", emptyOutDir: true },
  server: { proxy: { "/api": { target: "http://127.0.0.1:8787", changeOrigin: false } } },
});
