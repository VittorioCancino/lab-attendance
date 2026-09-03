'use client';

import { useEffect, useRef, useState } from 'react';

import { exchangeAttendanceQr } from '@/lib/api/attendance-scans';

type ExchangeState =
  { status: 'PROCESSING' } | { message: string; status: 'ERROR' };

export function ScanQrExchange({
  emptyTokenMessage = 'No se encontró un código QR. Escanee el código visible en la pantalla del laboratorio.',
  labName,
}: {
  emptyTokenMessage?: string;
  labName: string;
}) {
  const tokenRef = useRef<string | null>(null);
  const exchangeRef = useRef<symbol | null>(null);
  const [state, setState] = useState<ExchangeState>({ status: 'PROCESSING' });

  useEffect(() => {
    tokenRef.current ??= window.location.hash.slice(1);

    const token = tokenRef.current;
    const exchangeId = Symbol('attendance-qr-exchange');
    const controller = new AbortController();

    exchangeRef.current = exchangeId;
    const timeout = window.setTimeout(() => {
      controller.abort();

      if (exchangeRef.current === exchangeId) {
        setState({
          message:
            'No fue posible validar el código QR. Intente escanearlo nuevamente.',
          status: 'ERROR',
        });
      }
    }, 10_000);

    async function processToken(): Promise<void> {
      await Promise.resolve();

      if (controller.signal.aborted) {
        return;
      }

      try {
        window.history.replaceState(
          null,
          '',
          `${window.location.pathname}${window.location.search}`,
        );

        if (token === '') {
          setState({
            message: emptyTokenMessage,
            status: 'ERROR',
          });
          return;
        }

        const result = await exchangeAttendanceQr(token, controller.signal);

        if (exchangeRef.current !== exchangeId) {
          return;
        }

        if (!result.ok) {
          setState({ message: result.error, status: 'ERROR' });
          return;
        }

        window.location.replace('/scan');
      } catch {
        if (exchangeRef.current === exchangeId) {
          setState({
            message:
              'No fue posible validar el código QR. Intente escanearlo nuevamente.',
            status: 'ERROR',
          });
        }
      } finally {
        window.clearTimeout(timeout);
      }
    }

    void processToken();

    return () => {
      window.clearTimeout(timeout);
      controller.abort();

      if (exchangeRef.current === exchangeId) {
        exchangeRef.current = null;
      }
    };
  }, [emptyTokenMessage]);

  useEffect(() => {
    const reloadForNewToken = () => {
      if (window.location.hash.length > 1) {
        window.location.reload();
      }
    };

    window.addEventListener('hashchange', reloadForNewToken);

    return () => {
      window.removeEventListener('hashchange', reloadForNewToken);
    };
  }, []);

  return (
    <main className="lab-grid grid min-h-screen place-items-center bg-slate-950 px-5 py-10 text-white">
      <section
        aria-live="polite"
        aria-busy={state.status === 'PROCESSING'}
        className="w-full max-w-lg border-t-4 border-teal-400 bg-slate-950 p-7 shadow-[0_30px_100px_-30px_rgba(0,0,0,0.8)] ring-1 ring-white/15 sm:p-10"
        role="status"
      >
        <p className="text-xs font-bold tracking-[0.2em] text-teal-300 uppercase">
          {labName}
        </p>
        {state.status === 'ERROR' ? (
          <>
            <div className="mt-7 grid size-14 place-items-center border border-red-300/30 bg-red-300/10 text-2xl text-red-200">
              <span aria-hidden="true">×</span>
            </div>
            <h1 className="mt-6 text-4xl font-semibold tracking-tight sm:text-5xl">
              No fue posible validar el código QR
            </h1>
            <p className="mt-5 text-lg leading-8 text-slate-300">
              {state.message}
            </p>
            <p className="mt-8 border-l-2 border-slate-600 pl-4 text-sm leading-6 text-slate-400">
              Los códigos se renuevan automáticamente. Utilice siempre el que
              aparece actualmente en la pantalla.
            </p>
          </>
        ) : (
          <>
            <div className="mt-8 flex items-center gap-4">
              <span className="size-3 animate-pulse rounded-full bg-teal-300 ring-8 ring-teal-300/10" />
              <span className="h-px flex-1 bg-white/10" />
            </div>
            <h1 className="mt-8 text-4xl font-semibold tracking-tight sm:text-5xl">
              Validando acceso
            </h1>
            <p className="mt-5 text-lg leading-8 text-slate-300">
              Comprobando que el código corresponde a este laboratorio…
            </p>
            <p className="mt-8 text-sm text-slate-400">
              No cierre esta ventana.
            </p>
          </>
        )}
      </section>
    </main>
  );
}
