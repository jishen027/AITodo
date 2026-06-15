'use client';

import { RefreshCw } from 'lucide-react';
import { usePullToRefresh } from '@/hooks/usePullToRefresh';

interface PullToRefreshProps {
  onRefresh: () => void | Promise<void>;
  /** Extra classes for the scroll container (sizing, etc.). */
  className?: string;
  children: React.ReactNode;
  disabled?: boolean;
}

/**
 * Scroll container with touch pull-to-refresh. Replaces a plain
 * `overflow-y-auto` div: pass the sizing classes via `className` and the
 * scrollable content as children. The pull indicator is revealed as the user
 * drags the top of the list down, and the content shifts with it for a tactile
 * feel. No-op on desktop (touch-only gesture).
 */
export default function PullToRefresh({
  onRefresh,
  className = '',
  children,
  disabled,
}: PullToRefreshProps) {
  const { ref, pullDistance, isRefreshing, threshold } = usePullToRefresh({ onRefresh, disabled });

  const active = pullDistance > 0 || isRefreshing;
  const ready = pullDistance >= threshold;
  // Settle back / hold open with a transition; track the finger 1:1 while dragging.
  const settling = isRefreshing || pullDistance === 0;
  const offset = isRefreshing ? threshold : pullDistance;

  return (
    <div ref={ref} className={`relative overflow-y-auto ${className}`}>
      {/* Pull indicator — fills the gap revealed above the shifted content. */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-center justify-center overflow-hidden"
        style={{
          height: active ? offset : 0,
          opacity: active ? 1 : 0,
          transition: settling ? 'height 0.25s ease, opacity 0.25s ease' : 'none',
        }}
      >
        <div className="flex items-center gap-2 text-xs font-medium text-indigo-600">
          <RefreshCw
            className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`}
            style={
              isRefreshing
                ? undefined
                : { transform: `rotate(${Math.min(180, (pullDistance / threshold) * 180)}deg)` }
            }
          />
          {isRefreshing ? 'Refreshing…' : ready ? 'Release to refresh' : 'Pull to refresh'}
        </div>
      </div>

      <div
        style={{
          transform: active ? `translateY(${offset}px)` : undefined,
          transition: settling ? 'transform 0.25s ease' : 'none',
        }}
      >
        {children}
      </div>
    </div>
  );
}
