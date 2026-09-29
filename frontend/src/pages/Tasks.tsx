import { useEffect, useRef, useState, type FormEvent } from "react";
import { useParams } from "react-router-dom";
import { CalendarClock, LayoutGrid, List as ListIcon, Plus } from "lucide-react";
import { toast } from "sonner";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { currentRole } from "@/lib/roles";
import {
  STAGES,
  TASK_STATUSES,
  type LifecycleStage,
  type Priority,
  type ProductDetail,
  type ProgressUpdate,
  type Task,
  type TaskStatus,
} from "@/lib/types";
import { PRIORITY_META, TASK_STATUS_META } from "@/lib/taskMeta";
import { STAGE_META } from "@/lib/stages";
import { AppShell } from "@/components/AppShell";
import { AssigneePicker } from "@/components/AssigneePicker";
import { ModuleNav } from "@/components/ModuleNav";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

export function TasksPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const [product, setProduct] = useState<ProductDetail | null>(null);
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [view, setView] = useState<"board" | "list">("board");
  const [showNewTask, setShowNewTask] = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const boardScrollRef = useRef<HTMLDivElement>(null);
  const [boardScrollEdges, setBoardScrollEdges] = useState({ atStart: true, atEnd: true });

  const role = currentRole(product, user?.id);
  const isPM = role === "PM";

  useEffect(() => {
    if (!id) return;
    api.get<ProductDetail>(`/api/products/${id}`).then(setProduct);
    refreshTasks();
  }, [id]);

  function refreshTasks() {
    if (!id) return;
    api.get<Task[]>(`/api/products/${id}/tasks`).then(setTasks);
  }

  function updateBoardScrollEdges(el: HTMLDivElement) {
    setBoardScrollEdges({
      atStart: el.scrollLeft <= 4,
      atEnd: el.scrollLeft + el.clientWidth >= el.scrollWidth - 4,
    });
  }

  // Kanban columns can overflow horizontally (esp. on mobile, where a column
  // eats nearly the full viewport) with no native scrollbar hint that there's
  // more off-screen — these edge fades are the affordance. Re-check on every
  // task-list change since column count/scrollWidth can shift under us.
  useEffect(() => {
    if (view !== "board" || !boardScrollRef.current) return;
    updateBoardScrollEdges(boardScrollRef.current);
  }, [view, tasks]);

  async function updateStatus(task: Task, status: TaskStatus) {
    if (!id) return;
    try {
      const updated = await api.patch<Task>(`/api/products/${id}/tasks/${task.id}`, { status });
      setTasks((prev) => prev?.map((t) => (t.id === updated.id ? updated : t)) ?? null);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not update status");
    }
  }

  if (!product || tasks === null) {
    return (
      <AppShell>
        <div className="mx-auto max-w-6xl px-4 py-10">
          <p className="text-sm text-muted-foreground">Loading...</p>
        </div>
      </AppShell>
    );
  }

  const selectedTask = tasks.find((t) => t.id === selectedTaskId) ?? null;

  return (
    <AppShell>
      <div className="mx-auto max-w-6xl px-4 py-10">
        <ModuleNav productId={id!} productName={product.name} active="tasks" />

        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-title-3">Tasks & development progress</h1>
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
            {isPM && (
              <Button type="button" size="sm" className="gap-1.5" onClick={() => setShowNewTask((v) => !v)}>
                <Plus className="h-4 w-4" />
                New task
              </Button>
            )}
          </div>
        </div>

        {showNewTask && (
          <NewTaskForm
            productId={id!}
            members={product.members}
            defaultStage={product.current_stage}
            onCreated={(t) => {
              setTasks((prev) => [t, ...(prev ?? [])]);
              setShowNewTask(false);
            }}
          />
        )}

        {tasks.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              No tasks yet.
            </CardContent>
          </Card>
        ) : view === "board" ? (
          <div className="relative">
            <div
              ref={boardScrollRef}
              onScroll={(e) => updateBoardScrollEdges(e.currentTarget)}
              className="flex gap-3 overflow-x-auto pb-2"
            >
            {TASK_STATUSES.map((col) => (
              <div key={col.key} className="flex w-64 shrink-0 flex-col gap-2">
                <div className="flex items-center justify-between px-1">
                  <span className="text-xs font-medium text-muted-foreground">{col.label}</span>
                  <span className="text-xs text-muted-foreground">
                    {tasks.filter((t) => t.status === col.key).length}
                  </span>
                </div>
                <div className="flex flex-col gap-2">
                  {tasks
                    .filter((t) => t.status === col.key)
                    .map((task) => (
                      <TaskCard
                        key={task.id}
                        task={task}
                        canEdit={isPM || task.assignees.some((a) => a.id === user?.id)}
                        onClick={() => setSelectedTaskId(task.id)}
                        onStatusChange={(s) => updateStatus(task, s)}
                      />
                    ))}
                </div>
              </div>
            ))}
            </div>
            <div
              aria-hidden
              className={cn(
                "pointer-events-none absolute inset-y-0 left-0 w-8 bg-gradient-to-r from-background to-transparent transition-opacity duration-fast",
                boardScrollEdges.atStart ? "opacity-0" : "opacity-100",
              )}
            />
            <div
              aria-hidden
              className={cn(
                "pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-background to-transparent transition-opacity duration-fast",
                boardScrollEdges.atEnd ? "opacity-0" : "opacity-100",
              )}
            />
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {tasks.map((task) => (
              <button
                key={task.id}
                type="button"
                onClick={() => setSelectedTaskId(task.id)}
                className="card-glow flex items-center justify-between rounded-lg border border-border bg-card px-4 py-3 text-left text-sm transition-[transform,background-color] duration-fast ease-apple-out hover:bg-accent/40 active:scale-[0.99]"
              >
                <div className="flex flex-col gap-0.5">
                  <span className="font-medium">{task.title}</span>
                  <span className="text-xs text-muted-foreground">
                    {task.assignees.length > 0
                      ? task.assignees.map((a) => a.name ?? a.email).join(", ")
                      : "Unassigned"}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <StageBadge stage={task.stage} />
                  <DueDateBadge task={task} />
                  <span className={cn("rounded-full border px-2 py-0.5 text-xs", PRIORITY_META[task.priority].badge)}>
                    {PRIORITY_META[task.priority].label}
                  </span>
                  <span className={cn("rounded-full border px-2 py-0.5 text-xs", TASK_STATUS_META[task.status].badge)}>
                    {TASK_STATUS_META[task.status].label}
                  </span>
                </div>
              </button>
            ))}
          </div>
        )}

        {selectedTask && (
          <TaskDetail
            productId={id!}
            task={selectedTask}
            members={product.members}
            canEdit={isPM}
            canPostProgress={isPM || selectedTask.assignees.some((a) => a.id === user?.id)}
            onClose={() => setSelectedTaskId(null)}
            onUpdated={(t) => setTasks((prev) => prev?.map((x) => (x.id === t.id ? t : x)) ?? null)}
          />
        )}
      </div>
    </AppShell>
  );
}

