'use client';

import { useEffect } from 'react';

export function QrDisplayRefresh({
  refreshAfterMs,
}: {
  refreshAfterMs: number;
}) {
  useEffect(() => {
    const delay = Math.max(1_000, refreshAfterMs);
    const timeout = window.setTimeout(() => {
      window.location.reload();
    }, delay);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [refreshAfterMs]);

  return null;
}
