import type { BRDStatus } from "@/lib/types";

export const BRD_STATUS_META: Record<BRDStatus, { label: string; badge: string }> = {
  DRAFT: { label: "Draft", badge: "bg-muted text-muted-foreground border-border" },
  IN_REVIEW: { label: "In review", badge: "bg-blue-500/20 text-blue-400 border-blue-500/40" },
  CHANGES_REQUESTED: { label: "Changes requested", badge: "bg-amber-500/20 text-amber-400 border-amber-500/40" },
  APPROVED: { label: "Approved", badge: "bg-emerald-500/20 text-emerald-400 border-emerald-500/40" },
};
