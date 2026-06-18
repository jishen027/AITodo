'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { gsap } from 'gsap';

// A small, dependency-free sortable with a "lift" interaction:
//   • the dragged row detaches and floats under the cursor (position: fixed),
//   • an empty slot/placeholder marks where it will drop, reflowing as you move,
//   • on release the floating row animates into the slot and is committed.
// Pointer events unify mouse + touch + pen, so it works on desktop and mobile
// alike (native HTML5 drag-and-drop never fires on touch).
//
//   ids      — current id order from the source of truth (re-synced whenever it
//              changes and we're not mid-drag: AI updates, adds, deletes…)
//   onReorder(orderedIds) — called once, only when the order actually changed.
export function useDragReorder(ids: string[], onReorder: (orderedIds: string[]) => void) {
  const [order, setOrder] = useState<string[]>(ids);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  // Size of the lifted row, used to size the floating clone + the slot it leaves.
  const [dragSize, setDragSize] = useState<{ w: number; h: number } | null>(null);

  const orderRef = useRef(order);
  orderRef.current = order;
  const draggingRef = useRef<string | null>(null);
  const movedRef = useRef(false);
  const itemEls = useRef(new Map<string, HTMLElement>());
  const placeholderRef = useRef<HTMLDivElement | null>(null);
  // Pointer position + the grab offset within the row, so the float tracks the
  // cursor from the exact point it was picked up.
  const pointerRef = useRef({ x: 0, y: 0 });
  const offsetRef = useRef({ x: 0, y: 0 });
  // Suppress the click that the browser fires after a drag, so releasing a task
  // doesn't also open its details panel.
  const suppressClickRef = useRef(false);
  // The id whose inline transform must be cleared once the drag fully ends.
  const cleanupIdRef = useRef<string | null>(null);
  const animatingRef = useRef(false);

  // Re-sync with the external list whenever it changes and we're not mid-drag.
  const idsKey = ids.join('|');
  useEffect(() => {
    if (draggingRef.current) return;
    setOrder((prev) => (prev.join('|') === idsKey ? prev : ids));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey]);

  const setItemRef = useCallback(
    (id: string) => (el: HTMLElement | null) => {
      if (el) itemEls.current.set(id, el);
      else itemEls.current.delete(id);
    },
    []
  );

  // Position the float at the cursor (GPU transform, set imperatively so dragging
  // doesn't re-render on every pointer move).
  const positionFloat = useCallback((clientX: number, clientY: number) => {
    const el = itemEls.current.get(draggingRef.current ?? '');
    if (el) gsap.set(el, { x: clientX - offsetRef.current.x, y: clientY - offsetRef.current.y });
  }, []);

  // Lift animation + initial placement, run before paint so there's no flash at
  // the top-left corner. On drag end, clear the leftover transform so the settled
  // row sits at its natural position.
  useLayoutEffect(() => {
    if (!draggingId) {
      if (cleanupIdRef.current) {
        const el = itemEls.current.get(cleanupIdRef.current);
        if (el) gsap.set(el, { clearProps: 'all' });
        cleanupIdRef.current = null;
      }
      return;
    }
    cleanupIdRef.current = draggingId;
    const el = itemEls.current.get(draggingId);
    if (!el) return;
    positionFloat(pointerRef.current.x, pointerRef.current.y);
    gsap.fromTo(
      el,
      { scale: 1, rotation: 0 },
      { scale: 1.03, rotation: 1.5, duration: 0.16, ease: 'power2.out' }
    );
  }, [draggingId, positionFloat]);

  // Recompute the order from the pointer's Y: the dragged id is inserted before
  // the first other row whose vertical midpoint sits below the pointer. Measuring
  // only the *other* rows (the float is out of flow) keeps it stable.
  const computeOrder = useCallback((clientY: number) => {
    const dragId = draggingRef.current;
    if (!dragId) return;
    const cur = orderRef.current;
    const others = cur.filter((id) => id !== dragId);

    let target = others.length;
    for (let i = 0; i < others.length; i++) {
      const el = itemEls.current.get(others[i]);
      if (!el) continue;
      const rect = el.getBoundingClientRect();
      if (clientY < rect.top + rect.height / 2) {
        target = i;
        break;
      }
    }

    const next = [...others];
    next.splice(target, 0, dragId);
    if (next.join('|') !== cur.join('|')) {
      movedRef.current = true;
      setOrder(next);
    }
  }, []);

  const startDrag = useCallback(
    (id: string, e: React.PointerEvent) => {
      if (e.button !== 0 || animatingRef.current) return;
      const row = itemEls.current.get(id);
      if (!row) return;
      e.preventDefault();
      e.stopPropagation();

      // Capture the pointer so mobile browsers keep delivering pointermove for
      // the whole drag instead of treating the touch as a scroll (which fires
      // pointercancel and kills tracking). Capture on the HANDLE — not on `row`
      // — because `row` lifts to `position: fixed` the moment the drag starts,
      // and iOS Safari drops capture (firing pointercancel) when the *captured*
      // element's layout changes. The handle itself never moves, so the capture
      // holds; captured events still bubble to the window listeners below.
      const handle = e.currentTarget as HTMLElement;
      const pointerId = e.pointerId;
      try { handle.setPointerCapture(pointerId); } catch (_) { /* unsupported */ }

      const rect = row.getBoundingClientRect();
      offsetRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      pointerRef.current = { x: e.clientX, y: e.clientY };
      movedRef.current = false;
      draggingRef.current = id;
      // Lift the row to `position: fixed` *now*, imperatively, instead of waiting
      // for React to re-render it via `floatStyle`. On touch the first
      // pointermove can fire before that re-render commits; positioning a row
      // that's still in flow then makes it jump by its own offset — the "first
      // drag moves too far, then corrects after wiggling" bug. Setting it here
      // guarantees the float is already out of flow at 0,0 (and placed under the
      // finger) before the first move arrives. React's `floatStyle` then applies
      // the identical values on commit, so there's no conflict.
      gsap.set(row, {
        position: 'fixed', top: 0, left: 0, width: rect.width,
        margin: 0, zIndex: 50, pointerEvents: 'none',
      });
      positionFloat(e.clientX, e.clientY);
      setDragSize({ w: rect.width, h: rect.height });
      setDraggingId(id);
      document.body.style.userSelect = 'none';

      const move = (ev: PointerEvent) => {
        pointerRef.current = { x: ev.clientX, y: ev.clientY };
        positionFloat(ev.clientX, ev.clientY);
        computeOrder(ev.clientY);
      };

      const finish = () => {
        document.body.style.userSelect = '';
        const dragId = draggingRef.current;
        draggingRef.current = null;
        if (dragId && movedRef.current) {
          suppressClickRef.current = true;
          setTimeout(() => { suppressClickRef.current = false; }, 0);
        }
        const commit = () => {
          animatingRef.current = false;
          setDraggingId(null);
          setDragSize(null);
          if (dragId && movedRef.current) onReorder(orderRef.current);
          movedRef.current = false;
        };

        // Animate the float into the waiting slot, then commit.
        const floatEl = dragId ? itemEls.current.get(dragId) : null;
        const slot = placeholderRef.current;
        if (floatEl && slot && movedRef.current) {
          const r = slot.getBoundingClientRect();
          animatingRef.current = true;
          gsap.to(floatEl, {
            x: r.left, y: r.top, scale: 1, rotation: 0,
            duration: 0.18, ease: 'power3.out', onComplete: commit,
          });
        } else {
          commit();
        }
      };

      const up = () => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        window.removeEventListener('pointercancel', up);
        try { handle.releasePointerCapture(pointerId); } catch (_) { /* already released */ }
        finish();
      };

      // Listen on window: with capture active the events still bubble here, and
      // if capture is unavailable this is the reliable fallback.
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
      window.addEventListener('pointercancel', up);
    },
    [computeOrder, positionFloat, onReorder]
  );

  // Props for the drag handle. `touch-action: none` stops a touch-drag on the
  // handle from scrolling the list (the rest of the row still scrolls).
  const dragHandleProps = useCallback(
    (id: string) => ({
      onPointerDown: (e: React.PointerEvent) => startDrag(id, e),
      onClick: (e: React.MouseEvent) => e.stopPropagation(),
      style: { touchAction: 'none' as const },
      // Marks this as a reorder grip so a surrounding pull-to-refresh ignores
      // the gesture (its translateY would otherwise become the containing block
      // for the dragged row's position:fixed float and skew the tracking).
      'data-drag-handle': '',
    }),
    [startDrag]
  );

  // Inline style for the dragged row while it's floating under the cursor.
  const floatStyle = useCallback(
    (id: string): React.CSSProperties | undefined =>
      draggingId === id && dragSize
        ? {
            position: 'fixed',
            top: 0,
            left: 0,
            width: dragSize.w,
            margin: 0,
            zIndex: 50,
            pointerEvents: 'none',
            cursor: 'grabbing',
          }
        : undefined,
    [draggingId, dragSize]
  );

  // True (and self-clearing) for the single click fired right after a drag.
  const shouldIgnoreClick = useCallback(() => {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return true;
    }
    return false;
  }, []);

  return {
    order,
    draggingId,
    dragSize,
    setItemRef,
    placeholderRef,
    dragHandleProps,
    floatStyle,
    shouldIgnoreClick,
  };
}