function DueDateBadge({ task }: { task: Task }) {
  if (!task.due_date) return null;
  const due = new Date(task.due_date);
  const overdue = task.status !== "DONE" && due.getTime() < Date.now();
  return (
    <span
      className={cn(
        "flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs",
        overdue ? "border-red-500/40 bg-red-500/15 text-red-500" : "border-border text-muted-foreground",
      )}
    >
      <CalendarClock className="h-3 w-3" />
      {due.toLocaleDateString()}
    </span>
  );
}

function StageBadge({ stage }: { stage: LifecycleStage }) {
  const meta = STAGE_META[stage];
  const Icon = meta.icon;
  const label = STAGES.find((s) => s.key === stage)?.label ?? stage;
  return (
    // Rectangular tag (vs. Priority's rounded-full pill) plus its own icon —
    // two independent cues so Stage and Priority read as different kinds of
    // badge at a glance instead of two same-shaped colored pills.
    <span className={cn("flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs", meta.badge)}>
      <Icon className="h-3 w-3" />
      {label}
    </span>
  );
}

function TaskCard({
  task,
  canEdit,
  onClick,
  onStatusChange,
}: {
  task: Task;
  canEdit: boolean;
  onClick: () => void;
  onStatusChange: (status: TaskStatus) => void;
}) {
  return (
    <div className="card-glow flex flex-col gap-2 rounded-lg border border-border bg-card p-3 transition-shadow duration-fast ease-apple-out hover:shadow-2">
      <button type="button" onClick={onClick} className="text-left text-sm font-medium hover:underline">
        {task.title}
      </button>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className={cn("rounded-full border px-2 py-0.5 text-xs", PRIORITY_META[task.priority].badge)}>
          {PRIORITY_META[task.priority].label}
        </span>
        <StageBadge stage={task.stage} />
        <DueDateBadge task={task} />
      </div>
      <div className="flex items-center justify-between">
        {task.assignees.length > 0 ? (
          <div className="flex -space-x-2">
            {task.assignees.map((a) => (
              <Avatar key={a.id} label={a.name ?? a.email} className="h-6 w-6 text-[10px]" />
            ))}
          </div>
        ) : (
          <span />
        )}
      </div>
      {canEdit && (
        <Select
          value={task.status}
          onChange={(e) => onStatusChange(e.target.value as TaskStatus)}
          className="h-7 text-xs"
        >
          {TASK_STATUSES.map((s) => (
            <option key={s.key} value={s.key}>
              {s.label}
            </option>
          ))}
        </Select>
      )}
    </div>
  );
}

