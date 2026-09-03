export default function AttendanceLoading() {
  return (
    <main className="lab-grid grid min-h-svh place-items-center bg-slate-950 px-5 py-10 text-white">
      <div
        aria-live="polite"
        className="w-full max-w-lg border-t-4 border-teal-400 p-8 ring-1 ring-white/15"
        role="status"
      >
        <div className="size-3 animate-pulse rounded-full bg-teal-300 ring-8 ring-teal-300/10 motion-reduce:animate-none" />
        <p className="mt-8 text-2xl font-semibold">Preparando su cuenta…</p>
      </div>
    </main>
  );
}
