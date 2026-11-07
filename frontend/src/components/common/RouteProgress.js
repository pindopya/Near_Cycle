'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

const STUCK_TIMEOUT_MS = 15000;

// Thin top bar shown from an internal link click until the new route renders.
export default function RouteProgress() {
  const pathname = usePathname();
  const [nav, setNav] = useState(null);
  // Derived instead of set in an effect: the bar finishes as soon as the pathname changes.
  const status = !nav ? 'idle' : nav.from === pathname ? 'loading' : 'done';

  useEffect(() => {
    function handleClick(event) {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const link = event.target.closest?.('a[href]');
      if (!link || (link.target && link.target !== '_self') || link.hasAttribute('download')) return;
      const url = new URL(link.href, window.location.href);
      // Same-path links (query-only changes, current page) never change pathname, so they'd never finish.
      if (url.origin !== window.location.origin || url.pathname === window.location.pathname) return;

      const next = { from: window.location.pathname };
      setNav(next);
      window.setTimeout(() => setNav((current) => (current === next ? null : current)), STUCK_TIMEOUT_MS);
    }

    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, []);

  return <div className={`routeProgress is-${status}`} aria-hidden="true" />;
}
