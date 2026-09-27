export function Proximamente({ vista }: { vista: string }) {
  return (
    <section className="vista" data-testid={`vista-${vista}`}>
      <p className="vacio">Próximamente.</p>
    </section>
  );
}
