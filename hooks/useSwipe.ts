'use client';

import { useRef } from 'react';

interface SwipeOptions {
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  /** Minimum horizontal distance (px) for the gesture to count. */
  threshold?: number;
  /**
   * When set, a right swipe only fires if it started within `edgeSize` px of the
   * left screen edge. Lets us reserve the edge-swipe gesture for opening the nav
   * without hijacking ordinary horizontal drags inside the content.
   */
  edgeSwipeRight?: boolean;
  edgeSize?: number;
}

/**
 * Lightweight touch-swipe detector. Returns `onTouchStart` / `onTouchEnd`
 * handlers to spread onto an element. Ignores gestures that are mostly vertical
 * (so it doesn't fight with scrolling).
 */
export function useSwipe({
  onSwipeLeft,
  onSwipeRight,
  threshold = 60,
  edgeSwipeRight = false,
  edgeSize = 32,
}: SwipeOptions) {
  const startX = useRef(0);
  const startY = useRef(0);
  const tracking = useRef(false);

  const onTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0];
    startX.current = t.clientX;
    startY.current = t.clientY;
    tracking.current = true;
  };

  const onTouchEnd = (e: React.TouchEvent) => {
    if (!tracking.current) return;
    tracking.current = false;
    const t = e.changedTouches[0];
    const dx = t.clientX - startX.current;
    const dy = t.clientY - startY.current;

    // Mostly vertical or too short — treat as a scroll, not a swipe.
    if (Math.abs(dx) < threshold || Math.abs(dy) > Math.abs(dx)) return;

    if (dx > 0) {
      if (edgeSwipeRight && startX.current > edgeSize) return;
      onSwipeRight?.();
    } else {
      onSwipeLeft?.();
    }
  };

  return { onTouchStart, onTouchEnd };
}
