export default function ManagerLoading() {
  return (
    <div
      aria-label="Cargando administración local"
      className="min-h-[calc(100vh-9rem)] animate-pulse bg-slate-100 motion-reduce:animate-none"
      role="status"
    >
      <div className="mx-auto max-w-7xl space-y-12 px-6 py-16">
        <div className="h-24 max-w-2xl bg-slate-200" />
        <div className="grid gap-px bg-slate-200 sm:grid-cols-3">
          <div className="h-40 bg-white" />
          <div className="h-40 bg-white" />
          <div className="h-40 bg-white" />
        </div>
      </div>
    </div>
  );
}
