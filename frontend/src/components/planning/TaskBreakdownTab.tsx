import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Plus, Sparkles, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { currentRole } from "@/lib/roles";
import {
  BRD_SECTION_FIELDS,
  type BRD,
  type Priority,
  type ProductDetail,
  type Task,
  type TaskSuggestion,
} from "@/lib/types";
import { BRD_STATUS_META } from "@/lib/brdStatus";
import { PRIORITY_META } from "@/lib/taskMeta";
import { AssigneePicker } from "@/components/AssigneePicker";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

type DraftTask = {
  key: string;
  title: string;
  description: string;
  assigneeIds: string[];
  priority: Priority;
  brdSection: string;
  dueDate: string;
};

function newDraft(overrides: Partial<DraftTask> = {}): DraftTask {
  return {
    key: crypto.randomUUID(),
    title: "",
    description: "",
    assigneeIds: [],
    priority: "MEDIUM",
    brdSection: "",
    dueDate: "",
    ...overrides,
  };
}

export function TaskBreakdownTab({ productId, product }: { productId: string; product: ProductDetail }) {
  const { user } = useAuth();
  const [brds, setBrds] = useState<BRD[] | null>(null);
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [drafts, setDrafts] = useState<DraftTask[]>([]);
  const [suggesting, setSuggesting] = useState(false);
  const [creating, setCreating] = useState(false);

  const isPM = currentRole(product, user?.id) === "PM";

  useEffect(() => {
    api.get<BRD[]>(`/api/products/${productId}/brd`).then(setBrds);
    api.get<Task[]>(`/api/products/${productId}/tasks`).then(setTasks);
  }, [productId]);

  if (brds === null || tasks === null) {
    return <p className="text-sm text-muted-foreground">Loading...</p>;
  }

  const approvedBrds = brds.filter((b) => b.status === "APPROVED");
  const approved = approvedBrds.length > 0 ? approvedBrds.reduce((a, b) => (a.version > b.version ? a : b)) : null;
  // Tasks created through this tab always carry the approved BRD's id — that's
  // the persisted signal for "planned here", so this list survives reloads
  // instead of resetting to empty like a session-only "just created" list would.
  const plannedTasks = approved ? tasks.filter((t) => t.brd_id === approved.id) : [];

  async function suggestTasks() {
    if (!approved) return;
    setSuggesting(true);
    try {
      const suggestions = await api.post<TaskSuggestion[]>(
        `/api/products/${productId}/brd/${approved.id}/suggest-tasks`,
      );
      if (suggestions.length === 0) {
        toast.info("No suggestions came back — try adding tasks manually.");
      }
      setDrafts((prev) => [
        ...prev,
        ...suggestions.map((s) =>
          newDraft({
            title: s.title,
            description: s.description ?? "",
            priority: s.priority,
            brdSection: s.brd_section ?? "",
          }),
        ),
      ]);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not generate suggestions");
    } finally {
      setSuggesting(false);
    }
  }

  function updateDraft(key: string, patch: Partial<DraftTask>) {
    setDrafts((prev) => prev.map((d) => (d.key === key ? { ...d, ...patch } : d)));
  }

  function removeDraft(key: string) {
    setDrafts((prev) => prev.filter((d) => d.key !== key));
  }

  async function createTasks() {
    const ready = drafts.filter((d) => d.title.trim());
    if (ready.length === 0) return;
    setCreating(true);
    try {
      const created: Task[] = [];
      for (const d of ready) {
        const task = await api.post<Task>(`/api/products/${productId}/tasks`, {
          title: d.title,
          description: d.description || null,
          brd_id: approved?.id ?? null,
          brd_section: d.brdSection || null,
          assignee_ids: d.assigneeIds,
          priority: d.priority,
          due_date: d.dueDate ? new Date(d.dueDate).toISOString() : null,
          // Planning's output is Development-stage work, not Planning-stage
          // work itself — override the usual "defaults to current stage" rule.
          stage: "DEVELOPMENT",
        });
        created.push(task);
      }
      setTasks((prev) => [...created, ...(prev ?? [])]);
      setDrafts([]);
      toast.success(`Created ${created.length} task${created.length === 1 ? "" : "s"}`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not create all tasks");
    } finally {
      setCreating(false);
    }
  }

  if (!approved) {
    return (
      <Card className="border-dashed">
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          Planning starts once a BRD is approved.{" "}
          <Link to={`/products/${productId}/brd`} className="underline">
            Go to the BRD
          </Link>
          .
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <Card className="lg:col-span-1">
        <CardHeader>
          <CardTitle className="text-sm">{approved.title}</CardTitle>
          <CardDescription className="flex items-center gap-2">
            <span>Version {approved.version}</span>
            <span className={cn("rounded-full border px-2 py-0.5 text-xs", BRD_STATUS_META[approved.status].badge)}>
              {BRD_STATUS_META[approved.status].label}
            </span>
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {BRD_SECTION_FIELDS.map((f) => (
            <div key={f.key}>
              <h3 className="mb-1 text-sm font-medium">{f.label}</h3>
              <p className="whitespace-pre-wrap text-sm text-muted-foreground">{approved.sections[f.key] || "—"}</p>
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="flex flex-col gap-4 lg:col-span-2">
        <Card>
          <CardHeader className="flex-row items-center justify-between gap-2 space-y-0">
            <div>
              <CardTitle className="text-sm">Task breakdown</CardTitle>
              <CardDescription>Break this BRD into tasks, assign owners, and create them together.</CardDescription>
            </div>
            {isPM && (
              <div className="flex shrink-0 gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  disabled={suggesting}
                  onClick={suggestTasks}
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  {suggesting ? "Suggesting..." : "Suggest tasks"}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  className="gap-1.5"
                  onClick={() => setDrafts((prev) => [...prev, newDraft()])}
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add task
                </Button>
              </div>
            )}
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {!isPM && <p className="text-sm text-muted-foreground">Only a PM can plan tasks for this product.</p>}
            {isPM && drafts.length === 0 && (
              <p className="text-sm text-muted-foreground">
                No draft tasks yet — add one manually or generate suggestions from the BRD.
              </p>
            )}
            {drafts.map((d) => (
              <DraftRow
                key={d.key}
                draft={d}
                members={product.members}
                onChange={(patch) => updateDraft(d.key, patch)}
                onRemove={() => removeDraft(d.key)}
              />
            ))}
            {isPM && drafts.length > 0 && (
              <Button
                type="button"
                disabled={creating || !drafts.some((d) => d.title.trim())}
                onClick={createTasks}
                className="mt-1 self-start"
              >
                {creating ? "Creating..." : `Create ${drafts.filter((d) => d.title.trim()).length} task(s)`}
              </Button>
            )}
          </CardContent>
        </Card>

        {plannedTasks.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Planned tasks ({plannedTasks.length})
              </CardTitle>
              <CardDescription>Every task created from this BRD through Planning — persists across visits.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              {plannedTasks.map((t) => (
                <div
                  key={t.id}
                  className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm"
                >
                  <span>{t.title}</span>
                  <span className={cn("rounded-full border px-2 py-0.5 text-xs", PRIORITY_META[t.priority].badge)}>
                    {PRIORITY_META[t.priority].label}
                  </span>
                </div>
              ))}
              <Link
                to={`/products/${productId}/tasks`}
                className="mt-1 self-start text-sm text-muted-foreground underline hover:text-foreground"
              >
                View on the tasks board
              </Link>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

function DraftRow({
  draft,
  members,
  onChange,
  onRemove,
}: {
  draft: DraftTask;
  members: ProductDetail["members"];
  onChange: (patch: Partial<DraftTask>) => void;
  onRemove: () => void;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border p-3">
      <div className="flex items-start gap-2">
        <Input
          placeholder="Task title"
          value={draft.title}
          onChange={(e) => onChange({ title: e.target.value })}
          className="flex-1"
        />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-9 w-9 shrink-0"
          onClick={onRemove}
          aria-label="Remove draft task"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
      <Textarea
        placeholder="Description (optional)"
        rows={2}
        value={draft.description}
        onChange={(e) => onChange({ description: e.target.value })}
      />
      <AssigneePicker
        members={members}
        selectedIds={draft.assigneeIds}
        onChange={(assigneeIds) => onChange({ assigneeIds })}
      />
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <Select
          value={draft.priority}
          onChange={(e) => onChange({ priority: e.target.value as Priority })}
          className="text-xs"
        >
          <option value="LOW">Low</option>
          <option value="MEDIUM">Medium</option>
          <option value="HIGH">High</option>
          <option value="CRITICAL">Critical</option>
        </Select>
        <Select value={draft.brdSection} onChange={(e) => onChange({ brdSection: e.target.value })} className="text-xs">
          <option value="">No BRD section</option>
          {BRD_SECTION_FIELDS.map((f) => (
            <option key={f.key} value={f.key}>
              {f.label}
            </option>
          ))}
        </Select>
        <Input type="date" value={draft.dueDate} onChange={(e) => onChange({ dueDate: e.target.value })} className="text-xs" />
      </div>
    </div>
  );
}
