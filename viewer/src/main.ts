import { listenRoute, type Route, navigate } from './router.js';
import { mount, h, clear } from './dom.js';
import { renderTopbar } from './components/Topbar.js';
import { renderHome } from './pages/Home.js';
import { renderSubject } from './pages/Subject.js';
import { renderChapter, renderQuizPage } from './pages/Chapter.js';
import { renderTourOverview, renderTourStep } from './pages/TourStep.js';
import { renderSearch } from './pages/Search.js';
import { renderMe } from './pages/Me.js';
import { renderAdminUpload } from './pages/AdminUpload.js';

const root = document.querySelector<HTMLElement>('#app');
if (!root) throw new Error('#app element missing');

async function renderForRoute(route: Route): Promise<HTMLElement> {
  switch (route.kind) {
    case 'home':       return await renderHome();
    case 'subject':    return await renderSubject(route.subject);
    case 'version':    return await renderSubject(route.subject);  // alias for now
    case 'chapter':    return await renderChapter(route.subject, route.version, route.chapterId);
    case 'quiz':       return await renderQuizPage(route.subject, route.version, route.chapterId);
    case 'tour':       return await renderTourOverview(route.subject, route.version, route.tourId);
    case 'tour_step':  return await renderTourStep(route.subject, route.version, route.tourId, route.step);
    case 'search':     return await renderSearch(route.subject, route.version, route.q);
    case 'me':         return await renderMe();
    case 'admin':      return await renderAdminUpload();
    case 'admin_upload': return await renderAdminUpload();
    case 'notfound':   return h('main', null, h('h1', null, 'Not found'), h('p', null, route.pathname));
  }
}

async function paint(route: Route) {
  clear(root!);
  root!.appendChild(renderTopbar());
  const loading = h('main', { class: 'loading' }, 'Loading…');
  root!.appendChild(loading);
  try {
    const page = await renderForRoute(route);
    root!.removeChild(loading);
    root!.appendChild(page);
  } catch (e: any) {
    root!.removeChild(loading);
    root!.appendChild(h('main', { class: 'error' }, h('h1', null, 'Error'), h('p', null, e.message)));
  }
}

listenRoute((route) => {
  void paint(route);
});

// Intercept all internal <a href="/..."> clicks so they go through router
document.addEventListener('click', (e) => {
  const a = (e.target as Element | null)?.closest('a');
  if (!a) return;
  const href = a.getAttribute('href');
  if (!href || href.startsWith('http') || href.startsWith('//') || href.startsWith('#')) return;
  if (href.startsWith('/api/')) return;  // let server handle auth redirects etc
  if ((e as MouseEvent).metaKey || (e as MouseEvent).ctrlKey || (e as MouseEvent).shiftKey) return;
  e.preventDefault();
  navigate(href);
});
