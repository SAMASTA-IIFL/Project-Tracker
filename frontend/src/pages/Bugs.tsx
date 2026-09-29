import { useEffect, useState, type FormEvent } from "react";
import { useParams } from "react-router-dom";
import { LayoutGrid, List as ListIcon, Plus } from "lucide-react";
import { toast } from "sonner";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { currentRole } from "@/lib/roles";
import {
  BUG_SEVERITIES,
  BUG_SOURCES,
  BUG_STATUSES,
  type BugActivity,
  type BugComment,
  type BugReport,
  type BugSeverity,
  type BugSource,
  type BugStatus,
  type ProductDetail,
  type Task,
} from "@/lib/types";
import { BUG_SEVERITY_META, BUG_SOURCE_META } from "@/lib/bugMeta";
import { BUG_STATUS_META } from "@/lib/uatMeta";
import { SELECTED_ROW_ACTIVE, SELECTED_ROW_INACTIVE } from "@/lib/selectedRow";
import { AppShell } from "@/components/AppShell";
import { ModuleNav } from "@/components/ModuleNav";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

const BUG_STATUS_LABELS: { key: BugStatus; label: string }[] = BUG_STATUSES.map((s) => ({
  key: s,
  label: BUG_STATUS_META[s].label,
}));

export function BugsPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const [product, setProduct] = useState<ProductDetail | null>(null);
  const [bugs, setBugs] = useState<BugReport[] | null>(null);
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [view, setView] = useState<"board" | "list">("board");
  const [showNewBug, setShowNewBug] = useState(false);
  const [selectedBugId, setSelectedBugId] = useState<string | null>(null);
  const [severityFilter, setSeverityFilter] = useState<BugSeverity | "">("");
  const [sourceFilter, setSourceFilter] = useState<BugSource | "">("");
  const [statusFilter, setStatusFilter] = useState<BugStatus | "">("");

  const role = currentRole(product, user?.id);
  const isAdmin = user?.global_role === "ADMIN";
  const canManage = role === "PM" || isAdmin;

  useEffect(() => {
    if (!id) return;
    api.get<ProductDetail>(`/api/products/${id}`).then(setProduct);
    api.get<Task[]>(`/api/products/${id}/tasks`).then(setTasks);
    refreshBugs();
  }, [id]);

  function refreshBugs() {
    if (!id) return;
    api.get<BugReport[]>(`/api/products/${id}/bugs`).then(setBugs);
  }

  async function updateBug(bug: BugReport, patch: { severity?: BugSeverity; status?: BugStatus; assignee_id?: string | null; linked_task_id?: string | null }) {
    if (!id) return;
    try {
      const updated = await api.patch<BugReport>(`/api/products/${id}/bugs/${bug.id}`, patch);
      setBugs((prev) => prev?.map((b) => (b.id === updated.id ? updated : b)) ?? null);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not update bug");
    }
  }

  if (!product || bugs === null || tasks === null) {
    return (
      <AppShell>
        <div className="mx-auto max-w-6xl px-4 py-10">
          <p className="text-sm text-muted-foreground">Loading...</p>
        </div>
      </AppShell>
    );
  }

  const filteredBugs = bugs.filter(
    (b) =>
      (!severityFilter || b.severity === severityFilter) &&
      (!sourceFilter || b.source === sourceFilter) &&
      (!statusFilter || b.status === statusFilter),
  );
  const selectedBug = bugs.find((b) => b.id === selectedBugId) ?? null;

  return (
    <AppShell>
      <div className="mx-auto max-w-6xl px-4 py-10">
        <ModuleNav productId={id!} productName={product.name} active="bugs" />

        <div className="mb-6 flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-title-3">Bugs</h1>
          <div className="flex items-center gap-2">
            <div className="flex rounded-md border border-border p-0.5">
              <Button
                type="button"
                size="icon"
                variant={view === "board" ? "default" : "ghost"}
                className="h-7 w-7"
                onClick={() => setView("board")}
                aria-label="Board view"
              >
                <LayoutGrid className="h-3.5 w-3.5" />
              </Button>
              <Button
                type="button"
                size="icon"
                variant={view === "list" ? "default" : "ghost"}
                className="h-7 w-7"
                onClick={() => setView("list")}
                aria-label="List view"
              >
                <ListIcon className="h-3.5 w-3.5" />
              </Button>
            </div>
            <Button type="button" size="sm" className="gap-1.5" onClick={() => setShowNewBug((v) => !v)}>
              <Plus className="h-4 w-4" />
              Report bug
            </Button>
          </div>
        </div>

        <div className="mb-4 flex flex-wrap items-center gap-2">
          <Select value={severityFilter} onChange={(e) => setSeverityFilter(e.target.value as BugSeverity | "")} className="h-8 w-36 text-xs">
            <option value="">All severities</option>
            {BUG_SEVERITIES.map((s) => (
              <option key={s} value={s}>
                {BUG_SEVERITY_META[s].label}
              </option>
            ))}
          </Select>
          <Select value={sourceFilter} onChange={(e) => setSourceFilter(e.target.value as BugSource | "")} className="h-8 w-36 text-xs">
            <option value="">All sources</option>
            {BUG_SOURCES.map((s) => (
              <option key={s} value={s}>
                {BUG_SOURCE_META[s].label}
              </option>
            ))}
          </Select>
          <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as BugStatus | "")} className="h-8 w-36 text-xs">
            <option value="">All statuses</option>
            {BUG_STATUS_LABELS.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </Select>
        </div>

        {showNewBug && (
          <ReportBugForm
            productId={id!}
            tasks={tasks}
            onCreated={(b) => {
              setBugs((prev) => [b, ...(prev ?? [])]);
              setShowNewBug(false);
            }}
          />
        )}

        {filteredBugs.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="py-10 text-center text-sm text-muted-foreground">No bugs match these filters.</CardContent>
          </Card>
        ) : view === "board" ? (
          <div className="flex gap-3 overflow-x-auto pb-2">
            {BUG_STATUS_LABELS.map((col) => (
              <div key={col.key} className="flex w-64 shrink-0 flex-col gap-2">
                <div className="flex items-center justify-between px-1">
                  <span className="text-xs font-medium text-muted-foreground">{col.label}</span>
                  <span className="text-xs text-muted-foreground">
                    {filteredBugs.filter((b) => b.status === col.key).length}
                  </span>
                </div>
                <div className="flex flex-col gap-2">
                  {filteredBugs
                    .filter((b) => b.status === col.key)
                    .map((bug) => (
                      <BugCard key={bug.id} bug={bug} active={bug.id === selectedBugId} onClick={() => setSelectedBugId(bug.id)} />
                    ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {filteredBugs.map((bug) => (
              <BugRow key={bug.id} bug={bug} active={bug.id === selectedBugId} onClick={() => setSelectedBugId(bug.id)} />
            ))}
          </div>
        )}

        {selectedBug && (
          <BugDetail
            productId={id!}
            bug={selectedBug}
            members={product.members}
            tasks={tasks}
            currentUserId={user?.id}
            canManage={canManage}
            onClose={() => setSelectedBugId(null)}
            onChange={(patch) => updateBug(selectedBug, patch)}
          />
        )}
      </div>
    </AppShell>
  );
}

function BugCard({ bug, active, onClick }: { bug: BugReport; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "card-glow flex flex-col gap-2 rounded-lg border bg-card p-3 text-left text-sm transition-[transform,background-color,box-shadow] duration-fast ease-apple-out hover:shadow-2 active:scale-[0.99]",
        active ? SELECTED_ROW_ACTIVE : SELECTED_ROW_INACTIVE,
      )}
    >
      <span className="font-medium">{bug.title}</span>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className={cn("rounded-full border px-2 py-0.5 text-xs", BUG_SEVERITY_META[bug.severity].badge)}>
          {BUG_SEVERITY_META[bug.severity].label}
        </span>
        <span className={cn("rounded-full border px-2 py-0.5 text-xs", BUG_SOURCE_META[bug.source].badge)}>
          {BUG_SOURCE_META[bug.source].label}
        </span>
      </div>
      {bug.assignee && <span className="text-xs text-muted-foreground">{bug.assignee.name ?? bug.assignee.email}</span>}
    </button>
  );
}

function BugRow({ bug, active, onClick }: { bug: BugReport; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card px-4 py-3 text-left text-sm transition-[transform,background-color] duration-fast ease-apple-out active:scale-[0.99]",
        active ? SELECTED_ROW_ACTIVE : SELECTED_ROW_INACTIVE,
      )}
    >
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="font-medium">{bug.title}</span>
        <span className="text-xs text-muted-foreground">
          Reported by {bug.reported_by.name ?? bug.reported_by.email} · {new Date(bug.created_at).toLocaleDateString()}
        </span>
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-1.5">
        <span className={cn("rounded-full border px-2 py-0.5 text-xs", BUG_SEVERITY_META[bug.severity].badge)}>
          {BUG_SEVERITY_META[bug.severity].label}
        </span>
        <span className={cn("rounded-full border px-2 py-0.5 text-xs", BUG_SOURCE_META[bug.source].badge)}>
          {BUG_SOURCE_META[bug.source].label}
        </span>
        <span className={cn("rounded-full border px-2 py-0.5 text-xs", BUG_STATUS_META[bug.status].badge)}>
          {BUG_STATUS_META[bug.status].label}
        </span>
      </div>
    </button>
  );
}

