import { useLayoutEffect } from 'react';
import { useLocation } from 'react-router-dom';

/**
 * Start a long editorial page at the top when it opens or its subject changes
 * (the app shell keeps the previous scroll position). A #hash scrolls to its
 * target once it exists instead.
 */
export function useScrollReset(key: string, ready = true) {
  const { hash } = useLocation();
  useLayoutEffect(() => {
    if (!ready) return;
    if (hash) {
      const el = document.getElementById(decodeURIComponent(hash.slice(1)));
      if (el) {
        el.scrollIntoView({ block: 'start' });
        return;
      }
    }
    window.scrollTo(0, 0);
    // Only when the subject changes (or becomes ready), not on every hash change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, ready]);
}
