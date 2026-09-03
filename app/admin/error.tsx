'use client';

export default function AdminError({ reset }: { reset: () => void }) {
  return (
    <main className="grid min-h-screen place-items-center bg-slate-100 px-6">
      <section className="max-w-lg border-t-4 border-red-700 bg-white p-8 shadow-xl shadow-slate-900/5">
        <p className="text-xs font-bold tracking-[0.18em] text-red-700 uppercase">
          Panel no disponible
        </p>
        <h1 className="mt-4 text-3xl font-semibold tracking-tight text-slate-950">
          No fue posible cargar la administración
        </h1>
        <p className="mt-4 leading-7 text-slate-600">
          Intente nuevamente. Si el problema continúa, revise el estado de la
          instancia.
        </p>
        <button
          className="mt-7 bg-slate-950 px-5 py-3 font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-red-700"
          onClick={reset}
          type="button"
        >
          Intentar nuevamente
        </button>
      </section>
    </main>
  );
}
