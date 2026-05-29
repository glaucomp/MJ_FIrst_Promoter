const STALE_KEY = 'mj:referralsStale';

/** Call when chatter group membership changes (add/remove member). */
export function markReferralsStale() {
  sessionStorage.setItem(STALE_KEY, '1');
}

export function consumeReferralsStale(): boolean {
  if (sessionStorage.getItem(STALE_KEY) !== '1') return false;
  sessionStorage.removeItem(STALE_KEY);
  return true;
}

let trackedPath = '';

/** Track route changes across unmount/remount so we can detect return trips. */
export function trackPath(pathname: string): string {
  const previous = trackedPath;
  trackedPath = pathname;
  return previous;
}
