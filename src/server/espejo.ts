import { spawn, type ChildProcess } from "node:child_process";
import { EventEmitter } from "node:events";
import { appendFileSync, existsSync, mkdirSync, renameSync, statSync, utimesSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { ConexionPc, EstadoPc } from "../contrato/api.js";

/**
 * Espejo de /srv/lab de la PC en una carpeta de la Mac, por SSH (sin puertos nuevos, con la clave
 * que ya usa `pc-lab`). Todo va por una sola conexión maestra de SSH (ControlMaster), definida acá
 * con `-o`, sin tocar ~/.ssh/config.
 *
 * Ciclo:
 *  1. Sonda: un script por `sh -s` que devuelve JSON con el estado de nightshift, sensores de la GPU,
 *     /metrics del llama-server y el tamaño de cada archivo a copiar.
 *  2. Sincronización: baja solo lo que cambió. events.jsonl se completa por el final (es append-only);
 *     los .json y .md se reemplazan enteros.
 *  3. Seguimiento: `tail -c +N -F` sobre el events.jsonl de la noche más nueva, agregando los bytes al
 *     archivo local. El Seguidor lee ese archivo como si fuera local.
 *  Si la PC se apaga, el SSH se corta y se reintenta con espera creciente (5 s → 60 s).
 */
export interface OpcionesEspejo {
  host: string;
  raizRemota: string;
  raizLocal: string;
  /** Carpeta del socket de ControlMaster (ruta corta: macOS limita los sockets a 104 caracteres). */
  dirControl: string;
  sondaCadaMs?: number;
  log?: (msg: string) => void;
}

export interface ArchivoRemoto {
  tam: number;
  mtime: number;
  /** Relativa a la raíz: "logs/2026-09-27/events.jsonl", "state/noches/2026-09-27.json", "reports/2026-09-27.md". */
  ruta: string;
}

export interface Sonda {
  ts: string;
  corriendo: boolean;
  pausado: boolean;
  actual: EstadoPc["actual"];
  ultimaNoche: string | null;
  archivos: ArchivoRemoto[];
  gpu: { tempMiliC: number | null; potenciaMicroW: number | null; vramUsadaB: number | null; vramTotalB: number | null };
  /** `salud`: código HTTP de /health (0 si no respondió). `metricas`: texto Prometheus de /metrics, o "". */
  llm: { salud: number; metricas: string };
}

const RUTA_SEGURA = /^(logs\/\d{4}-\d{2}-\d{2}\/events\.jsonl|state\/noches\/\d{4}-\d{2}-\d{2}\.json|reports\/\d{4}-\d{2}-\d{2}\.md)$/;

/** Script de la sonda. Solo lee: no toca nada en la PC. Necesita jq y curl (están instalados). */
export function scriptSonda(raiz: string): string {
  return String.raw`
set -u
L='${raiz}'
pausado=false; [ -e "$L/state/pausa" ] && pausado=true
corriendo=false; pid=$(cat "$L/state/run.lock" 2>/dev/null || true)
[ -n "$pid" ] && kill -0 "$pid" 2>/dev/null && corriendo=true
actual=$(cat "$L/state/actual.json" 2>/dev/null || true)
printf '%s' "$actual" | jq -e . >/dev/null 2>&1 || actual=null
ultima=$(ls -1 "$L/logs" 2>/dev/null | grep -E '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' | sort | tail -n 1)
archivos=$(cd "$L" && stat -c '%s %Y %n' logs/*/events.jsonl state/noches/*.json reports/*.md 2>/dev/null \
  | jq -R -s 'split("\n") | map(select(length > 0) | split(" ") | {tam: (.[0]|tonumber), mtime: (.[1]|tonumber), ruta: .[2]})')
h=$(ls -d /sys/class/drm/card*/device/hwmon/hwmon* 2>/dev/null | head -n 1)
leer() { v=$(cat "$1" 2>/dev/null) && [ -n "$v" ] && echo "$v" || echo null; }
temp=$(leer "$h/temp1_input"); pot=$(leer "$h/power1_average")
vu=$(leer "$h/../../mem_info_vram_used"); vt=$(leer "$h/../../mem_info_vram_total")
LLM_API_KEY=; [ -r "$L/llm/.env" ] && LLM_API_KEY=$(grep -E '^LLM_API_KEY=' "$L/llm/.env" | cut -d= -f2-)
salud=$(curl -s -m 2 -o /dev/null -w '%{http_code}' http://127.0.0.1:8080/health || true); [ -n "$salud" ] || salud=0
[ -n "$archivos" ] || archivos='[]'
metricas=; [ "$salud" = 200 ] && metricas=$(curl -s -m 2 -H "Authorization: Bearer $LLM_API_KEY" http://127.0.0.1:8080/metrics || true)
jq -n -c --argjson pausado "$pausado" --argjson corriendo "$corriendo" --argjson actual "$actual" \
  --arg ultima "$ultima" --argjson archivos "$archivos" \
  --argjson temp "$temp" --argjson pot "$pot" --argjson vu "$vu" --argjson vt "$vt" \
  --arg salud "$salud" --arg metricas "$metricas" \
  '{ts: (now | todate), corriendo: $corriendo, pausado: $pausado, actual: $actual,
    ultimaNoche: (if $ultima == "" then null else $ultima end), archivos: $archivos,
    gpu: {tempMiliC: $temp, potenciaMicroW: $pot, vramUsadaB: $vu, vramTotalB: $vt},
    llm: {salud: ($salud | tonumber? // 0), metricas: $metricas}}'
`;
}

export function estadoPcDeSonda(s: Sonda): EstadoPc {
  return { ts: s.ts, corriendo: s.corriendo, pausado: s.pausado, actual: s.actual, ultimaNoche: s.ultimaNoche };
}

/** Qué hay que bajar: archivos remotos que no existen o difieren de la copia local. */
export function planSincronizacion(
  remotos: ArchivoRemoto[],
  local: (ruta: string) => { tam: number; mtime: number } | null,
): { ruta: string; desde: number }[] {
  const plan: { ruta: string; desde: number }[] = [];
  for (const r of remotos) {
    if (!RUTA_SEGURA.test(r.ruta)) continue;
    const l = local(r.ruta);
    if (r.ruta.endsWith(".jsonl")) {
      const tam = l?.tam ?? 0;
      if (tam < r.tam) plan.push({ ruta: r.ruta, desde: tam });
    } else if (!l || l.tam !== r.tam || Math.floor(l.mtime) !== r.mtime) {
      plan.push({ ruta: r.ruta, desde: 0 });
    }
  }
  return plan;
}

export class Espejo extends EventEmitter {
  conexion: ConexionPc = "desconectada";
  ultimaSonda: Sonda | null = null;
  private detenido = false;
  private tail: ChildProcess | null = null;
  private seguida: string | null = null;
  private readonly log: (msg: string) => void;

  constructor(private readonly op: OpcionesEspejo) {
    super();
    this.log = op.log ?? ((m) => console.log(`[espejo] ${m}`));
    mkdirSync(op.raizLocal, { recursive: true });
    mkdirSync(op.dirControl, { recursive: true, mode: 0o700 });
  }

  private argsSsh(): string[] {
    return [
      "-o",
      "BatchMode=yes",
      "-o",
      "ConnectTimeout=5",
      "-o",
      "ServerAliveInterval=10",
      "-o",
      "ServerAliveCountMax=3",
      "-o",
      "ControlMaster=auto",
      "-o",
      `ControlPath=${join(this.op.dirControl, "cm-%C")}`,
      "-o",
      "ControlPersist=60",
      this.op.host,
    ];
  }

  /** Corre un comando remoto y junta la salida. Rechaza si sale con código distinto de 0 o tarda más que `timeoutMs`. */
  private ejecutar(comando: string, stdin?: string, timeoutMs = 20_000): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const hijo = spawn("ssh", [...this.argsSsh(), comando], { stdio: ["pipe", "pipe", "pipe"] });
      const partes: Buffer[] = [];
      let err = "";
      const timer = setTimeout(() => hijo.kill("SIGKILL"), timeoutMs);
      hijo.stdout.on("data", (b: Buffer) => partes.push(b));
      hijo.stderr.on("data", (b: Buffer) => (err += b.toString()));
      hijo.on("error", reject);
      hijo.on("close", (codigo) => {
        clearTimeout(timer);
        if (codigo === 0) resolve(Buffer.concat(partes));
        else reject(new Error(`ssh ${comando.slice(0, 40)} → código ${codigo}: ${err.trim().slice(0, 300)}`));
      });
      hijo.stdin.end(stdin ?? "");
    });
  }

  async sondear(): Promise<Sonda> {
    const salida = await this.ejecutar("sh -s", scriptSonda(this.op.raizRemota), 15_000);
    const sonda = JSON.parse(salida.toString("utf8")) as Sonda;
    this.ultimaSonda = sonda;
    return sonda;
  }

  private rutaLocal(ruta: string): string {
    return join(this.op.raizLocal, ruta);
  }

  async sincronizar(sonda: Sonda, excepto?: string): Promise<number> {
    const plan = planSincronizacion(sonda.archivos, (ruta) => {
      const p = this.rutaLocal(ruta);
      if (!existsSync(p)) return null;
      const st = statSync(p);
      return { tam: st.size, mtime: st.mtimeMs / 1000 };
    }).filter((p) => p.ruta !== excepto);
    for (const { ruta, desde } of plan) {
      const remoto = `${this.op.raizRemota}/${ruta}`;
      const datos = await this.ejecutar(desde > 0 ? `tail -c +${desde + 1} '${remoto}'` : `cat '${remoto}'`);
      const destino = this.rutaLocal(ruta);
      mkdirSync(dirname(destino), { recursive: true });
      if (ruta.endsWith(".jsonl")) {
        appendFileSync(destino, datos);
      } else {
        writeFileSync(`${destino}.tmp`, datos);
        renameSync(`${destino}.tmp`, destino);
        // Misma mtime que en la PC, para no volver a bajarlo en la próxima sonda.
        const mtime = sonda.archivos.find((a) => a.ruta === ruta)!.mtime;
        utimesSync(destino, mtime, mtime);
      }
    }
    return plan.length;
  }

  /** Arranca `tail -F` sobre el events.jsonl de `fecha`. Termina cuando se corta el SSH o se llama a `cortarSeguimiento`. */
  private seguir(fecha: string): Promise<void> {
    const ruta = `logs/${fecha}/events.jsonl`;
    const destino = this.rutaLocal(ruta);
    mkdirSync(dirname(destino), { recursive: true });
    const desde = existsSync(destino) ? statSync(destino).size : 0;
    this.seguida = fecha;
    this.log(`siguiendo ${ruta} desde el byte ${desde}`);
    return new Promise((resolve) => {
      const hijo = spawn("ssh", [...this.argsSsh(), `exec tail -c +${desde + 1} -F '${this.op.raizRemota}/${ruta}'`], {
        stdio: ["ignore", "pipe", "pipe"],
      });
      this.tail = hijo;
      hijo.stdout.on("data", (b: Buffer) => appendFileSync(destino, b));
      hijo.stderr.on("data", (b: Buffer) => {
        const t = b.toString().trim();
        // tail -F avisa en stderr cuando el archivo se reemplaza; no es un error.
        if (t && !/has been replaced|has appeared/.test(t)) this.log(`tail: ${t.slice(0, 200)}`);
      });
      hijo.on("close", () => {
        this.tail = null;
        this.seguida = null;
        resolve();
      });
      hijo.on("error", () => resolve());
    });
  }

  private cortarSeguimiento(): void {
    this.tail?.kill("SIGTERM");
  }

  private marcar(conexion: ConexionPc): void {
    const cambio = conexion !== this.conexion;
    this.conexion = conexion;
    if (cambio) this.log(`PC ${conexion}`);
    this.emit("pc", conexion, this.ultimaSonda ? estadoPcDeSonda(this.ultimaSonda) : null);
  }

  /** Bucle principal. Nunca rechaza: los errores se registran y se reintenta. */
  async iniciar(): Promise<void> {
    let espera = 5_000;
    const cada = this.op.sondaCadaMs ?? 15_000;
    let timerSonda: NodeJS.Timeout | null = null;
    while (!this.detenido) {
      try {
        const sonda = await this.sondear();
        this.marcar("conectada");
        await this.sincronizar(sonda);
        espera = 5_000;
        if (!sonda.ultimaNoche) {
          await dormir(cada);
          continue;
        }
        // Mientras dura el tail, la sonda sigue corriendo: actualiza el estado, baja los .json/.md que
        // cambiaron y corta el tail si apareció una noche más nueva (el bucle arranca la siguiente).
        timerSonda = setInterval(() => {
          this.sondear()
            .then(async (s) => {
              this.marcar("conectada");
              await this.sincronizar(s, `logs/${this.seguida}/events.jsonl`);
              if (s.ultimaNoche && s.ultimaNoche !== this.seguida) this.cortarSeguimiento();
            })
            .catch((err: unknown) => {
              this.log(`sonda falló: ${String(err).slice(0, 200)}`);
              this.cortarSeguimiento();
            });
        }, cada);
        await this.seguir(sonda.ultimaNoche);
      } catch (err) {
        this.log(`sin conexión con la PC (${String(err).slice(0, 160)}); reintento en ${espera / 1000} s`);
        this.marcar("desconectada");
        await dormir(espera);
        espera = Math.min(espera * 2, 60_000);
      } finally {
        if (timerSonda) clearInterval(timerSonda);
        timerSonda = null;
      }
    }
  }

  detener(): void {
    this.detenido = true;
    this.cortarSeguimiento();
  }

  /** Corre un comando de nightshift en la PC (acciones del panel). */
  async nightshift(args: string): Promise<string> {
    const salida = await this.ejecutar(`cd '${this.op.raizRemota}/nightshift' && node dist/cli.js ${args}`, undefined, 60_000);
    return salida.toString("utf8");
  }

  /** Diff de la tarea en curso contra su base, leído del repo de trabajo en la PC. */
  async diffEnCurso(idCarpeta: string, base: string): Promise<string> {
    if (!/^[\w.-]+$/.test(idCarpeta) || !/^[0-9a-f]{7,40}$/.test(base)) throw new Error("parámetros inválidos");
    const salida = await this.ejecutar(`git -C '${this.op.raizRemota}/tasks/${idCarpeta}/repo' diff ${base}`, undefined, 30_000);
    return salida.toString("utf8");
  }
}

const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));
