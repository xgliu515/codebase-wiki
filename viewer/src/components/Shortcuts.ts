import { openSearchPalette, closeSearchPalette, isSearchPaletteOpen } from './SearchPalette.js';
import { toggleHelpPanel, closeHelpPanel, isHelpPanelOpen } from './HelpPanel.js';
import { openInChapterFind, closeInChapterFind, isInChapterFindOpen } from './InChapterFind.js';

/**
 * Global keyboard shortcuts. Single document-level listener; respects
 * input/textarea focus + modifier keys.
 */
export function installShortcuts(): void {
  document.addEventListener('keydown', (e) => {
    // Cmd+K / Ctrl+K opens search even from inside inputs
    if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) {
      e.preventDefault();
      openSearchPalette();
      return;
    }

    // Esc closes any open modal (lightbox handles its own Esc separately)
    if (e.key === 'Escape') {
      if (isInChapterFindOpen()) { closeInChapterFind(); return; }
      if (isSearchPaletteOpen()) { closeSearchPalette(); return; }
      if (isHelpPanelOpen()) { closeHelpPanel(); return; }
      return;
    }

    // For non-Cmd shortcuts: skip when user is typing in form controls or
    // any modifier is held. Search palette's own keydown handles ArrowUp/Down/Enter.
    const target = e.target as HTMLElement | null;
    if (target) {
      const tag = target.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable) return;
    }
    if (e.altKey || e.metaKey || e.ctrlKey || e.shiftKey) return;

    switch (e.key) {
      case '/':
        e.preventDefault();
        openSearchPalette();
        break;
      case '?':
        e.preventDefault();
        toggleHelpPanel();
        break;
      case 'f':
        e.preventDefault();
        openInChapterFind();
        break;
      case 'j':
        clickNav('next');
        break;
      case 'k':
        clickNav('prev');
        break;
    }
  });
}

function clickNav(dir: 'prev' | 'next'): void {
  const el = document.querySelector<HTMLAnchorElement>(`[data-nav="${dir}"]`);
  if (el) el.click();
}
