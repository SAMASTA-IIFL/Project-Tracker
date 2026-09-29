import { useLayoutEffect, useState, type RefObject } from "react";

// Positions a segmented-control indicator under the active item. Animates
// `left`/`width` directly rather than `transform: scaleX()` — this indicator
// only snaps between a handful of discrete tab positions on click, not a
// live drag gesture, so there's no 60fps requirement forcing transform-only.
// (scaleX() also actively breaks here: a `rounded-full` pill scaled
// non-uniformly from a 1px seed warps its rounded ends into a distorted
// blob instead of a clean capsule, since border-radius is resolved before
// the transform is applied, not after.)
export function useSlidingIndicator(activeKey: string, containerRef: RefObject<HTMLElement | null>) {
  const [rect, setRect] = useState<{ left: number; width: number } | null>(null);

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    function measure() {
      const active = container!.querySelector<HTMLElement>(`[data-key="${CSS.escape(activeKey)}"]`);
      if (!active) return;
      const containerRect = container!.getBoundingClientRect();
      const activeRect = active.getBoundingClientRect();
      setRect({ left: activeRect.left - containerRect.left, width: activeRect.width });
    }

    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [activeKey, containerRef]);

  return rect;
}
