import type { ArchNodeCategory, BudgetCategory, TechStackCategory } from "@/lib/types";

// Literal, complete Tailwind class strings per key — never `bg-${x}` string
// interpolation, or Tailwind v4's scanner won't generate the class (see
// HANDOFF.md §4's design-system gotcha). Same pattern as infosecMeta.ts/taskMeta.ts.
export const TECH_STACK_CATEGORY_META: Record<TechStackCategory, { badge: string }> = {
  FRONTEND: { badge: "bg-blue-500/20 text-blue-400 border-blue-500/40" },
  BACKEND: { badge: "bg-purple-500/20 text-purple-400 border-purple-500/40" },
  DATABASE: { badge: "bg-emerald-500/20 text-emerald-400 border-emerald-500/40" },
  AI_MODEL: { badge: "bg-pink-500/20 text-pink-400 border-pink-500/40" },
  INFRA_DEVOPS: { badge: "bg-amber-500/20 text-amber-400 border-amber-500/40" },
  DEPENDENCY: { badge: "bg-cyan-500/20 text-cyan-400 border-cyan-500/40" },
  OTHER: { badge: "bg-muted text-muted-foreground border-border" },
};

export const BUDGET_CATEGORY_META: Record<BudgetCategory, { badge: string }> = {
  LABOR: { badge: "bg-blue-500/20 text-blue-400 border-blue-500/40" },
  INFRASTRUCTURE: { badge: "bg-amber-500/20 text-amber-400 border-amber-500/40" },
  LICENSING_TOOLS: { badge: "bg-purple-500/20 text-purple-400 border-purple-500/40" },
  AI_API_USAGE: { badge: "bg-pink-500/20 text-pink-400 border-pink-500/40" },
  THIRD_PARTY_SERVICES: { badge: "bg-cyan-500/20 text-cyan-400 border-cyan-500/40" },
  CONTINGENCY: { badge: "bg-red-500/20 text-red-400 border-red-500/40" },
  OTHER: { badge: "bg-muted text-muted-foreground border-border" },
};

// Architecture board node categories: color is a second channel alongside the
// per-category icon chosen in ArchNode.tsx — never the only differentiator,
// same "shape/icon as a second visual channel" rule as Priority-vs-Stage
// badges elsewhere in this app.
export const ARCH_NODE_CATEGORY_META: Record<ArchNodeCategory, { border: string; badge: string }> = {
  CLIENT: { border: "border-l-blue-500", badge: "bg-blue-500/20 text-blue-400 border-blue-500/40" },
  API_GATEWAY: { border: "border-l-amber-500", badge: "bg-amber-500/20 text-amber-400 border-amber-500/40" },
  SERVICE: { border: "border-l-purple-500", badge: "bg-purple-500/20 text-purple-400 border-purple-500/40" },
  DATABASE: { border: "border-l-emerald-500", badge: "bg-emerald-500/20 text-emerald-400 border-emerald-500/40" },
  CACHE: { border: "border-l-orange-500", badge: "bg-orange-500/20 text-orange-400 border-orange-500/40" },
  QUEUE: { border: "border-l-teal-500", badge: "bg-teal-500/20 text-teal-400 border-teal-500/40" },
  EXTERNAL_API: { border: "border-l-slate-500", badge: "bg-slate-500/20 text-slate-400 border-slate-500/40" },
  AI_MODEL: { border: "border-l-pink-500", badge: "bg-pink-500/20 text-pink-400 border-pink-500/40" },
  STORAGE: { border: "border-l-cyan-500", badge: "bg-cyan-500/20 text-cyan-400 border-cyan-500/40" },
  CDN: { border: "border-l-indigo-500", badge: "bg-indigo-500/20 text-indigo-400 border-indigo-500/40" },
  LOAD_BALANCER: { border: "border-l-lime-600", badge: "bg-lime-500/20 text-lime-600 border-lime-500/40" },
  AUTH: { border: "border-l-red-500", badge: "bg-red-500/20 text-red-400 border-red-500/40" },
  CUSTOM: { border: "border-l-muted-foreground", badge: "bg-muted text-muted-foreground border-border" },
};
