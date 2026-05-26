export type Route =
  | { kind: 'home' }
  | { kind: 'subject'; subject: string }
  | { kind: 'version'; subject: string; version: string }
  | { kind: 'chapter'; subject: string; version: string; chapterId: string }
  | { kind: 'quiz'; subject: string; version: string; chapterId: string }
  | { kind: 'tour'; subject: string; version: string; tourId: string }
  | { kind: 'tour_step'; subject: string; version: string; tourId: string; step: number }
  | { kind: 'search'; subject: string; version: string; q: string }
  | { kind: 'glossary'; subject: string; version: string }
  | { kind: 'admin' }
  | { kind: 'admin_upload' }
  | { kind: 'me' }
  | { kind: 'notfound'; pathname: string };

export function parseRoute(pathname: string, search = ''): Route {
  if (pathname === '/' || pathname === '') return { kind: 'home' };
  if (pathname === '/me') return { kind: 'me' };
  if (pathname === '/admin') return { kind: 'admin' };
  if (pathname === '/admin/upload') return { kind: 'admin_upload' };

  const parts = pathname.replace(/^\/+|\/+$/g, '').split('/');
  if (parts[0] === 'wiki' && parts.length >= 2) {
    const subject = parts[1]!;
    if (parts.length === 2) return { kind: 'subject', subject };
    const version = parts[2]!;
    if (parts.length === 3) return { kind: 'version', subject, version };
    if (parts[3] === 'chapter' && parts[4]) {
      if (parts[5] === 'quiz') return { kind: 'quiz', subject, version, chapterId: parts[4] };
      return { kind: 'chapter', subject, version, chapterId: parts[4] };
    }
    if (parts[3] === 'tour' && parts[4]) {
      if (parts[5]) return { kind: 'tour_step', subject, version, tourId: parts[4], step: Number(parts[5]) };
      return { kind: 'tour', subject, version, tourId: parts[4] };
    }
    if (parts[3] === 'search') {
      const qp = new URLSearchParams(search);
      return { kind: 'search', subject, version, q: qp.get('q') ?? '' };
    }
    if (parts[3] === 'glossary' && parts.length === 4) {
      return { kind: 'glossary', subject, version };
    }
  }
  return { kind: 'notfound', pathname };
}

export function navigate(path: string): void {
  history.pushState({}, '', path);
  window.dispatchEvent(new Event('cw:route'));
}

export function listenRoute(handler: (route: Route) => void): void {
  const fire = () => handler(parseRoute(location.pathname, location.search));
  window.addEventListener('popstate', fire);
  window.addEventListener('cw:route', fire);
  fire();
}
