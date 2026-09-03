'use client';

import { useEffect } from 'react';

export function QrDisplayRefresh({ refreshAt }: { refreshAt: number }) {
  useEffect(() => {
    const delay = Math.max(1_000, refreshAt - Date.now() + 250);
    const timeout = window.setTimeout(() => {
      window.location.reload();
    }, delay);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [refreshAt]);

  return null;
}
