import { api } from '../api/client.js';

/**
 * Silently mark the current chapter as read when the reader has reached the
 * bottom and lingered for `dwellMs`. Skipped if the user is logged out, or if
 * the chapter is already marked read.
 *
 * Implementation: append an invisible sentinel near the end of the article,
 * observe it with IntersectionObserver; when it enters the viewport, start
 * a dwell timer; when leaves, cancel.
 */
export function installAutoMarkRead(
  article: HTMLElement,
  subject: string,
  version: string,
  chapterId: string,
  isLoggedIn: boolean,
  alreadyRead: boolean,
  dwellMs = 4000,
): void {
  if (!isLoggedIn || alreadyRead) return;
  if (typeof IntersectionObserver === 'undefined') return;

  const sentinel = document.createElement('div');
  sentinel.style.cssText = 'height: 1px; width: 100%; pointer-events: none;';
  sentinel.setAttribute('data-auto-mark-sentinel', '');

  // Put sentinel ~80% down the article: just before the last child(s).
  // Simpler: append at the end. If the article has navigation/addenda at the
  // end, those still count as "reached the end" reasonably.
  article.appendChild(sentinel);

  let timer = 0;
  let done = false;

  const obs = new IntersectionObserver((entries) => {
    if (done) return;
    for (const e of entries) {
      if (e.isIntersecting) {
        if (timer) continue;
        timer = window.setTimeout(async () => {
          done = true;
          obs.disconnect();
          try {
            await api.setProgress(subject, version, chapterId, 'read');
            // No notification — silent. Sidebar will pick up on next paint.
          } catch {
            // Best-effort; ignore failures.
          }
        }, dwellMs);
      } else {
        if (timer) {
          clearTimeout(timer);
          timer = 0;
        }
      }
    }
  }, { threshold: 0 });

  obs.observe(sentinel);

  // Cleanup if the article is removed from DOM (next paint)
  const cleanup = new MutationObserver(() => {
    if (!article.isConnected) {
      done = true;
      if (timer) clearTimeout(timer);
      obs.disconnect();
      cleanup.disconnect();
    }
  });
  cleanup.observe(document.body, { childList: true, subtree: true });
}
