import { h } from '../dom.js';

const OPEN_CLASS = 'sidebar-open';

function openDrawer() { document.body.classList.add(OPEN_CLASS); }
function closeDrawer() { document.body.classList.remove(OPEN_CLASS); }
function isOpen() { return document.body.classList.contains(OPEN_CLASS); }

export function renderDrawerToggle(): HTMLElement {
  const btn = h('button', {
    class: 'drawer-toggle',
    type: 'button',
    'aria-label': 'Toggle navigation',
    title: 'Toggle navigation',
    onclick: () => {
      if (isOpen()) closeDrawer();
      else openDrawer();
    },
  }, '☰');
  return btn;
}

/**
 * Close drawer on:
 *  - click outside the sidebar (backdrop)
 *  - link click inside the sidebar (navigation completed)
 *  - viewport widening past the drawer breakpoint
 * Installed once at app startup.
 */
export function installDrawerCloseHandlers(): void {
  document.addEventListener('click', (e) => {
    if (!isOpen()) return;
    const target = e.target as Element | null;
    if (!target) return;
    // Click on link inside sidebar → close after navigation runs
    if (target.closest('.sidebar a')) {
      // Defer so existing navigate() click handler runs first
      setTimeout(closeDrawer, 0);
      return;
    }
    // Click on backdrop (anywhere except sidebar / drawer toggle / inside main if it's the open backdrop)
    if (target.closest('.sidebar')) return;
    if (target.closest('.drawer-toggle')) return;
    closeDrawer();
  }, true);

  window.addEventListener('resize', () => {
    if (isOpen() && window.innerWidth > 800) closeDrawer();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && isOpen()) closeDrawer();
  });
}
