import type { InfosecItemStatus } from "@/lib/types";

export const INFOSEC_STATUS_META: Record<InfosecItemStatus, { label: string; badge: string }> = {
  OPEN: { label: "Open", badge: "bg-red-500/20 text-red-400 border-red-500/40" },
  IN_PROGRESS: { label: "In progress", badge: "bg-blue-500/20 text-blue-400 border-blue-500/40" },
  RESOLVED: { label: "Resolved", badge: "bg-amber-500/20 text-amber-400 border-amber-500/40" },
  VERIFIED: { label: "Verified", badge: "bg-emerald-500/20 text-emerald-400 border-emerald-500/40" },
};
