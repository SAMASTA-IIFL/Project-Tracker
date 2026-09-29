import { Bug, ClipboardCheck, FileSearch, ListTree, Network, ShieldCheck, SquareCheckBig, type LucideIcon } from "lucide-react";
import type { ModuleKey } from "@/components/ModuleNav";

// One semantic gradient per module, reused everywhere that module shows up
// (product overview cards, module nav). Backed by the --grad-* tokens in
// index.css so the actual color values live in one place.
export const MODULE_META: Record<ModuleKey, { icon: LucideIcon; gradient: string }> = {
  brd: { icon: FileSearch, gradient: "var(--grad-brd)" },
  planning: { icon: ListTree, gradient: "var(--grad-planning)" },
  tasks: { icon: SquareCheckBig, gradient: "var(--grad-tasks)" },
  infosec: { icon: ShieldCheck, gradient: "var(--grad-infosec)" },
  uat: { icon: ClipboardCheck, gradient: "var(--grad-uat)" },
  bugs: { icon: Bug, gradient: "var(--grad-bugs)" },
  diagrams: { icon: Network, gradient: "var(--grad-diagrams)" },
};
