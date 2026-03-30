import { useState, useEffect } from 'react';

export const useMediaQuery = (query: string): boolean => {
  const [matches, setMatches] = useState(() => {
    if (typeof window !== 'undefined') {
      return window.matchMedia(query).matches;
    }
    return false;
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const media = window.matchMedia(query);
    
    const listener = () => setMatches(media.matches);

    setMatches(media.matches);

    if (typeof media.addEventListener === 'function') {
      media.addEventListener('change', listener);
      return () => media.removeEventListener('change', listener);
    }

    // Fallback for Safari < 14 and other older browsers that lack addEventListener on MediaQueryList
    // @ts-ignore -- addListener/removeListener are deprecated but intentionally used here as a fallback
    media.addListener(listener);
    // @ts-ignore
    return () => media.removeListener(listener);
  }, [query]);

  return matches;
};
