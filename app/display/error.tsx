'use client';

export default function DisplayError({ reset }: { reset: () => void }) {
  return (
    <main className="lab-grid grid min-h-screen place-items-center bg-slate-950 px-5 py-10 text-white">
      <section className="w-full max-w-lg border-t-4 border-amber-300 bg-slate-950 p-8 ring-1 ring-white/15 sm:p-10">
        <p className="text-xs font-bold tracking-[0.2em] text-amber-200 uppercase">
          Pantalla de asistencia
        </p>
        <h1 className="mt-5 text-4xl font-semibold tracking-tight">
          No fue posible preparar la pantalla
        </h1>
        <p className="mt-4 leading-7 text-slate-300">
          Revise la conexión e intente nuevamente. Si el problema continúa,
          solicite un nuevo código de activación.
        </p>
        <button
          className="mt-7 bg-white px-5 py-3 font-semibold text-slate-950 transition hover:bg-teal-100 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-teal-300"
          onClick={reset}
          type="button"
        >
          Intentar nuevamente
        </button>
      </section>
    </main>
  );
}
