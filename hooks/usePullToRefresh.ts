'use client';

import { useEffect, useRef, useState } from 'react';

interface PullToRefreshOptions {
  onRefresh: () => void | Promise<void>;
  /** Pull distance (px) required to trigger a refresh. */
  threshold?: number;
  /** Max visual pull distance (px); the drag is dampened past this. */
  maxPull?: number;
  /** Skip wiring the gesture entirely (e.g. when already loading). */
  disabled?: boolean;
}

/**
 * Touch pull-to-refresh for a scrollable element. Attach the returned `ref` to
 * the scroll container (the element with `overflow-y-auto`). The gesture only
 * engages when the container is scrolled to the very top, so it never fights
 * with normal scrolling. `pullDistance` (px) and `isRefreshing` drive the
 * visual indicator — render one with these values (see `PullToRefresh`).
 *
 * Touch-only by design: desktop pointers never fire these events, so there is
 * no need to gate it by breakpoint.
 */
export function usePullToRefresh<T extends HTMLElement = HTMLDivElement>({
  onRefresh,
  threshold = 70,
  maxPull = 110,
  disabled = false,
}: PullToRefreshOptions) {
  const ref = useRef<T>(null);
  const [pullDistance, setPullDistance] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Mutable copies the native listeners read without forcing a re-subscribe.
  const onRefreshRef = useRef(onRefresh);
  onRefreshRef.current = onRefresh;
  const refreshingRef = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || disabled) return;

    let startY = 0;
    let pulling = false;
    let distance = 0;

    const reset = () => {
      pulling = false;
      distance = 0;
      setPullDistance(0);
    };

    const onTouchStart = (e: TouchEvent) => {
      // Arm only at the very top, for single-finger drags, and not mid-refresh.
      if (refreshingRef.current || el.scrollTop > 0 || e.touches.length !== 1) return;
      // Don't arm when the gesture began on a drag-to-reorder grip: pulling would
      // translateY this container, making it the containing block for the dragged
      // row's position:fixed float so it overshoots the finger on a downward drag.
      if ((e.target as Element | null)?.closest?.('[data-drag-handle]')) return;
      startY = e.touches[0].clientY;
      pulling = true;
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!pulling) return;
      const dy = e.touches[0].clientY - startY;
      // An upward drag, or content that has since scrolled, cancels the pull.
      if (dy <= 0 || el.scrollTop > 0) {
        reset();
        return;
      }
      // Rubber-band: halve the raw drag and cap it so the pull eases off.
      distance = Math.min(maxPull, dy * 0.5);
      setPullDistance(distance);
      // Own the gesture — suppress the browser's overscroll/scroll.
      if (e.cancelable) e.preventDefault();
    };

    const onTouchEnd = () => {
      if (!pulling) return;
      pulling = false;
      if (distance >= threshold) {
        refreshingRef.current = true;
        setIsRefreshing(true);
        setPullDistance(threshold);
        Promise.resolve(onRefreshRef.current()).finally(() => {
          refreshingRef.current = false;
          setIsRefreshing(false);
          setPullDistance(0);
        });
      } else {
        setPullDistance(0);
      }
      distance = 0;
    };

    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    el.addEventListener('touchend', onTouchEnd);
    el.addEventListener('touchcancel', onTouchEnd);
    return () => {
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', onTouchEnd);
      el.removeEventListener('touchcancel', onTouchEnd);
    };
  }, [threshold, maxPull, disabled]);

  return { ref, pullDistance, isRefreshing, threshold };
}
