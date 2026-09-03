export default function AdminLoading() {
  return (
    <main
      aria-label="Cargando panel de administración"
      className="min-h-screen animate-pulse bg-slate-100"
    >
      <div className="h-20 border-b border-slate-200 bg-white" />
      <div className="mx-auto max-w-7xl space-y-12 px-6 py-16">
        <div className="h-20 max-w-2xl bg-slate-200" />
        <div className="grid gap-px bg-slate-200 sm:grid-cols-2">
          <div className="h-40 bg-white" />
          <div className="h-40 bg-white" />
        </div>
      </div>
    </main>
  );
}
