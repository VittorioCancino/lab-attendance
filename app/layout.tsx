import type { Metadata } from 'next';

import './globals.css';

export const metadata: Metadata = {
  title: 'Asistencia de laboratorio',
  description:
    'Registro de ingresos y salidas para la comunidad del laboratorio.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
