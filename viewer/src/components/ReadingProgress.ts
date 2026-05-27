import { h } from '../dom.js';

/**
 * Thin horizontal bar at the top of the viewport that tracks reading progress
 * of the current `<article>`. Updates on scroll using a single rAF for
 * throttling. Self-cleaning: detaches its scroll listener when the article
 * element is removed from the DOM (next route paint).
 */
export function installReadingProgress(): HTMLElement {
  const bar = h('div', { class: 'reading-progress' },
    h('div', { class: 'reading-progress-fill' }),
  );

  let rafId = 0;
  let removed = false;

  const update = () => {
    rafId = 0;
    if (removed) return;
    const article = document.querySelector<HTMLElement>('article.chapter, article.tour-step, article.chapter-overview');
    const fill = bar.querySelector<HTMLElement>('.reading-progress-fill');
    if (!article || !fill) {
      if (fill) fill.style.width = '0%';
      return;
    }
    const rect = article.getBoundingClientRect();
    const viewportH = window.innerHeight;
    const total = Math.max(1, rect.height - viewportH);
    const scrolled = Math.max(0, -rect.top);
    const pct = Math.min(100, Math.max(0, (scrolled / total) * 100));
    fill.style.width = `${pct.toFixed(2)}%`;
  };

  const onScroll = () => {
    if (rafId) return;
    rafId = requestAnimationFrame(update);
  };

  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll, { passive: true });

  // Cleanup observer: when this bar is removed from the DOM (next paint
  // wipes #app), drop the scroll listener.
  const cleanupObserver = new MutationObserver(() => {
    if (!bar.isConnected) {
      removed = true;
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      cleanupObserver.disconnect();
    }
  });
  cleanupObserver.observe(document.body, { childList: true, subtree: true });

  // Initial paint
  requestAnimationFrame(update);
  return bar;
}
