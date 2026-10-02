import { useCallback, useEffect, useRef, useState } from "react";
import type { Cola, ItemCola } from "../../../src/contrato/api";
import { obtener } from "../api";

/** El `id` tiene la forma `owner/repo#N`: se corta en el último `#`. */
function partesId(id: string): { repo: string; numero: string } {
  const i = id.lastIndexOf("#");
  return { repo: id.slice(0, i), numero: id.slice(i + 1) };
}

function ItemColaVista({ item }: { item: ItemCola }) {
  const { repo, numero } = partesId(item.id);
  return (
    <li className="tarjeta cola-item" data-testid="item-cola">
      <span className="mono ref">
        #{numero} · {repo}
      </span>
      <a className="cola-enlace" data-testid="item-cola-enlace" href={item.url} target="_blank" rel="noopener noreferrer">
        {item.titulo}
      </a>
      {item.pregunta && (
        <p className="tarjeta destacada" data-testid="pregunta">
          {item.pregunta}
        </p>
      )}
    </li>
  );
}

function SeccionCola({ testid, titulo, items }: { testid: string; titulo: string; items: ItemCola[] }) {
  return (
    <section data-testid={testid}>
      <div className="cola-titulo">
        <h2>{titulo}</h2>
        <span className="sub" data-testid="cantidad">
          {items.length}
        </span>
      </div>
      {items.length === 0 ? (
        <p className="vacio" data-testid="nada">
          Nada por acá
        </p>
      ) : (
        <ul className="lista-cola">
          {items.map((item) => (
            <ItemColaVista key={item.id} item={item} />
          ))}
        </ul>
      )}
    </section>
  );
}

export function Cola(_props: { params: string[] }) {
  const [cola, setCola] = useState<Cola | null>(null);
  const [error, setError] = useState(false);
  const [cargando, setCargando] = useState(true);
  const enCurso = useRef(0);

  const cargar = useCallback(() => {
    const n = ++enCurso.current;
    setCargando(true);
    obtener<Cola>("/api/cola")
      .then((c) => {
        if (enCurso.current !== n) return;
        setCola(c);
        setError(false);
      })
      .catch(() => {
        if (enCurso.current !== n) return;
        // Un pedido fallido limpia lo que había en pantalla: solo queda el error.
        setCola(null);
        setError(true);
      })
      .finally(() => {
        if (enCurso.current === n) setCargando(false);
      });
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  return (
    <section className="vista" data-testid="vista-cola">
      <header className="cabecera">
        <div className="fila">
          <h1>Cola</h1>
          <button className="boton" data-testid="actualizar" disabled={cargando} onClick={cargar}>
            Actualizar
          </button>
        </div>
      </header>

      {error && (
        <p className="tarjeta error-texto" data-testid="error-cola">
          No se pudo traer la cola
        </p>
      )}
      {!error && cola === null && <p className="vacio">Cargando…</p>}
      {cola && (
        <>
          <SeccionCola testid="cola-listas" titulo="Listas" items={cola.listas} />
          <SeccionCola testid="cola-sin-definir" titulo="Sin definir" items={cola.sinDefinir} />
          <SeccionCola testid="cola-bloqueadas" titulo="Bloqueadas" items={cola.bloqueadas} />
        </>
      )}
    </section>
  );
}
