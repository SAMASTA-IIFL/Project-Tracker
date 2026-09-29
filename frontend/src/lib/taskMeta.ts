import type { Priority, TaskStatus } from "@/lib/types";

export const TASK_STATUS_META: Record<TaskStatus, { label: string; badge: string }> = {
  TODO: { label: "To do", badge: "bg-muted text-muted-foreground border-border" },
  IN_PROGRESS: { label: "In progress", badge: "bg-blue-500/20 text-blue-400 border-blue-500/40" },
  BLOCKED: { label: "On Hold", badge: "bg-red-500/20 text-red-400 border-red-500/40" },
  READY_FOR_TEST: { label: "Ready for test", badge: "bg-purple-500/20 text-purple-400 border-purple-500/40" },
  DONE: { label: "Done", badge: "bg-emerald-500/20 text-emerald-400 border-emerald-500/40" },
};

export const PRIORITY_META: Record<Priority, { label: string; badge: string }> = {
  LOW: { label: "Low", badge: "bg-muted text-muted-foreground border-border" },
  MEDIUM: { label: "Medium", badge: "bg-blue-500/20 text-blue-400 border-blue-500/40" },
  HIGH: { label: "High", badge: "bg-amber-500/20 text-amber-400 border-amber-500/40" },
  CRITICAL: { label: "Critical", badge: "bg-red-500/20 text-red-400 border-red-500/40" },
};
