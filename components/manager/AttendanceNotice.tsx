'use client';

import { useEffect } from 'react';

export function AttendanceNotice({
  message,
  tone,
}: {
  message: string;
  tone: 'CAUTION' | 'SUCCESS';
}) {
  useEffect(() => {
    const url = new URL(window.location.href);

    url.searchParams.delete('notice');
    window.history.replaceState(
      window.history.state,
      '',
      `${url.pathname}${url.search}${url.hash}`,
    );
  });

  return (
    <p
      className={`mt-6 border-l-4 px-5 py-4 text-sm font-medium ${
        tone === 'SUCCESS'
          ? 'border-emerald-600 bg-emerald-50 text-emerald-950'
          : 'border-amber-600 bg-amber-50 text-amber-950'
      }`}
      id="attendance-notice"
      role="status"
    >
      {message}
    </p>
  );
}
