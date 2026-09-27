import { EventEmitter } from "node:events";
import { closeSync, existsSync, openSync, readSync, statSync } from "node:fs";
import type { Evento } from "../contrato/eventos.js";
import { parsearLinea } from "../contrato/eventos.js";
import type { EstadoVivo } from "../contrato/vivo.js";
import { aplicarEvento, estadoInicial } from "../contrato/vivo.js";
import type { Almacen } from "./almacen.js";

export interface EventoConId {
  id: string;
  evento: Evento;
}

/**
 * Sigue el events.jsonl de la noche más nueva de la copia local, como `tail -F`.
 * No sabe nada de SSH: el espejo escribe el archivo y esto lo lee. Así los tests y el modo
 * desarrollo usan una carpeta cualquiera, y basta con agregar líneas para simular una noche.
 *
 * Emite:
 *  - "evento" (EventoConId): cada línea nueva completa.
 *  - "noche" (fecha): apareció una carpeta de logs más nueva.
 */
export class Seguidor extends EventEmitter {
  fecha: string | null = null;
  estado: EstadoVivo = estadoInicial();
  /** Líneas leídas del archivo actual (incluye líneas inválidas, para que los ids coincidan con el número de línea). */
  private lineas = 0;
  private offset = 0;
  private resto = "";
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly almacen: Almacen,
    private readonly intervaloMs = 500,
  ) {
    super();
  }

  iniciar(): void {
    this.revisar();
    this.timer = setInterval(() => this.revisar(), this.intervaloMs);
    this.timer.unref();
  }

  detener(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  get ultimoId(): string | null {
    return this.fecha && this.lineas > 0 ? `${this.fecha}:${this.lineas}` : null;
  }

  /** Eventos de la noche actual posteriores a un id SSE (`<fecha>:<n>`). Si el id es de otra noche, todos. */
  eventosDesde(id: string | null): EventoConId[] {
    if (!this.fecha) return [];
    const [fecha, n] = (id ?? "").split(":");
    const desde = fecha === this.fecha ? Number(n) || 0 : 0;
    const salida: EventoConId[] = [];
    // Relee el archivo: es chico (~50 KB por noche) y así los ids salen del número de línea real.
    const lineas = this.almacen.eventosCrudos(this.fecha);
    lineas.forEach((l, i) => {
      if (i + 1 <= desde || i + 1 > this.lineas) return;
      const ev = parsearLinea(l);
      if (ev) salida.push({ id: `${this.fecha}:${i + 1}`, evento: ev });
    });
    return salida;
  }

  /** Un paso de sondeo. Público para los tests. */
  revisar(): void {
    const ultima = this.almacen.ultimaFecha();
    if (ultima && ultima !== this.fecha) {
      const habia = this.fecha !== null;
      this.fecha = ultima;
      this.estado = estadoInicial(ultima);
      this.lineas = 0;
      this.offset = 0;
      this.resto = "";
      if (habia) this.emit("noche", ultima);
    }
    if (!this.fecha) return;
    const archivo = this.almacen.archivoEventos(this.fecha);
    if (!existsSync(archivo)) return;
    const tam = statSync(archivo).size;
    if (tam < this.offset) {
      // El archivo se achicó (no debería pasar en la PC): se relee desde cero.
      this.estado = estadoInicial(this.fecha);
      this.lineas = 0;
      this.offset = 0;
      this.resto = "";
    }
    if (tam === this.offset) return;
    const buf = Buffer.alloc(tam - this.offset);
    const fd = openSync(archivo, "r");
    try {
      readSync(fd, buf, 0, buf.length, this.offset);
    } finally {
      closeSync(fd);
    }
    this.offset = tam;
    const texto = this.resto + buf.toString("utf8");
    const partes = texto.split("\n");
    // La última parte puede ser una línea a medio escribir: se guarda hasta que llegue el "\n".
    this.resto = partes.pop() ?? "";
    for (const linea of partes) {
      this.lineas += 1;
      const ev = parsearLinea(linea);
      if (!ev) continue;
      this.estado = aplicarEvento(this.estado, ev);
      this.emit("evento", { id: `${this.fecha}:${this.lineas}`, evento: ev } satisfies EventoConId);
    }
  }
}
