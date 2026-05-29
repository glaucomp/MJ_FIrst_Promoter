const STALE_KEY = 'mj:referralsStale';
const PATH_KEY = 'mj:lastPath';

/** Call when chatter group membership changes (add/remove member). */
export function markReferralsStale() {
  try {
    sessionStorage.setItem(STALE_KEY, '1');
  } catch {
    // private browsing / blocked storage — ignore
  }
}

export function isReferralsStale(): boolean {
  try {
    return sessionStorage.getItem(STALE_KEY) === '1';
  } catch {
    return false;
  }
}

export function consumeReferralsStale(): boolean {
  try {
    if (sessionStorage.getItem(STALE_KEY) !== '1') return false;
    sessionStorage.removeItem(STALE_KEY);
    return true;
  } catch {
    return false;
  }
}

/** Track route changes (sessionStorage so lazy-loaded chunks share state). */
export function trackPath(pathname: string): string {
  try {
    const previous = sessionStorage.getItem(PATH_KEY) ?? '';
    sessionStorage.setItem(PATH_KEY, pathname);
    return previous;
  } catch {
    return '';
  }
}