function ReportBugForm({
  productId,
  tasks,
  onCreated,
}: {
  productId: string;
  tasks: Task[];
  onCreated: (bug: BugReport) => void;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [severity, setSeverity] = useState<BugSeverity>("MEDIUM");
  const [source, setSource] = useState<Exclude<BugSource, "UAT">>("INTERNAL");
  const [linkedTaskId, setLinkedTaskId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!title.trim() || !description.trim()) return;
    setBusy(true);
    try {
      const form = new FormData();
      form.append("title", title);
      form.append("description", description);
      form.append("severity", severity);
      form.append("source", source);
      if (linkedTaskId) form.append("linked_task_id", linkedTaskId);
      if (file) form.append("file", file);
      const bug = await api.post<BugReport>(`/api/products/${productId}/bugs`, form);
      onCreated(bug);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not report bug");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="mb-4">
      <CardContent className="py-4">
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <Input placeholder="Title" required value={title} onChange={(e) => setTitle(e.target.value)} />
          <Textarea placeholder="Description" required rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <Select value={severity} onChange={(e) => setSeverity(e.target.value as BugSeverity)}>
              {BUG_SEVERITIES.map((s) => (
                <option key={s} value={s}>
                  {BUG_SEVERITY_META[s].label}
                </option>
              ))}
            </Select>
            <Select value={source} onChange={(e) => setSource(e.target.value as Exclude<BugSource, "UAT">)}>
              <option value="INTERNAL">Internal</option>
              <option value="POST_PRODUCTION">Post-production</option>
            </Select>
            <Select value={linkedTaskId} onChange={(e) => setLinkedTaskId(e.target.value)}>
              <option value="">No linked task</option>
              {tasks.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title}
                </option>
              ))}
            </Select>
          </div>
          <Input type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          <Button type="submit" size="sm" disabled={busy} className="self-start">
            {busy ? "Reporting..." : "Report bug"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function BugDetail({
  productId,
  bug,
  members,
  tasks,
  currentUserId,
  canManage,
  onClose,
  onChange,
}: {
  productId: string;
  bug: BugReport;
  members: ProductDetail["members"];
  tasks: Task[];
  currentUserId: string | undefined;
  canManage: boolean;
  onClose: () => void;
  onChange: (patch: { severity?: BugSeverity; status?: BugStatus; assignee_id?: string | null; linked_task_id?: string | null }) => void;
}) {
  const [activity, setActivity] = useState<BugActivity[] | null>(null);
  const [comments, setComments] = useState<BugComment[] | null>(null);
  const [commentText, setCommentText] = useState("");

  const canUpdateStatus = canManage || bug.assignee?.id === currentUserId;

  useEffect(() => {
    api.get<BugComment[]>(`/api/products/${productId}/bugs/${bug.id}/comments`).then(setComments);
  }, [productId, bug.id]);

  useEffect(() => {
    // Re-fetches whenever status changes (including from this same panel),
    // same fix InfosecItemDetail/FeedbackDetail already needed once.
    api.get<BugActivity[]>(`/api/products/${productId}/bugs/${bug.id}/activity`).then(setActivity);
  }, [productId, bug.id, bug.status]);

  async function postComment(e: FormEvent) {
    e.preventDefault();
    if (!commentText.trim()) return;
    try {
      const comment = await api.post<BugComment>(`/api/products/${productId}/bugs/${bug.id}/comments`, { text: commentText });
      setComments((prev) => [...(prev ?? []), comment]);
      setCommentText("");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not post comment");
    }
  }

  function describeActivity(a: BugActivity): string {
    const who = a.actor.name ?? a.actor.email;
    if (a.event_type === "BUG_LOGGED") return `${who} reported this bug`;
    if (a.event_type === "BUG_STATUS_CHANGED" && a.status) return `${who} changed status to ${BUG_STATUS_META[a.status].label}`;
    if (a.event_type === "BUG_TRIAGED") return `${who} updated triage details`;
    if (a.event_type === "BUG_COMMENTED") return `${who} commented`;
    return `${who} ${a.event_type.replaceAll("_", " ").toLowerCase()}`;
  }

  const linkedTask = bug.linked_task_id ? tasks.find((t) => t.id === bug.linked_task_id) : undefined;

  return (
    <Card className="mt-6">
      <div className="flex items-start justify-between gap-2 p-6 pb-0">
        <div>
          <h2 className="text-lg font-semibold">{bug.title}</h2>
          <p className="text-sm text-muted-foreground">{bug.description}</p>
        </div>
        <Button type="button" variant="ghost" size="sm" onClick={onClose}>
          Close
        </Button>
      </div>
      <CardContent className="flex flex-col gap-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="flex flex-col gap-1.5">
            <Label>Source</Label>
            <span className={cn("w-fit rounded-full border px-2 py-0.5 text-xs", BUG_SOURCE_META[bug.source].badge)}>
              {BUG_SOURCE_META[bug.source].label}
            </span>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="detail-severity">Severity</Label>
            {canManage ? (
              <Select id="detail-severity" value={bug.severity} onChange={(e) => onChange({ severity: e.target.value as BugSeverity })}>
                {BUG_SEVERITIES.map((s) => (
                  <option key={s} value={s}>
                    {BUG_SEVERITY_META[s].label}
                  </option>
                ))}
              </Select>
            ) : (
              <span className={cn("w-fit rounded-full border px-2 py-0.5 text-xs", BUG_SEVERITY_META[bug.severity].badge)}>
                {BUG_SEVERITY_META[bug.severity].label}
              </span>
            )}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="detail-assignee">Assignee</Label>
            {canManage ? (
              <Select id="detail-assignee" value={bug.assignee?.id ?? ""} onChange={(e) => onChange({ assignee_id: e.target.value || null })}>
                <option value="">Unassigned</option>
                {members.map((m) => (
                  <option key={m.user.id} value={m.user.id}>
                    {m.user.name ?? m.user.email}
                  </option>
                ))}
              </Select>
            ) : (
              <span className="text-sm text-muted-foreground">{bug.assignee ? (bug.assignee.name ?? bug.assignee.email) : "Unassigned"}</span>
            )}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="detail-status">Status</Label>
            {canUpdateStatus ? (
              <Select id="detail-status" value={bug.status} onChange={(e) => onChange({ status: e.target.value as BugStatus })}>
                {BUG_STATUS_LABELS.map((s) => (
                  <option key={s.key} value={s.key}>
                    {s.label}
                  </option>
                ))}
              </Select>
            ) : (
              <span className={cn("w-fit rounded-full border px-2 py-0.5 text-xs", BUG_STATUS_META[bug.status].badge)}>
                {BUG_STATUS_META[bug.status].label}
              </span>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="detail-linked-task">Linked task</Label>
          {canManage ? (
            <Select id="detail-linked-task" value={bug.linked_task_id ?? ""} onChange={(e) => onChange({ linked_task_id: e.target.value || null })}>
              <option value="">No linked task</option>
              {tasks.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title}
                </option>
              ))}
            </Select>
          ) : (
            <span className="text-sm text-muted-foreground">{linkedTask ? linkedTask.title : "None"}</span>
          )}
        </div>

        <div>
          <h3 className="mb-2 text-sm font-medium text-muted-foreground">Activity</h3>
          <div className="flex flex-col gap-1.5">
            {activity?.length === 0 && <p className="text-sm text-muted-foreground">No activity yet.</p>}
            {activity?.map((a) => (
              <div key={a.id} className="text-xs text-muted-foreground">
                {describeActivity(a)} · {new Date(a.created_at).toLocaleString()}
              </div>
            ))}
          </div>
        </div>

        <div>
          <h3 className="mb-2 text-sm font-medium text-muted-foreground">Comments</h3>
          <div className="flex flex-col gap-2">
            {comments?.length === 0 && <p className="text-sm text-muted-foreground">No comments yet.</p>}
            {comments?.map((c) => (
              <div key={c.id} className="rounded-lg border border-border p-3 text-sm">
                <div className="mb-1 flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">{c.author.name ?? c.author.email}</span>
                  <span>{new Date(c.created_at).toLocaleString()}</span>
                </div>
                <p>{c.text}</p>
              </div>
            ))}
          </div>
          <form onSubmit={postComment} className="mt-2 flex flex-col gap-2 border-t border-border pt-3">
            <Textarea placeholder="Leave a note..." rows={2} value={commentText} onChange={(e) => setCommentText(e.target.value)} />
            <Button type="submit" size="sm" className="self-start" disabled={!commentText.trim()}>
              Comment
            </Button>
          </form>
        </div>
      </CardContent>
    </Card>
  );
}
