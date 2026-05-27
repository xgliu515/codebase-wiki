import { h } from '../dom.js';
import { navigate } from '../router.js';
import { renderAuthButton } from './AuthButton.js';
import { renderThemeToggle } from './ThemeToggle.js';

export function renderTopbar(): HTMLElement {
  return h('header', { class: 'topbar' },
    h('a', {
      class: 'brand',
      href: '/',
      onclick: (e: MouseEvent) => { e.preventDefault(); navigate('/'); },
    }, 'codebase-wiki'),
    h('nav', null,
      h('a', {
        href: '/',
        onclick: (e: MouseEvent) => { e.preventDefault(); navigate('/'); },
      }, 'Subjects'),
    ),
    renderThemeToggle(),
    renderAuthButton(),
  );
}
