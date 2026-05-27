import { h } from '../dom.js';
import { getTheme, cycleTheme, type Theme } from '../theme.js';

const ICONS: Record<Theme, string> = {
  auto: '◐',
  light: '☀',
  dark: '☾',
};

const LABELS: Record<Theme, string> = {
  auto: 'Auto (follow OS)',
  light: 'Light',
  dark: 'Dark',
};

export function renderThemeToggle(): HTMLElement {
  const btn = h('button', {
    class: 'theme-toggle',
    type: 'button',
    'aria-label': `Theme: ${LABELS[getTheme()]}. Click to cycle.`,
    title: `Theme: ${LABELS[getTheme()]} (click to cycle)`,
    onclick: () => {
      const next = cycleTheme();
      btn.textContent = ICONS[next];
      btn.setAttribute('aria-label', `Theme: ${LABELS[next]}. Click to cycle.`);
      btn.setAttribute('title', `Theme: ${LABELS[next]} (click to cycle)`);
    },
  }, ICONS[getTheme()]);
  return btn;
}
