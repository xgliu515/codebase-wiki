/**
 * Theme management. Three states:
 *   - 'auto' (default) — follows OS via prefers-color-scheme media query
 *   - 'light' — explicit override
 *   - 'dark'  — explicit override
 *
 * Stored as `cwsess` is — no, that's the session cookie. The theme key is
 * `cwtheme` in localStorage.
 */

export type Theme = 'auto' | 'light' | 'dark';

const STORAGE_KEY = 'cwtheme';

export function getTheme(): Theme {
  const v = localStorage.getItem(STORAGE_KEY);
  if (v === 'light' || v === 'dark' || v === 'auto') return v;
  return 'auto';
}

export function setTheme(t: Theme): void {
  if (t === 'auto') {
    localStorage.removeItem(STORAGE_KEY);
    document.documentElement.removeAttribute('data-theme');
  } else {
    localStorage.setItem(STORAGE_KEY, t);
    document.documentElement.setAttribute('data-theme', t);
  }
}

export function cycleTheme(): Theme {
  const order: Theme[] = ['auto', 'light', 'dark'];
  const next = order[(order.indexOf(getTheme()) + 1) % order.length]!;
  setTheme(next);
  return next;
}

export function effectiveScheme(): 'light' | 'dark' {
  const t = getTheme();
  if (t === 'light' || t === 'dark') return t;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

// Apply persisted theme at module load (before any UI renders).
const initial = localStorage.getItem(STORAGE_KEY);
if (initial === 'light' || initial === 'dark') {
  document.documentElement.setAttribute('data-theme', initial);
}
