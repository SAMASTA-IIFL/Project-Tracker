import type { BugStatus, UATResult } from "@/lib/types";

export const UAT_RESULT_META: Record<UATResult, { label: string; badge: string }> = {
  PENDING: { label: "Pending", badge: "bg-slate-500/20 text-slate-400 border-slate-500/40" },
  PASS: { label: "Pass", badge: "bg-emerald-500/20 text-emerald-400 border-emerald-500/40" },
  FAIL: { label: "Fail", badge: "bg-red-500/20 text-red-400 border-red-500/40" },
  COMMENT: { label: "Comment", badge: "bg-blue-500/20 text-blue-400 border-blue-500/40" },
};

export const BUG_STATUS_META: Record<BugStatus, { label: string; badge: string }> = {
  OPEN: { label: "Open", badge: "bg-red-500/20 text-red-400 border-red-500/40" },
  IN_PROGRESS: { label: "In progress", badge: "bg-blue-500/20 text-blue-400 border-blue-500/40" },
  FIXED: { label: "Fixed", badge: "bg-amber-500/20 text-amber-400 border-amber-500/40" },
  VERIFIED: { label: "Verified", badge: "bg-emerald-500/20 text-emerald-400 border-emerald-500/40" },
  CLOSED: { label: "Closed", badge: "bg-slate-500/20 text-slate-400 border-slate-500/40" },
  REOPENED: { label: "Reopened", badge: "bg-red-500/20 text-red-400 border-red-500/40" },
};
