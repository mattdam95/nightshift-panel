# Panel Nightshift

Visualizador de los agentes nocturnos del Laboratorio Nightshift: qué tarea corre, en qué etapa, qué
herramientas llama, historial por noche, cola y métricas de las máquinas. SPA en Vite + React y server en
Node + Hono, servidos desde la Mac y publicados solo en la tailnet con `tailscale serve`.

## Arquitectura

```
PC (se apaga sola)                         Mac (sirve el panel)                         iPhone
/srv/lab/logs/<fecha>/events.jsonl ──ssh── espejo.ts  → ~/.nightshift-panel/lab/ ──┐
/srv/lab/state/noches/<fecha>.json   (tail -F y      (copia local: sirve de día     │
/srv/lab/reports/<fecha>.md           sonda cada 15 s) con la PC apagada)           │
llama-server :8080/metrics ─────────┘                                               │
                                           seguidor.ts (tail de la copia) → SSE ────┼─→ PWA (Safari)
                                           almacen.ts (historial bajo demanda) → REST┘   por tailscale serve
```

- **Sin puertos nuevos:** la Mac entra a la PC por el SSH que ya existe (alias `pc-lab`), con una conexión
  maestra (`ControlMaster`) configurada por línea de comandos. La PC no expone nada.
- **Sin base de datos:** el historial se parsea de los jsonl bajo demanda (~50 KB por noche) con caché.
- **Contrato:** `src/contrato/api.ts` (REST y SSE) y `src/contrato/eventos.ts` (copia del formato de nightshift).
- El SSE manda cada línea de `events.jsonl` sin cambios, con `id: <fecha>:<línea>`; al reconectar,
  el navegador manda `Last-Event-ID` y el server reenvía lo que faltó.

## Uso

```bash
pnpm install
pnpm build
pnpm start                 # http://127.0.0.1:8787, con espejo de la PC
PANEL_ESPEJO=0 PANEL_DATOS=test/fixtures/lab pnpm start   # sin PC, con datos de ejemplo
```

Variables: ver el comentario de `src/server/index.ts`. Despliegue en la Mac: `despliegue/DESPLIEGUE.md`.
Reglas para el agente nocturno: `AGENTS.md`.
