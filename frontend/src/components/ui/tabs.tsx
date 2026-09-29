import { useRef } from "react";
import { cn } from "@/lib/utils";
import {
  SEGMENTED_INDICATOR,
  SEGMENTED_ITEM,
  SEGMENTED_ITEM_ACTIVE,
  SEGMENTED_ITEM_INACTIVE,
  SEGMENTED_TRACK,
} from "@/lib/segmentedControl";
import { useSlidingIndicator } from "@/lib/useSlidingIndicator";

export function Tabs<T extends string>({
  tabs,
  active,
  onChange,
}: {
  tabs: { key: T; label: string }[];
  active: T;
  onChange: (key: T) => void;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const indicatorRect = useSlidingIndicator(active, trackRef);

  return (
    <div ref={trackRef} className={SEGMENTED_TRACK}>
      <span
        aria-hidden
        className={SEGMENTED_INDICATOR}
        style={{ left: indicatorRect?.left ?? 0, width: indicatorRect?.width ?? 0, opacity: indicatorRect ? 1 : 0 }}
      />
      {tabs.map((t) => (
        <button
          key={t.key}
          type="button"
          data-key={t.key}
          onClick={() => onChange(t.key)}
          className={cn(SEGMENTED_ITEM, "px-3 py-1.5 text-sm", t.key === active ? SEGMENTED_ITEM_ACTIVE : SEGMENTED_ITEM_INACTIVE)}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
