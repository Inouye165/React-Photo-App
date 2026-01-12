import { useEffect, useState } from 'react';

export default function useIntersectionObserver(
  elementRef,
  { threshold = 0, root = null, rootMargin = '0px' } = {}
) {
  const [entry, setEntry] = useState(null);

  useEffect(() => {
    const target = elementRef?.current;
    if (!target) return;

    if (typeof IntersectionObserver === 'undefined') return;

    const observer = new IntersectionObserver(
      ([nextEntry]) => {
        setEntry(nextEntry);
      },
      { threshold, root, rootMargin }
    );

    observer.observe(target);

    return () => {
      observer.disconnect();
    };
  }, [elementRef, threshold, root, rootMargin]);

  return entry?.isIntersecting;
}
