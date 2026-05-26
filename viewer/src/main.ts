import { listenRoute, type Route, navigate } from './router.js';
import { mount, h, clear } from './dom.js';
import { renderTopbar } from './components/Topbar.js';
import { renderHome } from './pages/Home.js';
import { renderSubject } from './pages/Subject.js';
import { renderVersion } from './pages/Version.js';
import { renderChapter, renderQuizPage } from './pages/Chapter.js';
import { renderTourOverview, renderTourStep } from './pages/TourStep.js';
import { renderSearch } from './pages/Search.js';
import { renderMe } from './pages/Me.js';
import { renderAdminUpload } from './pages/AdminUpload.js';
import { renderGlossary } from './pages/Glossary.js';

const root = document.querySelector<HTMLElement>('#app');
if (!root) throw new Error('#app element missing');

function renderNotFound(pathname: string): HTMLElement {
  return h('main', { class: 'not-found' },
    h('div', { class: 'empty-state' },
      h('div', { class: 'empty-state-icon' }, '404'),
      h('h1', null, 'Page not found'),
      h('p', null, "We couldn't find anything at ",
        h('code', null, pathname),
      ),
      h('div', { class: 'empty-state-actions' },
        h('a', {
          href: '/',
          onclick: (e: MouseEvent) => { e.preventDefault(); navigate('/'); },
        }, '← Back to subjects'),
      ),
    ),
  );
}

function renderError(err: { message?: string; status?: number; code?: string }): HTMLElement {
  return h('main', { class: 'error-page' },
    h('div', { class: 'empty-state' },
      h('div', { class: 'empty-state-icon' }, '⚠'),
      h('h1', null, 'Something went wrong'),
      err.code && h('p', { class: 'error-code' },
        h('code', null, err.code), err.status ? ` (HTTP ${err.status})` : '',
      ),
      h('p', { class: 'error-message' }, err.message ?? 'Unknown error'),
      h('div', { class: 'empty-state-actions' },
        h('button', {
          onclick: () => location.reload(),
        }, 'Retry'),
        h('a', {
          href: '/',
          onclick: (e: MouseEvent) => { e.preventDefault(); navigate('/'); },
        }, 'Back to subjects'),
      ),
    ),
  );
}

async function renderForRoute(route: Route): Promise<HTMLElement> {
  switch (route.kind) {
    case 'home':       return await renderHome();
    case 'subject':    return await renderSubject(route.subject);
    case 'version':    return await renderVersion(route.subject, route.version);
    case 'chapter':    return await renderChapter(route.subject, route.version, route.chapterId);
    case 'quiz':       return await renderQuizPage(route.subject, route.version, route.chapterId);
    case 'tour':       return await renderTourOverview(route.subject, route.version, route.tourId);
    case 'tour_step':  return await renderTourStep(route.subject, route.version, route.tourId, route.step);
    case 'search':     return await renderSearch(route.subject, route.version, route.q);
    case 'glossary':   return await renderGlossary(route.subject, route.version);
    case 'me':         return await renderMe();
    case 'admin':      return await renderAdminUpload();
    case 'admin_upload': return await renderAdminUpload();
    case 'notfound':   return renderNotFound(route.pathname);
  }
}

function scrollAfterPaint(): void {
  // If URL contains a #fragment, scroll the element with that id into view.
  // Otherwise reset to top so cross-page navigation feels right.
  const hash = location.hash.slice(1);
  if (hash) {
    const target = document.getElementById(decodeURIComponent(hash));
    if (target) {
      target.scrollIntoView({ block: 'start' });
      return;
    }
  }
  window.scrollTo(0, 0);
}

let currentPaintId = 0;

async function paint(route: Route) {
  const paintId = ++currentPaintId;
  clear(root!);
  root!.appendChild(renderTopbar());
  const loading = h('main', { class: 'loading' }, 'Loading…');
  root!.appendChild(loading);
  try {
    const page = await renderForRoute(route);
    if (paintId !== currentPaintId) return;
    if (loading.parentNode === root) root!.removeChild(loading);
    root!.appendChild(page);
    // Defer scroll one frame so the browser has laid out the new content.
    requestAnimationFrame(scrollAfterPaint);
  } catch (e: any) {
    if (paintId !== currentPaintId) return;
    if (loading.parentNode === root) root!.removeChild(loading);
    root!.appendChild(renderError(e));
  }
}

listenRoute((route) => {
  void paint(route);
});

// In-page hash clicks: native browser handles the jump, but our default page
// scroll-to-top would have fired first if we re-painted. We don't re-paint
// for pure hash changes — listenRoute fires on popstate + cw:route, and a
// hash-only change does not trigger popstate in the same way. Default scroll
// behavior takes over for `<a href="#x">`.

document.addEventListener('click', (e) => {
  const a = (e.target as Element | null)?.closest('a');
  if (!a) return;
  const href = a.getAttribute('href');
  if (!href || href.startsWith('http') || href.startsWith('//') || href.startsWith('#')) return;
  if (href.startsWith('/api/')) return;
  if (!href.startsWith('/')) return;  // mailto:, tel:, blob:, etc.
  if ((e as MouseEvent).metaKey || (e as MouseEvent).ctrlKey || (e as MouseEvent).shiftKey) return;
  e.preventDefault();
  navigate(href);
});

// Unused mount import shadow — keep TS happy if someone removes the topbar later
void mount;
