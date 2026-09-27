# Despliegue del panel en la Mac

Todo sin sudo. Cada paso dice por qué.

1. **Build** (una vez, y después de cada merge): `pnpm install && pnpm build`.
   Si el pnpm del Mac apunta al registry de Coder: `npm_config_registry=https://registry.npmjs.org pnpm install`.
2. **Servicio que arranca solo** (LaunchAgent del usuario, reinicia el server si se cae):
   ```bash
   cp despliegue/com.nightshift.panel.plist ~/Library/LaunchAgents/
   launchctl bootstrap gui/501 ~/Library/LaunchAgents/com.nightshift.panel.plist
   ```
   Escucha solo en `127.0.0.1:8787`. Log: `~/.nightshift-panel/panel.log`. Sacarlo:
   `launchctl bootout gui/501/com.nightshift.panel`. Reiniciarlo tras un build: `launchctl kickstart -k gui/501/com.nightshift.panel`.
3. **Publicarlo en la tailnet** (HTTPS con certificado de Tailscale, solo tus dispositivos; no abre puertos a la LAN):
   ```bash
   tailscale serve --bg 8787
   ```
   Queda en `https://matiass-macbook-pro.tail9e65f6.ts.net/`. Ver: `tailscale serve status`. Sacarlo: `tailscale serve --https=443 off`.
4. **iPhone:** abrir esa URL en Safari → Compartir → "Agregar a pantalla de inicio".

Con la Mac suspendida el panel no responde (la PC tampoco está: se apaga al terminar la noche). Mientras la Mac
esté despierta, el espejo reintenta la PC cada 5–60 s y baja lo nuevo cuando la PC prende.
