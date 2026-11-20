import { useEffect, useState } from 'react';

/** P0 路由：hash 驱动，无需路由库（设计技能：禁组件库/框架依赖） */
export type Route = 'work' | 'journal' | 'knowledge' | 'settings' | 'preview';

const PATH_BY_ROUTE: Record<Route, string> = {
  work: '#/',
  journal: '#/journal',
  knowledge: '#/knowledge',
  settings: '#/settings',
  preview: '#/preview',
};

/** 导航顺序（preview 不进导航，仅设计验收用） */
export const NAV_ROUTES: Array<{ route: Route; label: string }> = [
  { route: 'work', label: '问卦' },
  { route: 'journal', label: '占验' },
  { route: 'knowledge', label: '案面' },
  { route: 'settings', label: '文房' },
];

export function parseRoute(hash: string): Route {
  const h = hash.replace(/^#\/?/, '').split('?')[0] ?? '';
  switch (h) {
    case 'journal':
      return 'journal';
    case 'knowledge':
      return 'knowledge';
    case 'settings':
      return 'settings';
    case 'preview':
      return 'preview';
    default:
      return 'work';
  }
}

export function routePath(route: Route): string {
  return PATH_BY_ROUTE[route];
}

export function useRoute(): [Route, (r: Route) => void] {
  const [route, setRoute] = useState<Route>(() =>
    typeof window === 'undefined' ? 'work' : parseRoute(window.location.hash),
  );

  useEffect(() => {
    const onHash = () => setRoute(parseRoute(window.location.hash));
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const go = (r: Route) => {
    const next = routePath(r);
    if (window.location.hash !== next) window.location.hash = next;
    setRoute(r);
  };

  return [route, go];
}
