import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import {
  Boxes,
  Brain,
  Database,
  Globe,
  HardDrive,
  ListOrdered,
  Monitor,
  Network,
  Router,
  Scale,
  ShieldCheck,
  Square,
  Zap,
  type LucideIcon,
} from "lucide-react";
import type { ArchNodeCategory, ArchNodeData } from "@/lib/types";
import { ARCH_NODE_CATEGORY_META } from "@/lib/workspaceMeta";
import { cn } from "@/lib/utils";

const CATEGORY_ICON: Record<ArchNodeCategory, LucideIcon> = {
  CLIENT: Monitor,
  API_GATEWAY: Router,
  SERVICE: Boxes,
  DATABASE: Database,
  CACHE: Zap,
  QUEUE: ListOrdered,
  EXTERNAL_API: Globe,
  AI_MODEL: Brain,
  STORAGE: HardDrive,
  CDN: Network,
  LOAD_BALANCER: Scale,
  AUTH: ShieldCheck,
  CUSTOM: Square,
};

const handleClass = "!h-2.5 !w-2.5 !border-2 !border-background !bg-primary";

export function ArchNode({ data, selected }: NodeProps<Node<ArchNodeData>>) {
  const Icon = CATEGORY_ICON[data.category] ?? Square;
  const meta = ARCH_NODE_CATEGORY_META[data.category] ?? ARCH_NODE_CATEGORY_META.CUSTOM;

  return (
    <div
      className={cn(
        "card-glow min-w-[160px] rounded-lg border border-l-4 bg-card px-3 py-2",
        meta.border,
        selected ? "border-primary ring-2 ring-primary/40" : "border-border",
      )}
    >
      <Handle type="target" position={Position.Left} className={handleClass} />
      <Handle type="source" position={Position.Right} className={handleClass} />
      <Handle type="target" position={Position.Top} id="top-target" className={handleClass} />
      <Handle type="source" position={Position.Bottom} id="bottom-source" className={handleClass} />

      <div className="flex items-center gap-2">
        <span className={cn("flex h-6 w-6 shrink-0 items-center justify-center rounded-md border", meta.badge)}>
          <Icon className="h-3.5 w-3.5" />
        </span>
        <span className="truncate text-sm font-medium text-foreground">{data.label}</span>
      </div>
      {data.description && <p className="mt-1 truncate text-xs text-muted-foreground">{data.description}</p>}
    </div>
  );
}

export { CATEGORY_ICON };
