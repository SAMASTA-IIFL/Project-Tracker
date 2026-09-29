import type { BugSeverity, BugSource } from "@/lib/types";

export { BUG_STATUS_META } from "@/lib/uatMeta";

export const BUG_SEVERITY_META: Record<BugSeverity, { label: string; badge: string }> = {
  LOW: { label: "Low", badge: "bg-slate-500/20 text-slate-400 border-slate-500/40" },
  MEDIUM: { label: "Medium", badge: "bg-blue-500/20 text-blue-400 border-blue-500/40" },
  HIGH: { label: "High", badge: "bg-amber-500/20 text-amber-400 border-amber-500/40" },
  CRITICAL: { label: "Critical", badge: "bg-red-500/20 text-red-400 border-red-500/40" },
};

export const BUG_SOURCE_META: Record<BugSource, { label: string; badge: string }> = {
  UAT: { label: "UAT", badge: "bg-purple-500/20 text-purple-400 border-purple-500/40" },
  INTERNAL: { label: "Internal", badge: "bg-slate-500/20 text-slate-400 border-slate-500/40" },
  POST_PRODUCTION: { label: "Post-production", badge: "bg-teal-500/20 text-teal-400 border-teal-500/40" },
};
