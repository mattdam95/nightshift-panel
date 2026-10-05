# AGENTS.md — reglas para el agente nocturno

Panel Nightshift: una SPA (Vite + React) y un server (Node + Hono) que muestran en vivo y en el historial
lo que hacen los agentes de nightshift. Se usa sobre todo desde el **iPhone** (PWA): todo es mobile-first.

## Estructura

```
src/contrato/   Tipos y funciones puras compartidas por server y web. api.ts = contrato HTTP y SSE.
                eventos.ts = formato de events.jsonl (NO cambiar: es copia de nightshift).
                vivo.ts = reductor del estado en vivo (evento → estado).
src/server/     Hono. app.ts = rutas; index.ts = arranque; almacen.ts = lectura de la copia local de /srv/lab;
                seguidor.ts = tail del events.jsonl; espejo.ts = SSH a la PC (no se puede probar en el sandbox).
web/src/        App.tsx = shell y rutas (#/vivo, #/cola, #/historial, #/noche/<fecha>, #/tarea/<owner>/<repo>/<n>, #/maquinas).
                vistas/<Vista>.tsx = una vista por archivo. componentes/ = piezas reutilizables. estilos.css = único CSS.
test/fixtures/  Datos SINTÉTICOS (lab/ tiene la misma forma que /srv/lab de la PC).
e2e/            Playwright (iPhone 15, Chromium). Corre el build real con PANEL_ESPEJO=0 y datos copiados a .e2e/lab.
```

## Reglas

- **No agregues dependencias.** No toques `package.json`, `pnpm-workspace.yaml`, el lockfile ni los `*.config.ts`/`tsconfig*.json`.
- Cada sección del server va en **su propio módulo** (`src/server/<seccion>.ts`) y se conecta en `index.ts` con una línea.
  Las rutas ya existen en `app.ts` y llaman a un proveedor de `Dependencias` (sin proveedor responden 501).
- Lo que ejecuta comandos (`ssh`, `gh`, `vm_stat`) va separado de lo que **parsea** su salida. El parseo es una
  función pura con tests unitarios sobre un fixture; el comando real no se prueba en el sandbox (no hay red ni PC).
- **Datos fijos para dev y e2e:** con `PANEL_ESPEJO=0`, `index.ts` conecta proveedores "fijos" que leen archivos de
  `$PANEL_FIXTURES` (en e2e y en `pnpm dev:server` vale `test/fixtures`). Cada sección usa su archivo: `sonda-pc.json`,
  `mac.json`, `cola.json`, `issues/<owner>_<repo>-<n>.json`, `diffs/<owner>_<repo>-<n>.diff`. Si el archivo no existe,
  el proveedor devuelve el estado vacío o "apagado". Así Playwright prueba cada vista sin PC, sin `gh` y sin red.
- **No modifiques los fixtures que ya existen** (otros tests dependen de ellos). Agregá archivos nuevos. Si agregás una noche
  de ejemplo en `test/fixtures/lab/logs/`, que sea **anterior a 2026-09-26**.
- UI: todo elemento que chequee un test lleva `data-testid`. Usá las variables CSS de `estilos.css`, nada de colores sueltos.
  Tiene que verse bien a 375 px de ancho sin scroll horizontal, y los toques necesitan al menos 44 px de alto.
- **`backdrop-filter`:** escribí `-webkit-backdrop-filter` ANTES que `backdrop-filter`. Con el orden inverso el minificador de
  Vite (lightningcss) descarta la versión sin prefijo y Chrome/Firefox dejan de dibujar el vidrio (verificado).
- **Orden del CSS:** los `web/src/estilos/<vista>.css` se cargan ANTES que `estilos.css` (`main.tsx` importa `App` primero) y,
  dentro de un mismo archivo, gana la regla que viene después. Con igual especificidad una clase base puede pisar a la tuya
  (pasó con `.boton-juego`/`.boton` y con `.capsula`/`.vidrio-amarillo`): subí la especificidad (`.vista-x .clase`) o poné
  la regla después, y escribí un test de `toHaveCSS` sobre el color que esperás.
- Textos de la UI en español rioplatense. Horas con `web/src/formato.ts`.
- Rutas de archivos en tests: `fileURLToPath(new URL("...", import.meta.url))`, nunca `new URL(...).pathname`.
  Los fixtures se leen con rutas relativas a la raíz del repo (`test/fixtures/...`): vitest y Playwright corren desde ahí.
- Si un test que escribiste falla, la primera hipótesis es tu código, nunca el caché de vitest o de Vite.

## Comandos

```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm build   # verificación estándar
pnpm test:e2e                                            # Playwright (arma el build solo)
pnpm dev:server & pnpm dev                                # desarrollo con test/fixtures/lab
```
