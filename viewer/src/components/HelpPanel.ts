import { h } from '../dom.js';

let panel: HTMLElement | null = null;

const SHORTCUTS: Array<[string[], string]> = [
  [['?'],          'Show this help'],
  [['/'],          'Open cross-chapter search'],
  [['⌘/Ctrl', 'K'],'Open cross-chapter search (alt)'],
  [['f'],          'Find in current chapter'],
  [['j'],          'Next chapter / tour step'],
  [['k'],          'Previous chapter / tour step'],
  [['Esc'],        'Close any modal'],
];

export function toggleHelpPanel(): void {
  if (panel) {
    closeHelpPanel();
    return;
  }
  panel = h('div', { class: 'help-overlay' },
    h('div', { class: 'help-modal' },
      h('h2', null, 'Keyboard shortcuts'),
      h('dl', { class: 'help-list' },
        ...SHORTCUTS.flatMap(([keys, desc]) => [
          h('dt', null, ...keys.flatMap((k, i) =>
            i === 0 ? [h('kbd', null, k)] : [h('span', { class: 'help-plus' }, '+'), h('kbd', null, k)]
          )),
          h('dd', null, desc),
        ]),
      ),
      h('p', { class: 'help-footer' }, 'Press ', h('kbd', null, 'Esc'), ' or ', h('kbd', null, '?'), ' again to close'),
    ),
  );
  panel.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    if (target.closest('.help-modal')) return;
    closeHelpPanel();
  });
  document.body.appendChild(panel);
}

export function closeHelpPanel(): void {
  if (panel) {
    panel.remove();
    panel = null;
  }
}

export function isHelpPanelOpen(): boolean {
  return panel !== null;
}
