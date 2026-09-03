'use client';

export default function ScanError({ reset }: { reset: () => void }) {
  return (
    <main className="grid min-h-screen place-items-center bg-slate-950 px-5 py-10 text-white">
      <section className="w-full max-w-lg border-t-4 border-red-400 p-8 ring-1 ring-white/15 sm:p-10">
        <p className="text-xs font-bold tracking-[0.2em] text-red-300 uppercase">
          Registro de asistencia
        </p>
        <h1 className="mt-5 text-4xl font-semibold tracking-tight">
          No se pudo completar la solicitud
        </h1>
        <p className="mt-5 leading-7 text-slate-300">
          Ocurrió un problema inesperado. Intente nuevamente con el código QR
          vigente.
        </p>
        <button
          className="mt-8 bg-white px-5 py-3 font-semibold text-slate-950 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white"
          onClick={reset}
          type="button"
        >
          Intentar nuevamente
        </button>
      </section>
    </main>
  );
}
