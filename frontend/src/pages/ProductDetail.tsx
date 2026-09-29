import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowRight, ChevronRight, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { currentRole } from "@/lib/roles";
import {
  STAGES,
  type ActivityEvent,
  type ArchitectureDiagram,
  type BRD,
  type BugReport,
  type InfosecChecklistItem,
  type ProductDetail,
  type ProductMember,
  type ProductRole,
  type Task,
  type UATCycle,
} from "@/lib/types";
import { BRD_STATUS_META } from "@/lib/brdStatus";
import { TASK_STATUS_META } from "@/lib/taskMeta";
import { UAT_RESULT_META, BUG_STATUS_META } from "@/lib/uatMeta";
import { computeStageTaskStatus } from "@/lib/stages";
import { MODULE_META } from "@/lib/moduleMeta";
import type { ModuleKey } from "@/components/ModuleNav";
import { AppShell } from "@/components/AppShell";
import { ActivityFeed } from "@/components/ActivityFeed";
import { LifecycleTimeline } from "@/components/LifecycleTimeline";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { cn } from "@/lib/utils";

export function ProductDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const [product, setProduct] = useState<ProductDetail | null>(null);
  const [activity, setActivity] = useState<ActivityEvent[] | null>(null);
  const [brds, setBrds] = useState<BRD[] | null>(null);
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [diagrams, setDiagrams] = useState<ArchitectureDiagram[] | null>(null);
  const [infosecItems, setInfosecItems] = useState<InfosecChecklistItem[] | null>(null);
  const [uatCycles, setUatCycles] = useState<UATCycle[] | null>(null);
  const [bugs, setBugs] = useState<BugReport[] | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!id) return;
    api
      .get<ProductDetail>(`/api/products/${id}`)
      .then(setProduct)
      .catch(() => setNotFound(true));
    api.get<ActivityEvent[]>(`/api/products/${id}/activity`).then(setActivity);
    api.get<BRD[]>(`/api/products/${id}/brd`).then(setBrds);
    api.get<Task[]>(`/api/products/${id}/tasks`).then(setTasks);
    api.get<ArchitectureDiagram[]>(`/api/products/${id}/diagrams`).then(setDiagrams);
    api.get<InfosecChecklistItem[]>(`/api/products/${id}/infosec/items`).then(setInfosecItems);
    api.get<UATCycle[]>(`/api/products/${id}/uat/cycles`).then(setUatCycles);
    api.get<BugReport[]>(`/api/products/${id}/bugs`).then(setBugs);
  }, [id]);

  if (notFound) {
    return (
      <AppShell>
        <div className="mx-auto max-w-5xl px-4 py-10">
          <p className="text-sm text-muted-foreground">Product not found.</p>
        </div>
      </AppShell>
    );
  }

  if (!product) {
    return (
      <AppShell>
        <div className="mx-auto max-w-5xl px-4 py-10">
          <p className="text-sm text-muted-foreground">Loading...</p>
        </div>
      </AppShell>
    );
  }

  const isPM = currentRole(product, user?.id) === "PM";
  const teamMembers = product.members.filter((m) => m.role === "PM" || m.role === "DELIVERY");
  const stakeholders = product.members.filter((m) => m.role === "STAKEHOLDER");

  const currentIndex = STAGES.findIndex((s) => s.key === product.current_stage);
  const nextStage = currentIndex >= 0 && currentIndex < STAGES.length - 1 ? STAGES[currentIndex + 1] : null;
  const stageTaskStatus = computeStageTaskStatus(tasks ?? []);

  async function advanceStage() {
    if (!id) return;
    try {
      const updated = await api.post<ProductDetail>(`/api/products/${id}/advance-stage`);
      setProduct((prev) => (prev ? { ...prev, current_stage: updated.current_stage } : prev));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not advance stage");
    }
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-5xl px-4 py-10">
        <div className="mb-6">
          <h1 className="text-title-3">{product.name}</h1>
          <p className="text-sm text-muted-foreground">{product.description}</p>
        </div>

        <Card className="mb-6">
          <CardHeader className="flex-row items-center justify-between gap-2 space-y-0">
            <CardTitle className="text-sm font-medium text-muted-foreground">Lifecycle stage</CardTitle>
            {isPM && nextStage && (
              <Button type="button" variant="outline" size="sm" className="gap-1" onClick={advanceStage}>
                Advance to {nextStage.label}
                <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            )}
          </CardHeader>
          <CardContent>
            <LifecycleTimeline currentStage={product.current_stage} stageTaskStatus={stageTaskStatus} />
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:col-span-2 lg:self-start">
            <BRDModuleCard brds={brds} productId={id!} />
            <PlanningModuleCard brds={brds} tasks={tasks} productId={id!} />
            <TasksModuleCard tasks={tasks} productId={id!} />
            <InfosecModuleCard items={infosecItems} productId={id!} />
            <UatModuleCard cycles={uatCycles} productId={id!} />
            <BugsModuleCard bugs={bugs} productId={id!} />
            <DiagramsModuleCard diagrams={diagrams} productId={id!} />
          </div>

          <div className="flex flex-col gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium text-muted-foreground">Team</CardTitle>
                <CardDescription>Product managers and delivery — the people building it.</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                {teamMembers.length === 0 && <p className="text-sm text-muted-foreground">No team members yet.</p>}
                {teamMembers.map((member) => (
                  <div key={member.id} className="flex items-center justify-between text-sm">
                    <span>{member.user.name ?? member.user.email}</span>
                    <span className="text-xs text-muted-foreground">{member.role}</span>
                  </div>
                ))}
                {isPM && (
                  <AddMemberForm
                    productId={id!}
                    roles={["PM", "DELIVERY"]}
                    defaultRole="DELIVERY"
                    buttonLabel="Add team member"
                    onAdded={(m) => setProduct((prev) => (prev ? { ...prev, members: [...prev.members, m] } : prev))}
                  />
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium text-muted-foreground">Stakeholders</CardTitle>
                <CardDescription>Requesters, reviewers, and UAT testers from the business side.</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                {stakeholders.length === 0 && <p className="text-sm text-muted-foreground">No stakeholders yet.</p>}
                {stakeholders.map((member) => (
                  <div key={member.id} className="flex items-center justify-between text-sm">
                    <span>{member.user.name ?? member.user.email}</span>
                    <span className="text-xs text-muted-foreground">{member.role}</span>
                  </div>
                ))}
                {isPM && (
                  <AddMemberForm
                    productId={id!}
                    roles={["STAKEHOLDER"]}
                    defaultRole="STAKEHOLDER"
                    buttonLabel="Add stakeholder"
                    onAdded={(m) => setProduct((prev) => (prev ? { ...prev, members: [...prev.members, m] } : prev))}
                  />
                )}
              </CardContent>
            </Card>
          </div>
        </div>

        <ActivityFeed events={activity} productId={id!} />
      </div>
    </AppShell>
  );
}

const ROLE_LABELS: Record<ProductRole, string> = {
  PM: "Product Manager",
  STAKEHOLDER: "Stakeholder",
  DELIVERY: "Delivery",
};

function AddMemberForm({
  productId,
  roles,
  defaultRole,
  buttonLabel,
  onAdded,
}: {
  productId: string;
  roles: ProductRole[];
  defaultRole: ProductRole;
  buttonLabel: string;
  onAdded: (member: ProductMember) => void;
}) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<ProductRole>(defaultRole);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const member = await api.post<ProductMember>(`/api/products/${productId}/members`, { email, role });
      onAdded(member);
      setEmail("");
      setOpen(false);
      toast.success("Member added");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not add member");
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <Button type="button" variant="outline" size="sm" className="mt-1 gap-1.5 self-start" onClick={() => setOpen(true)}>
        <UserPlus className="h-3.5 w-3.5" />
        {buttonLabel}
      </Button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-2 border-t border-border pt-3">
      <Input type="email" placeholder="teammate@example.com" required value={email} onChange={(e) => setEmail(e.target.value)} />
      {roles.length > 1 && (
        <Select value={role} onChange={(e) => setRole(e.target.value as ProductRole)}>
          {roles.map((r) => (
            <option key={r} value={r}>
              {ROLE_LABELS[r]}
            </option>
          ))}
        </Select>
      )}
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={busy}>
          Add
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

function ModuleCard({
  moduleKey,
  title,
  description,
  to,
  loading,
  right,
}: {
  moduleKey: ModuleKey;
  title: string;
  description: string;
  to: string;
  loading: boolean;
  right?: ReactNode;
}) {
  const meta = MODULE_META[moduleKey];
  const Icon = meta.icon;
  return (
    <Link to={to} className="block h-full">
      <Card className="flex h-full flex-col transition-colors hover:bg-card/70">
        <CardHeader className="flex-1 gap-3">
          <div className="flex items-start justify-between gap-2">
            <div
              className="flex h-10 w-10 items-center justify-center rounded-2xl text-white"
              style={{ backgroundImage: meta.gradient }}
            >
              <Icon className="h-5 w-5" />
            </div>
            <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
          </div>
          <div className="flex flex-col gap-1">
            <CardTitle className="text-sm">{title}</CardTitle>
            <CardDescription className="line-clamp-2">{description}</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="min-h-6 text-muted-foreground">{!loading && right}</div>
        </CardContent>
      </Card>
    </Link>
  );
}

function BRDModuleCard({ brds, productId }: { brds: BRD[] | null; productId: string }) {
  const latest = brds && brds.length > 0 ? brds.reduce((a, b) => (a.version > b.version ? a : b)) : null;
  return (
    <ModuleCard
      moduleKey="brd"
      title="BRD"
      description="Author, review, and approve the business requirements document."
      to={`/products/${productId}/brd`}
      loading={brds === null}
      right={
        latest ? (
          <span className={cn("rounded-full border px-2.5 py-1 text-xs font-medium", BRD_STATUS_META[latest.status].badge)}>
            {BRD_STATUS_META[latest.status].label} · v{latest.version}
          </span>
        ) : (
          <span className="text-xs">No BRD yet</span>
        )
      }
    />
  );
}

function PlanningModuleCard({
  brds,
  tasks,
  productId,
}: {
  brds: BRD[] | null;
  tasks: Task[] | null;
  productId: string;
}) {
  const latest = brds && brds.length > 0 ? brds.reduce((a, b) => (a.version > b.version ? a : b)) : null;
  const approved = latest?.status === "APPROVED";
  const plannedCount = tasks?.filter((t) => t.brd_section).length ?? 0;
  return (
    <ModuleCard
      moduleKey="planning"
      title="Planning"
      description="Break the approved BRD into tasks, section by section."
      to={`/products/${productId}/planning`}
      loading={brds === null || tasks === null}
      right={
        !approved ? (
          <span className="text-xs">Awaiting BRD approval</span>
        ) : plannedCount > 0 ? (
          <span className="rounded-full border px-2.5 py-1 text-xs font-medium">{plannedCount} planned</span>
        ) : (
          <span className="text-xs">Ready to plan</span>
        )
      }
    />
  );
}

function TasksModuleCard({ tasks, productId }: { tasks: Task[] | null; productId: string }) {
  const done = tasks?.filter((t) => t.status === "DONE").length ?? 0;
  const total = tasks?.length ?? 0;
  return (
    <ModuleCard
      moduleKey="tasks"
      title="Tasks & development progress"
      description="Track status and progress on the kanban board."
      to={`/products/${productId}/tasks`}
      loading={tasks === null}
      right={
        total > 0 ? (
          <span className={cn("rounded-full border px-2.5 py-1 text-xs font-medium", TASK_STATUS_META.DONE.badge)}>
            {done}/{total} done
          </span>
        ) : (
          <span className="text-xs">No tasks yet</span>
        )
      }
    />
  );
}

function InfosecModuleCard({ items, productId }: { items: InfosecChecklistItem[] | null; productId: string }) {
  const total = items?.length ?? 0;
  const open = items?.filter((i) => i.status !== "VERIFIED").length ?? 0;
  return (
    <ModuleCard
      moduleKey="infosec"
      title="Infosec"
      description="Internal checklist, then VAPT findings across retest rounds."
      to={`/products/${productId}/infosec`}
      loading={items === null}
      right={
        total > 0 ? (
          <span className="rounded-full border px-2.5 py-1 text-xs font-medium">
            {open} open of {total}
          </span>
        ) : (
          <span className="text-xs">No checklist yet</span>
        )
      }
    />
  );
}

function UatModuleCard({ cycles, productId }: { cycles: UATCycle[] | null; productId: string }) {
  // cycles are newest-first from the API — the open one (if any) is what
  // matters for a live "readiness" badge; otherwise fall back to the most
  // recently closed cycle so the card isn't blank right after closing one.
  const current = cycles?.find((c) => c.status === "OPEN") ?? cycles?.[0] ?? null;
  return (
    <ModuleCard
      moduleKey="uat"
      title="UAT"
      description="Stakeholders test acceptance criteria and record pass/fail feedback."
      to={`/products/${productId}/uat`}
      loading={cycles === null}
      right={
        current ? (
          <span className={cn("rounded-full border px-2.5 py-1 text-xs font-medium", UAT_RESULT_META.PASS.badge)}>
            {current.pass_count}/{current.total_count} passed
          </span>
        ) : (
          <span className="text-xs">No cycle yet</span>
        )
      }
    />
  );
}

function BugsModuleCard({ bugs, productId }: { bugs: BugReport[] | null; productId: string }) {
  const total = bugs?.length ?? 0;
  const open = bugs?.filter((b) => b.status !== "VERIFIED" && b.status !== "CLOSED").length ?? 0;
  return (
    <ModuleCard
      moduleKey="bugs"
      title="Bugs"
      description="Log, triage, and track bugs through to verified/closed."
      to={`/products/${productId}/bugs`}
      loading={bugs === null}
      right={
        total > 0 ? (
          <span className={cn("rounded-full border px-2.5 py-1 text-xs font-medium", BUG_STATUS_META.OPEN.badge)}>
            {open} open of {total}
          </span>
        ) : (
          <span className="text-xs">No bugs yet</span>
        )
      }
    />
  );
}

function DiagramsModuleCard({ diagrams, productId }: { diagrams: ArchitectureDiagram[] | null; productId: string }) {
  const distinctTitles = new Set(diagrams?.map((d) => d.title)).size;
  return (
    <ModuleCard
      moduleKey="diagrams"
      title="Architecture diagrams"
      description="Upload and version the system design as it evolves."
      to={`/products/${productId}/diagrams`}
      loading={diagrams === null}
      right={<span className="text-xs">{distinctTitles > 0 ? `${distinctTitles} diagram(s)` : "None yet"}</span>}
    />
  );
}
