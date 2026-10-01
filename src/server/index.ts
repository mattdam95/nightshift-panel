import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Almacen } from "./almacen.js";
import { crearApp, type FuentePc } from "./app.js";
import { crearProveedorCola, traerDeFixtures, traerDeGh } from "./cola.js";
import { Espejo, estadoPcDeSonda } from "./espejo.js";
import { Seguidor } from "./seguidor.js";

/**
 * Variables de entorno:
 *   PANEL_PUERTO   (8787)  Puerto local. `tailscale serve` lo publica por HTTPS en la tailnet.
 *   PANEL_HOST     (127.0.0.1)  Solo local: el acceso de afuera es por `tailscale serve`, nunca por la LAN.
 *   PANEL_DATOS    (~/.nightshift-panel/lab)  Copia local de /srv/lab.
 *   PANEL_ESPEJO   (1)  0 para no conectarse a la PC (dev y tests: se usa PANEL_DATOS tal cual).
 *   PC_SSH         (pc-lab)  Alias de SSH de la PC.
 *   PC_LAB         (/srv/lab)  Raíz del laboratorio en la PC.
 *   PANEL_FIXTURES (sin valor)  Con PANEL_ESPEJO=0: carpeta de datos fijos para los proveedores (ver AGENTS.md).
 *   PANEL_REPOS    (mattdam95/monigotes,mattdam95/nightshift-panel)  Repos de la cola, separados por comas.
 */
const env = process.env;
const aqui = fileURLToPath(new URL(".", import.meta.url));
const raizProyecto = resolve(aqui, "../..");
const datos = resolve(env.PANEL_DATOS ?? join(homedir(), ".nightshift-panel", "lab"));
const conEspejo = (env.PANEL_ESPEJO ?? "1") !== "0";
const version = (JSON.parse(readFileSync(join(raizProyecto, "package.json"), "utf8")) as { version: string }).version;

const almacen = new Almacen(datos);
const seguidor = new Seguidor(almacen);
seguidor.iniciar();

// Cola de issues: con espejo apagado y PANEL_FIXTURES, los datos salen del fixture (ver AGENTS.md).
const repos = (env.PANEL_REPOS ?? "mattdam95/monigotes,mattdam95/nightshift-panel")
  .split(",")
  .map((r) => r.trim())
  .filter((r) => r !== "");
const traerIssues = !conEspejo && env.PANEL_FIXTURES ? traerDeFixtures(env.PANEL_FIXTURES) : traerDeGh();
const cola = crearProveedorCola({ repos, traer: traerIssues });

let pc: FuentePc | undefined;
let espejo: Espejo | undefined;
if (conEspejo) {
  espejo = new Espejo({
    host: env.PC_SSH ?? "pc-lab",
    raizRemota: env.PC_LAB ?? "/srv/lab",
    raizLocal: datos,
    dirControl: join(homedir(), ".nightshift-panel"),
  });
  const e = espejo;
  pc = {
    conexion: () => e.conexion,
    estadoPc: () => (e.ultimaSonda ? estadoPcDeSonda(e.ultimaSonda) : null),
    suscribir: (fn) => {
      e.on("pc", fn);
      return () => e.off("pc", fn);
    },
  };
  void espejo.iniciar();
}

const app = crearApp({ almacen, seguidor, pc, version, cola });

// SPA: los archivos del build de Vite, y cualquier otra ruta devuelve index.html (el router es del cliente).
const web = join(raizProyecto, "dist", "web");
const webRel = relative(process.cwd(), web) || ".";
if (existsSync(web)) {
  app.use("/*", serveStatic({ root: webRel }));
  app.get("*", serveStatic({ root: webRel, path: "index.html" }));
}

const puerto = Number(env.PANEL_PUERTO ?? 8787);
const host = env.PANEL_HOST ?? "127.0.0.1";
const server = serve({ fetch: app.fetch, port: puerto, hostname: host }, () =>
  console.log(`Panel Nightshift en http://${host}:${puerto} (datos: ${datos}, espejo: ${conEspejo ? "sí" : "no"})`),
);

const salir = () => {
  espejo?.detener();
  seguidor.detener();
  server.close();
  process.exit(0);
};
process.on("SIGTERM", salir);
process.on("SIGINT", salir);
