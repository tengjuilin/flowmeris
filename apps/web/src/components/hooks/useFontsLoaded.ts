import { useEffect, useState } from 'react';

/**
 * A count that goes up whenever the page finishes loading fonts. Text measured before a figure font
 * arrived was measured in a fallback font: a component that measures text calls this to measure again.
 */
export function useFontsLoaded(): number {
  const [n, setN] = useState(0);
  useEffect(() => {
    const fonts = document.fonts;
    if (!fonts) return;
    const bump = () => setN((x) => x + 1);
    fonts.addEventListener('loadingdone', bump);
    return () => fonts.removeEventListener('loadingdone', bump);
  }, []);
  return n;
}
