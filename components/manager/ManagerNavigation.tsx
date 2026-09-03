'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const navigation = [
  { href: '/manager', label: 'Resumen' },
  { href: '/manager/users', label: 'Usuarios' },
  { href: '/manager/attendance', label: 'Asistencia' },
  { href: '/manager/displays', label: 'Pantallas QR' },
] as const;

export function ManagerNavigation() {
  const pathname = usePathname();

  return (
    <nav aria-label="Administración local" className="overflow-x-auto">
      <ul className="mx-auto flex w-max max-w-7xl min-w-full gap-1 px-5 sm:px-8">
        {navigation.map((item) => {
          const isActive =
            item.href === '/manager'
              ? pathname === item.href
              : pathname.startsWith(item.href);

          return (
            <li key={item.href}>
              <Link
                aria-current={isActive ? 'page' : undefined}
                className={`block border-b-2 px-4 py-4 text-sm font-semibold whitespace-nowrap transition focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-teal-700 ${
                  isActive
                    ? 'border-teal-700 text-slate-950'
                    : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-900'
                }`}
                href={item.href}
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
