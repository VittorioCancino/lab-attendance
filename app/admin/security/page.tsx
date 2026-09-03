import type { Metadata } from 'next';

import { ChangePasswordForm } from '@/components/admin/ChangePasswordForm';

export const metadata: Metadata = {
  title: 'Contraseña | Administración global',
  description: 'Actualización de la contraseña de la cuenta administradora.',
};

export default function AdminSecurityPage() {
  return (
    <div className="mx-auto max-w-5xl px-5 py-10 sm:px-8 sm:py-14 lg:py-20">
      <section className="grid gap-10 border-t-4 border-teal-700 bg-white p-7 shadow-xl shadow-slate-900/5 sm:p-10 lg:grid-cols-[minmax(16rem,0.7fr)_minmax(0,1.3fr)]">
        <div>
          <p className="text-xs font-bold tracking-[0.2em] text-teal-800 uppercase">
            Seguridad de la cuenta
          </p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight text-slate-950">
            Actualizar contraseña
          </h1>
          <p className="mt-5 max-w-md leading-7 text-slate-600">
            El valor inicial del entorno solo crea una cuenta ausente. Esta
            configuración nunca reemplaza una contraseña existente.
          </p>
          <p className="mt-5 border-l-2 border-amber-500 pl-4 text-sm leading-6 text-slate-600">
            Al guardar el cambio, se cerrarán las sesiones emitidas con la
            contraseña anterior.
          </p>
        </div>

        <ChangePasswordForm />
      </section>
    </div>
  );
}
