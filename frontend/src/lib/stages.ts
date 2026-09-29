import {
  Bug,
  ClipboardCheck,
  FileSearch,
  Hammer,
  Inbox,
  ListTree,
  MessageSquareText,
  Rocket,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";
import { STAGES, type LifecycleStage, type StageTaskStatus, type Task } from "@/lib/types";

type StageMeta = {
  icon: LucideIcon;
  /** tinted chip: subtle bg + colored text + colored border */
  badge: string;
  /** solid fill used for timeline nodes (done/current) */
  solid: string;
  /** focus-ring color for the current node */
  ring: string;
  /** two-stop conic-gradient color list, for the current-stage gradient ring
   * in LifecycleTimeline — literal colors, since a per-stage dynamic
   * conic-gradient can't be built from a single CSS custom property. */
  gradient: [string, string];
};

export const STAGE_META: Record<LifecycleStage, StageMeta> = {
  INTAKE: {
    icon: Inbox,
    badge: "bg-stage-intake/15 text-stage-intake border-stage-intake/40",
    solid: "bg-stage-intake border-stage-intake",
    ring: "ring-stage-intake/30",
    gradient: ["#22d3ee", "#0ea5e9"],
  },
  BRD_REVIEW: {
    icon: FileSearch,
    badge: "bg-stage-brd-review/15 text-stage-brd-review border-stage-brd-review/40",
    solid: "bg-stage-brd-review border-stage-brd-review",
    ring: "ring-stage-brd-review/30",
    gradient: ["#38bdf8", "#6366f1"],
  },
  PLANNING: {
    icon: ListTree,
    badge: "bg-stage-planning/15 text-stage-planning border-stage-planning/40",
    solid: "bg-stage-planning border-stage-planning",
    ring: "ring-stage-planning/30",
    gradient: ["#818cf8", "#a855f7"],
  },
  DEVELOPMENT: {
    icon: Hammer,
    badge: "bg-stage-development/15 text-stage-development border-stage-development/40",
    solid: "bg-stage-development border-stage-development",
    ring: "ring-stage-development/30",
    gradient: ["#e879f9", "#ec4899"],
  },
  INFOSEC: {
    icon: ShieldCheck,
    badge: "bg-stage-infosec/15 text-stage-infosec border-stage-infosec/40",
    solid: "bg-stage-infosec border-stage-infosec",
    ring: "ring-stage-infosec/30",
    gradient: ["#fb7185", "#ef4444"],
  },
  UAT: {
    icon: ClipboardCheck,
    badge: "bg-stage-uat/15 text-stage-uat border-stage-uat/40",
    solid: "bg-stage-uat border-stage-uat",
    ring: "ring-stage-uat/30",
    gradient: ["#fbbf24", "#f59e0b"],
  },
  BUG_FIX: {
    icon: Bug,
    badge: "bg-stage-bug-fix/15 text-stage-bug-fix border-stage-bug-fix/40",
    solid: "bg-stage-bug-fix border-stage-bug-fix",
    ring: "ring-stage-bug-fix/30",
    gradient: ["#fb923c", "#ef4444"],
  },
  RELEASE: {
    icon: Rocket,
    badge: "bg-stage-release/15 text-stage-release border-stage-release/40",
    solid: "bg-stage-release border-stage-release",
    ring: "ring-stage-release/30",
    gradient: ["#4ade80", "#16a34a"],
  },
  POST_PRODUCTION: {
    icon: MessageSquareText,
    badge: "bg-stage-post-production/15 text-stage-post-production border-stage-post-production/40",
    solid: "bg-stage-post-production border-stage-post-production",
    ring: "ring-stage-post-production/30",
    gradient: ["#facc15", "#eab308"],
  },
};

// Per-stage rollup of its tasks — "complete" only when the stage has at least
// one task and every one of them is Done. Drives the "done ahead of current,
// but flagged" asterisk in LifecycleTimeline when an earlier stage reopens.
export function computeStageTaskStatus(tasks: Task[]): Record<LifecycleStage, StageTaskStatus> {
  const result = {} as Record<LifecycleStage, StageTaskStatus>;
  for (const stage of STAGES) {
    const stageTasks = tasks.filter((t) => t.stage === stage.key);
    if (stageTasks.length === 0) {
      result[stage.key] = "none";
    } else if (stageTasks.every((t) => t.status === "DONE")) {
      result[stage.key] = "complete";
    } else {
      result[stage.key] = "pending";
    }
  }
  return result;
}
