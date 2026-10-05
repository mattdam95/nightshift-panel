import { useRuta } from "./ruta";
import { useVivo } from "./useVivo";
import { Cola } from "./vistas/Cola";
import { Historial } from "./vistas/Historial";
import { Maquinas } from "./vistas/Maquinas";
import { Noche } from "./vistas/Noche";
import { Tarea } from "./vistas/Tarea";
import { Vivo } from "./vistas/Vivo";
import { Proximamente } from "./componentes/Proximamente";
import { Icono } from "./componentes/Icono";

/** Pestañas de la barra inferior. Las que no tienen vista todavía muestran "Próximamente" (las arman las issues `agent`). */
const PESTANAS = [
  { vista: "vivo", nombre: "En vivo", icono: "vivo" },
  { vista: "cola", nombre: "Cola", icono: "cola" },
  { vista: "historial", nombre: "Historial", icono: "historial" },
  { vista: "maquinas", nombre: "Máquinas", icono: "maquinas" },
] as const;

const VISTAS = new Set(["vivo", "cola", "historial", "noche", "tarea", "maquinas"]);

/** Rutas: #/vivo · #/cola · #/historial · #/noche/<fecha> · #/tarea/<owner>/<repo>/<n> · #/maquinas */
export function App() {
  const ruta = useRuta();
  // El stream vive en App: sigue conectado aunque se cambie de pestaña.
  const vivo = useVivo();

  return (
    <div className="app">
      <div className="estado-conexion" data-testid="estado-conexion" data-stream={vivo.stream} data-pc={vivo.pc}>
        <span className={`punto ${vivo.stream}`} />{" "}
        {vivo.stream === "en-vivo" ? "En vivo" : vivo.stream === "conectando" ? "Conectando…" : "Reconectando…"}
        <span className="sub"> · PC {vivo.pc === "sin-espejo" ? "(datos locales)" : vivo.pc}</span>
      </div>

      <div className="contenido" data-testid="contenido">
        <main>
          {ruta.vista === "vivo" && <Vivo datos={vivo} />}
          {ruta.vista === "cola" && <Cola params={ruta.params} />}
          {ruta.vista === "historial" && <Historial params={ruta.params} />}
          {ruta.vista === "noche" && <Noche params={ruta.params} />}
          {ruta.vista === "tarea" && <Tarea params={ruta.params} />}
          {ruta.vista === "maquinas" && <Maquinas params={ruta.params} />}
          {!VISTAS.has(ruta.vista) && <Proximamente vista={ruta.vista} />}
        </main>
      </div>

      <nav className="pestanas" aria-label="Secciones">
        {PESTANAS.map((p) => (
          <a
            key={p.vista}
            href={`#/${p.vista}`}
            aria-current={ruta.vista === p.vista ? "page" : undefined}
            data-testid={`pestana-${p.vista}`}
          >
            <Icono nombre={p.icono} />
            {p.nombre}
          </a>
        ))}
      </nav>
    </div>
  );
}
