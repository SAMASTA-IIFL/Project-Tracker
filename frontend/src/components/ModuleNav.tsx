import { useRef } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  SEGMENTED_INDICATOR,
  SEGMENTED_ITEM,
  SEGMENTED_ITEM_ACTIVE,
  SEGMENTED_ITEM_INACTIVE,
  SEGMENTED_TRACK,
} from "@/lib/segmentedControl";
import { useSlidingIndicator } from "@/lib/useSlidingIndicator";

export type ModuleKey = "brd" | "planning" | "tasks" | "infosec" | "uat" | "bugs" | "diagrams";

const MODULES: { key: ModuleKey; label: string }[] = [
  { key: "brd", label: "BRD" },
  { key: "planning", label: "Planning" },
  { key: "tasks", label: "Tasks" },
  { key: "infosec", label: "Infosec" },
  { key: "uat", label: "UAT" },
  { key: "bugs", label: "Bugs" },
  { key: "diagrams", label: "Diagrams" },
];

// Every module page (BRD/Planning/Tasks/Infosec/Diagrams) renders this instead
// of a plain "back to product" link, so any module is reachable directly from
// any other one — not just via the module cards on the product overview page.
export function ModuleNav({
  productId,
  productName,
  active,
}: {
  productId: string;
  productName: string;
  active: ModuleKey;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const indicatorRect = useSlidingIndicator(active, trackRef);

  return (
    <div className="mb-6 flex flex-wrap items-center gap-x-4 gap-y-2">
      <Link
        to={`/products/${productId}`}
        className="flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        {productName}
      </Link>
      <div ref={trackRef} className={cn(SEGMENTED_TRACK, "gap-0.5 p-0.5")}>
        <span
          aria-hidden
          className={SEGMENTED_INDICATOR}
          style={{ left: indicatorRect?.left ?? 0, width: indicatorRect?.width ?? 0, opacity: indicatorRect ? 1 : 0 }}
        />
        {MODULES.map((m) => (
          <Link
            key={m.key}
            to={`/products/${productId}/${m.key}`}
            data-key={m.key}
            className={cn(SEGMENTED_ITEM, "px-2.5 py-1 text-xs", m.key === active ? SEGMENTED_ITEM_ACTIVE : SEGMENTED_ITEM_INACTIVE)}
          >
            {m.label}
          </Link>
        ))}
      </div>
    </div>
  );
}
