import type { ReactNode } from 'react';

import { managerLogoutAction } from '@/app/manager/actions';
import { ManagerNavigation } from '@/components/manager/ManagerNavigation';
import { requireLabManager } from '@/lib/auth/require-lab-manager';

export default async function ManagerLayout({
  children,
}: {
  children: ReactNode;
}) {
  const context = await requireLabManager();

  return (
    <div className="min-h-screen bg-slate-100 text-slate-950">
      <a
        className="sr-only fixed top-3 left-3 z-50 bg-white px-4 py-3 font-semibold text-slate-950 shadow-lg focus:not-sr-only"
        href="#manager-content"
      >
        Ir al contenido principal
      </a>
      <header className="border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-5 px-5 py-4 sm:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid size-10 shrink-0 place-items-center bg-teal-800 text-xs font-bold tracking-wider text-white">
              LA
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">
                {context.lab.name}
              </p>
              <p className="text-xs text-slate-500">Administración local</p>
            </div>
          </div>

          <form action={managerLogoutAction}>
            <button
              className="border-b border-slate-400 pb-1 text-sm font-semibold whitespace-nowrap text-slate-700 transition hover:border-teal-700 hover:text-teal-800 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-teal-700"
              type="submit"
            >
              Cerrar sesión
            </button>
          </form>
        </div>
        <ManagerNavigation />
      </header>

      <main
        className="lab-grid min-h-[calc(100vh-9rem)]"
        id="manager-content"
        tabIndex={-1}
      >
        {children}
      </main>
    </div>
  );
}
