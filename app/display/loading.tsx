export default function DisplayLoading() {
  return (
    <main className="lab-grid grid min-h-screen place-items-center bg-slate-950 px-5 py-10 text-white">
      <section
        aria-live="polite"
        className="w-full max-w-lg border-t-4 border-teal-400 bg-slate-950 p-8 ring-1 ring-white/15 sm:p-10"
        role="status"
      >
        <p className="text-xs font-bold tracking-[0.2em] text-teal-300 uppercase">
          Pantalla de asistencia
        </p>
        <h1 className="mt-5 text-4xl font-semibold tracking-tight">
          Preparando el código QR
        </h1>
        <p className="mt-4 leading-7 text-slate-300">
          Espere mientras se valida esta pantalla.
        </p>
      </section>
    </main>
  );
}
