import type { ReactNode } from 'react';

import { logoutAction } from '@/app/admin/actions';
import { AdminNavigation } from '@/components/admin/AdminNavigation';
import { requireGlobalAdministrator } from '@/lib/auth/require-global-admin';

export default async function AdminLayout({
  children,
}: {
  children: ReactNode;
}) {
  const context = await requireGlobalAdministrator();

  return (
    <div className="min-h-screen bg-slate-100 text-slate-950">
      <a
        className="sr-only fixed top-3 left-3 z-50 bg-white px-4 py-3 font-semibold text-slate-950 shadow-lg focus:not-sr-only"
        href="#admin-content"
      >
        Ir al contenido principal
      </a>
      <header className="border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4 sm:px-8">
          <div className="flex items-center gap-3">
            <span className="grid size-10 place-items-center bg-slate-950 text-xs font-bold tracking-wider text-white">
              LA
            </span>
            <div>
              <p className="text-sm font-semibold">{context.lab.name}</p>
              <p className="text-xs text-slate-500">Administración global</p>
            </div>
          </div>

          <form action={logoutAction}>
            <button
              className="border-b border-slate-400 pb-1 text-sm font-semibold text-slate-700 transition hover:border-teal-700 hover:text-teal-800 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-teal-700"
              type="submit"
            >
              Cerrar sesión
            </button>
          </form>
        </div>
        <AdminNavigation />
      </header>

      <main
        className="lab-grid min-h-[calc(100vh-9rem)]"
        id="admin-content"
        tabIndex={-1}
      >
        {children}
      </main>
    </div>
  );
}
