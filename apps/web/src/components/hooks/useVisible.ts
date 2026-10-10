import { type RefObject, useEffect, useRef, useState } from 'react';

// One observer shared by every element (hundreds of tiles would otherwise each own one).
const visibility = new Map<Element, (visible: boolean) => void>();
let observer: IntersectionObserver | null = null;

/** A ref, and whether its element is on screen or within 200 px of it. */
export function useVisible<T extends Element>(): [RefObject<T>, boolean] {
  const ref = useRef<T>(null);
  const [vis, setVis] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    observer ??= new IntersectionObserver(
      (es) => {
        for (const e of es) visibility.get(e.target)?.(e.isIntersecting);
      },
      { rootMargin: '200px' },
    );
    visibility.set(el, setVis);
    observer.observe(el);
    return () => {
      visibility.delete(el);
      observer?.unobserve(el);
    };
  }, []);
  return [ref, vis];
}
