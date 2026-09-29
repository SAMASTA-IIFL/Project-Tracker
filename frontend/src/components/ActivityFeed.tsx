import { useState } from "react";
import { Link } from "react-router-dom";
import {
  Bug,
  Building2,
  ChevronDown,
  ClipboardCheck,
  FileSearch,
  Layers,
  Network,
  ShieldCheck,
  SquareCheckBig,
  UserPlus2,
  type LucideIcon,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { ActivityEvent } from "@/lib/types";
import { cn } from "@/lib/utils";

// Visual identity per ref_type, reusing the same module gradients as the
// overview cards so an activity row and its module read as the same thing.
// `to` is omitted for ref types with no dedicated module page (product/
// member/workspace events) — those rows just aren't links.
const REF_META: Record<string, { icon: LucideIcon; gradient: string; to?: (productId: string) => string }> = {
  BRD: { icon: FileSearch, gradient: "var(--grad-brd)", to: (id) => `/products/${id}/brd` },
  TASK: { icon: SquareCheckBig, gradient: "var(--grad-tasks)", to: (id) => `/products/${id}/tasks` },
  INFOSEC_ITEM: { icon: ShieldCheck, gradient: "var(--grad-infosec)", to: (id) => `/products/${id}/infosec` },
  INFOSEC_VAPT_REPORT: { icon: ShieldCheck, gradient: "var(--grad-infosec)", to: (id) => `/products/${id}/infosec` },
  UAT_FEEDBACK: { icon: ClipboardCheck, gradient: "var(--grad-uat)", to: (id) => `/products/${id}/uat` },
  BUG: { icon: Bug, gradient: "var(--grad-bugs)", to: (id) => `/products/${id}/bugs` },
  DIAGRAM: { icon: Network, gradient: "var(--grad-diagrams)", to: (id) => `/products/${id}/diagrams` },
  PRODUCT: { icon: Building2, gradient: "var(--grad-planning)" },
  PRODUCT_MEMBER: { icon: UserPlus2, gradient: "var(--grad-planning)" },
};
const DEFAULT_REF_META = { icon: Layers, gradient: "var(--grad-planning)" };

const EVENT_LABELS: Record<string, string> = {
  PRODUCT_CREATED: "created the product",
  MEMBER_ADDED: "added a member",
  STAGE_ADVANCED: "advanced the lifecycle stage",
  STAGE_REOPENED: "reopened the lifecycle stage",
  BRD_CREATED: "created the BRD",
  BRD_SUBMITTED: "submitted the BRD for review",
  BRD_CHANGES_REQUESTED: "requested changes on the BRD",
  BRD_APPROVED: "approved the BRD",
  BRD_NEW_VERSION: "uploaded a new BRD version",
  BRD_COMMENT_ADDED: "commented on the BRD",
  DIAGRAM_UPLOADED: "uploaded a diagram",
  DIAGRAM_NEW_VERSION: "uploaded a new diagram version",
  DIAGRAM_COMMENT_ADDED: "commented on a diagram",
  TASK_CREATED: "created a task",
  TASK_STATUS_CHANGED: "changed a task's status",
  TASK_PROGRESS_UPDATE: "updated task progress",
  INFOSEC_TEMPLATE_APPLIED: "applied the infosec checklist template",
  INFOSEC_ITEM_ADDED: "added an infosec item",
  INFOSEC_ITEM_STATUS_CHANGED: "changed an infosec item's status",
  INFOSEC_ITEM_COMMENT_ADDED: "commented on an infosec item",
  INFOSEC_VAPT_REPORT_UPLOADED: "uploaded a VAPT report",
  UAT_CYCLE_OPENED: "opened a UAT cycle",
  UAT_CYCLE_CLOSED: "closed a UAT cycle",
  UAT_FEEDBACK_ADDED: "added UAT feedback",
  UAT_FEEDBACK_RESULT_CHANGED: "changed a UAT feedback result",
  BUG_FILED_FROM_UAT: "filed a bug from UAT",
  BUG_LOGGED: "logged a bug",
  BUG_STATUS_CHANGED: "changed a bug's status",
  BUG_TRIAGED: "triaged a bug",
  BUG_COMMENTED: "commented on a bug",
  WORKSPACE_REPO_ADDED: "added a repository",
  WORKSPACE_TECH_ITEM_ADDED: "added a tech stack item",
  WORKSPACE_HOSTING_ADDED: "added a hosting environment",
  BUDGET_LINE_ITEM_ADDED: "added a budget line item",
  BOARD_VERSION_SAVED: "saved an architecture board version",
};

function describeEvent(eventType: string) {
  return EVENT_LABELS[eventType] ?? eventType.replaceAll("_", " ").toLowerCase();
}

function relativeTime(iso: string) {
  const diffSec = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (diffSec < 60) return "just now";
  const min = Math.floor(diffSec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

const COLLAPSED_COUNT = 6;

// Renders as a compact, fixed-size feed by default (a handful of rows) and
// only becomes scrollable — never taller than the page — once expanded, so
// a product with a long history doesn't push the rest of the page down.
export function ActivityFeed({ events, productId }: { events: ActivityEvent[] | null; productId: string }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <Card className="mt-6">
      <CardHeader>
        <CardTitle className="text-sm font-medium text-muted-foreground">Recent activity</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {events === null && <p className="px-5 pb-5 text-sm text-muted-foreground">Loading...</p>}
        {events?.length === 0 && <p className="px-5 pb-5 text-sm text-muted-foreground">Nothing yet.</p>}
        {events && events.length > 0 && (
          <div className={cn("divide-y divide-border overflow-y-auto rounded-b-3xl", expanded && "max-h-80")}>
            {(expanded ? events : events.slice(0, COLLAPSED_COUNT)).map((event) => {
              const meta = REF_META[event.ref_type] ?? DEFAULT_REF_META;
              const Icon = meta.icon;
              const row = (
                <div className="flex items-center gap-3 px-5 py-2.5 text-sm transition-colors hover:bg-accent/40">
                  <div
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white"
                    style={{ backgroundImage: meta.gradient }}
                  >
                    <Icon className="h-4 w-4" />
                  </div>
                  <p className="min-w-0 flex-1 truncate">
                    <span className="font-medium">{event.actor.name ?? event.actor.email}</span>{" "}
                    <span className="text-muted-foreground">{describeEvent(event.event_type)}</span>
                  </p>
                  <span
                    className="shrink-0 text-xs text-muted-foreground"
                    title={new Date(event.created_at).toLocaleString()}
                  >
                    {relativeTime(event.created_at)}
                  </span>
                </div>
              );
              const to = meta.to?.(productId);
              return to ? (
                <Link key={event.id} to={to} className="block">
                  {row}
                </Link>
              ) : (
                <div key={event.id}>{row}</div>
              );
            })}
          </div>
        )}
        {events && events.length > COLLAPSED_COUNT && (
          <div className="border-t border-border px-3 py-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="w-full gap-1 text-xs text-muted-foreground"
              onClick={() => setExpanded((v) => !v)}
            >
              {expanded ? "Show less" : `Show ${events.length - COLLAPSED_COUNT} more`}
              <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", expanded && "rotate-180")} />
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
