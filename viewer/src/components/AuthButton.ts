import { h } from '../dom.js';
import { userStore } from '../state.js';
import { api } from '../api/client.js';

export function renderAuthButton(): HTMLElement {
  const u = userStore.get();
  if (!u) {
    return h('a', {
      class: 'auth-btn',
      href: '/api/v1/auth/github/start',
    }, 'Sign in with GitHub');
  }

  const onLogout = async () => {
    await api.logout();
    userStore.set(null);
    location.reload();
  };

  return h('div', { class: 'auth-menu' },
    u.avatar_url && h('img', { class: 'avatar', src: u.avatar_url, alt: u.login }),
    h('span', { class: 'login' }, u.login),
    u.is_admin && h('a', { class: 'admin-link', href: '/admin',
      onclick: (e: MouseEvent) => { e.preventDefault(); history.pushState({}, '', '/admin'); window.dispatchEvent(new Event('cw:route')); }
    }, 'Admin'),
    h('a', { class: 'logout-link', href: '#', onclick: (e: MouseEvent) => { e.preventDefault(); void onLogout(); } }, 'Logout'),
  );
}
