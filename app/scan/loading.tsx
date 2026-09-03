export default function ScanLoading() {
  return (
    <main className="grid min-h-screen place-items-center bg-slate-950 px-5 text-white">
      <div
        aria-live="polite"
        className="w-full max-w-lg border-t-4 border-teal-400 p-8 ring-1 ring-white/15"
        role="status"
      >
        <div className="size-3 animate-pulse rounded-full bg-teal-300 ring-8 ring-teal-300/10" />
        <p className="mt-8 text-2xl font-semibold">Preparando el registro…</p>
        <p className="mt-3 text-slate-400">Espere un momento.</p>
      </div>
    </main>
  );
}