function NewTaskForm({
  productId,
  members,
  defaultStage,
  onCreated,
}: {
  productId: string;
  members: ProductDetail["members"];
  defaultStage: LifecycleStage;
  onCreated: (task: Task) => void;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [assigneeIds, setAssigneeIds] = useState<string[]>([]);
  const [priority, setPriority] = useState<Priority>("MEDIUM");
  const [stage, setStage] = useState<LifecycleStage>(defaultStage);
  const [dueDate, setDueDate] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const task = await api.post<Task>(`/api/products/${productId}/tasks`, {
        title,
        description: description || null,
        assignee_ids: assigneeIds,
        priority,
        stage,
        due_date: dueDate ? new Date(dueDate).toISOString() : null,
      });
      onCreated(task);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not create task");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="mb-4">
      <CardHeader>
        <CardTitle className="text-sm">New task</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="task-title">Title</Label>
              <Input id="task-title" required value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Assignees</Label>
              <AssigneePicker members={members} selectedIds={assigneeIds} onChange={setAssigneeIds} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="task-priority">Priority</Label>
              <Select id="task-priority" value={priority} onChange={(e) => setPriority(e.target.value as Priority)}>
                <option value="LOW">Low</option>
                <option value="MEDIUM">Medium</option>
                <option value="HIGH">High</option>
                <option value="CRITICAL">Critical</option>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="task-stage">Lifecycle stage</Label>
              <Select id="task-stage" value={stage} onChange={(e) => setStage(e.target.value as LifecycleStage)}>
                {STAGES.map((s) => (
                  <option key={s.key} value={s.key}>
                    {s.label}
                  </option>
                ))}
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="task-due">Due date</Label>
              <Input id="task-due" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="task-desc">Description</Label>
            <Textarea id="task-desc" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          {STAGES.findIndex((s) => s.key === stage) < STAGES.findIndex((s) => s.key === defaultStage) && (
            <p className="text-xs text-amber-500">
              This stage is behind where the product currently is — creating this task will reopen it.
            </p>
          )}
          <Button type="submit" disabled={busy} className="self-start">
            Create task
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function TaskDetail({
  productId,
  task,
  members,
  canEdit,
  canPostProgress,
  onClose,
  onUpdated,
}: {
  productId: string;
  task: Task;
  members: ProductDetail["members"];
  canEdit: boolean;
  canPostProgress: boolean;
  onClose: () => void;
  onUpdated: (task: Task) => void;
}) {
  const [updates, setUpdates] = useState<ProgressUpdate[] | null>(null);
  const [note, setNote] = useState("");
  const [percent, setPercent] = useState("");

  useEffect(() => {
    api.get<ProgressUpdate[]>(`/api/products/${productId}/tasks/${task.id}/progress`).then(setUpdates);
  }, [productId, task.id]);

  async function postUpdate(e: FormEvent) {
    e.preventDefault();
    if (!note.trim()) return;
    try {
      const update = await api.post<ProgressUpdate>(`/api/products/${productId}/tasks/${task.id}/progress`, {
        note,
        percent_complete: percent ? Number(percent) : null,
      });
      setUpdates((prev) => [update, ...(prev ?? [])]);
      setNote("");
      setPercent("");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not post update");
    }
  }

  async function reassign(assigneeIds: string[]) {
    try {
      const updated = await api.patch<Task>(`/api/products/${productId}/tasks/${task.id}`, {
        assignee_ids: assigneeIds,
      });
      onUpdated(updated);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not update assignees");
    }
  }

  async function changeStage(stage: LifecycleStage) {
    try {
      const updated = await api.patch<Task>(`/api/products/${productId}/tasks/${task.id}`, { stage });
      onUpdated(updated);
      toast.success(`Moved to ${STAGES.find((s) => s.key === stage)?.label ?? stage}`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not change stage");
    }
  }

  return (
    <Card className="mt-6">
      <CardHeader className="flex-row items-start justify-between gap-2 space-y-0">
        <div>
          <CardTitle>{task.title}</CardTitle>
          <CardDescription>{task.description || "No description."}</CardDescription>
        </div>
        <Button type="button" variant="ghost" size="sm" onClick={onClose}>
          Close
        </Button>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {canEdit && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label>Assignees</Label>
              <AssigneePicker
                members={members}
                selectedIds={task.assignees.map((a) => a.id)}
                onChange={reassign}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="task-stage-edit">Lifecycle stage</Label>
              <Select
                id="task-stage-edit"
                value={task.stage}
                onChange={(e) => changeStage(e.target.value as LifecycleStage)}
              >
                {STAGES.map((s) => (
                  <option key={s.key} value={s.key}>
                    {s.label}
                  </option>
                ))}
              </Select>
            </div>
          </div>
        )}
        {!canEdit && (
          <div className="flex flex-wrap items-center gap-2">
            <StageBadge stage={task.stage} />
            <span className="text-xs text-muted-foreground">
              {task.assignees.length > 0
                ? `Assigned to ${task.assignees.map((a) => a.name ?? a.email).join(", ")}`
                : "Unassigned"}
            </span>
          </div>
        )}

        <div>
          <h3 className="mb-2 text-sm font-medium text-muted-foreground">Progress updates</h3>
          <div className="flex flex-col gap-2">
            {updates?.length === 0 && <p className="text-sm text-muted-foreground">No updates yet.</p>}
            {updates?.map((u) => (
              <div key={u.id} className="rounded-lg border border-border p-3 text-sm">
                <div className="mb-1 flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">{u.author.name ?? u.author.email}</span>
                  {u.percent_complete !== null && <span>{u.percent_complete}% complete</span>}
                  <span>{new Date(u.created_at).toLocaleString()}</span>
                </div>
                <p>{u.note}</p>
              </div>
            ))}
          </div>
        </div>

        {canPostProgress && (
          <form onSubmit={postUpdate} className="flex flex-col gap-2 border-t border-border pt-3">
            <Textarea placeholder="What's the update?" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min={0}
                max={100}
                placeholder="% complete"
                value={percent}
                onChange={(e) => setPercent(e.target.value)}
                className="w-32"
              />
              <Button type="submit" size="sm" disabled={!note.trim()}>
                Post update
              </Button>
            </div>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
