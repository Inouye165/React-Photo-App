import { useEffect, useState, type RefObject } from 'react';

export default function useIntersectionObserver<T extends Element>(
  elementRef: RefObject<T | null> | null,
  options: IntersectionObserverInit = {}
): boolean | undefined {
  const { threshold = 0, root = null, rootMargin = '0px' } = options;
  const [entry, setEntry] = useState<IntersectionObserverEntry | null>(null);

  useEffect(() => {
    const target = elementRef?.current;
    if (!target) return;

    if (typeof IntersectionObserver === 'undefined') return;

    const observer = new IntersectionObserver(
      ([nextEntry]) => setEntry(nextEntry),
      { threshold, root, rootMargin }
    );

    observer.observe(target);

    return () => {
      observer.disconnect();
    };
  }, [elementRef, threshold, root, rootMargin]);

  return entry?.isIntersecting;
}