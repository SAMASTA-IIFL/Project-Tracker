import { useEffect, useState, type FormEvent } from "react";
import { useParams } from "react-router-dom";
import { Copy, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { currentRole } from "@/lib/roles";
import {
  UAT_RESULTS,
  type BRD,
  type ProductDetail,
  type UATCycle,
  type UATFeedback,
  type UATFeedbackActivity,
  type UATResult,
} from "@/lib/types";
import { BUG_STATUS_META, UAT_RESULT_META } from "@/lib/uatMeta";
import { SELECTED_ROW_ACTIVE, SELECTED_ROW_INACTIVE } from "@/lib/selectedRow";
import { AppShell } from "@/components/AppShell";
import { ModuleNav } from "@/components/ModuleNav";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

const API_URL = import.meta.env.VITE_API_URL as string;

// Same bullet/numbering-strip logic app/ai.py's _lines_from_section already
// uses server-side to turn a BRD section's free text into discrete task
// suggestions for Planning — replicated client-side here so importing
// acceptance criteria into a UAT cycle doesn't need a new backend endpoint.
function splitAcceptanceCriteria(text: string): string[] {
  return text
    .split(/\r?\n+/)
    .map((line) => line.replace(/^[\s\-*•\d.)]+/, "").trim())
    .filter(Boolean);
}

export function UatPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const [product, setProduct] = useState<ProductDetail | null>(null);
  const [cycles, setCycles] = useState<UATCycle[] | null>(null);
  const [brds, setBrds] = useState<BRD[] | null>(null);
  const [feedback, setFeedback] = useState<UATFeedback[] | null>(null);
  const [selectedFeedbackId, setSelectedFeedbackId] = useState<string | null>(null);

  const role = currentRole(product, user?.id);
  const isAdmin = user?.global_role === "ADMIN";
  const canManage = role === "PM" || isAdmin;

  useEffect(() => {
    if (!id) return;
    api.get<ProductDetail>(`/api/products/${id}`).then(setProduct);
    api.get<BRD[]>(`/api/products/${id}/brd`).then(setBrds);
    refreshCycles();
  }, [id]);

  function refreshCycles() {
    if (!id) return;
    api.get<UATCycle[]>(`/api/products/${id}/uat/cycles`).then(setCycles);
  }

  const openCycle = cycles?.find((c) => c.status === "OPEN") ?? null;

  useEffect(() => {
    if (!id || !openCycle) {
      setFeedback(null);
      return;
    }
    api.get<UATFeedback[]>(`/api/products/${id}/uat/cycles/${openCycle.id}/feedback`).then(setFeedback);
  }, [id, openCycle?.id]);

  async function closeCycle() {
    if (!id || !openCycle) return;
    const summary = `${openCycle.pending_count} still pending, ${openCycle.fail_count} failed`;
    if (!window.confirm(`Close this UAT cycle? (${summary}) This moves the product on to bug fix.`)) return;
    try {
      await api.post(`/api/products/${id}/uat/cycles/${openCycle.id}/close`);
      setSelectedFeedbackId(null);
      refreshCycles();
      toast.success("UAT cycle closed");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not close cycle");
    }
  }

  if (!product || cycles === null || brds === null) {
    return (
      <AppShell>
        <div className="mx-auto max-w-6xl px-4 py-10">
          <p className="text-sm text-muted-foreground">Loading...</p>
        </div>
      </AppShell>
    );
  }

  const latestBrd = brds.length > 0 ? brds.reduce((a, b) => (a.version > b.version ? a : b)) : null;
  const approvedBrd = latestBrd?.status === "APPROVED" ? latestBrd : null;
  const closedCycles = cycles.filter((c) => c.status === "CLOSED");
  // cycles are returned newest-first, so the first CLOSED entry is the most
  // recently closed one — the natural "previous cycle" to copy failures from.
  const previousClosedCycle = closedCycles[0] ?? null;
  const selectedFeedback = feedback?.find((f) => f.id === selectedFeedbackId) ?? null;

  return (
    <AppShell>
      <div className="mx-auto max-w-5xl px-4 py-10">
        <ModuleNav productId={id!} productName={product.name} active="uat" />

        <div className="mb-6">
          <h1 className="text-title-3">UAT</h1>
          <p className="text-sm text-muted-foreground">
            Stakeholders test acceptance criteria against a version and record Pass, Fail, or a comment.
          </p>
        </div>

        {!openCycle ? (
          canManage ? (
            <StartCyclePanel
              productId={id!}
              approvedBrd={approvedBrd}
              previousClosedCycle={previousClosedCycle}
              onCreated={refreshCycles}
            />
          ) : (
            <Card className="mb-4 border-dashed">
              <CardContent className="py-10 text-center text-sm text-muted-foreground">
                No UAT cycle is open right now.
              </CardContent>
            </Card>
          )
        ) : (
          <>
            <ReadinessTiles cycle={openCycle} />

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <Card>
                <CardHeader className="flex-row items-center justify-between gap-2 space-y-0">
                  <div>
                    <CardTitle className="text-sm">Version {openCycle.version}</CardTitle>
                    <CardDescription>Started {new Date(openCycle.started_at).toLocaleDateString()}</CardDescription>
                  </div>
                  {canManage && (
                    <Button type="button" variant="outline" size="sm" onClick={closeCycle}>
                      Close cycle
                    </Button>
                  )}
                </CardHeader>
                <CardContent className="flex flex-col gap-2">
                  {feedback === null && <p className="text-sm text-muted-foreground">Loading criteria...</p>}
                  {feedback?.length === 0 && (
                    <p className="text-sm text-muted-foreground">No criteria added to this cycle.</p>
                  )}
                  {feedback?.map((f) => (
                    <FeedbackRow
                      key={f.id}
                      item={f}
                      active={f.id === selectedFeedbackId}
                      onOpen={() => setSelectedFeedbackId(f.id)}
                    />
                  ))}
                  {canManage && (
                    <AddCriterionForm
                      productId={id!}
                      cycleId={openCycle.id}
                      onAdded={(f) => setFeedback((prev) => [...(prev ?? []), f])}
                    />
                  )}
                </CardContent>
              </Card>

              {selectedFeedback ? (
                <FeedbackDetail
                  productId={id!}
                  cycleId={openCycle.id}
                  item={selectedFeedback}
                  onClose={() => setSelectedFeedbackId(null)}
                  onUpdated={(updated) => {
                    setFeedback((prev) => prev?.map((f) => (f.id === updated.id ? updated : f)) ?? null);
                    refreshCycles();
                  }}
                />
              ) : (
                <Card className="border-dashed">
                  <CardContent className="flex h-full items-center justify-center py-10 text-center text-sm text-muted-foreground">
                    Select a criterion to view or edit its result.
                  </CardContent>
                </Card>
              )}
            </div>
          </>
        )}

        {closedCycles.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium text-muted-foreground">Past cycles</CardTitle>
              <CardDescription>Read-only history — each closed cycle's final pass rate.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              {closedCycles.map((c) => {
                const passRate = c.total_count > 0 ? Math.round((c.pass_count / c.total_count) * 100) : 0;
                return (
                  <div
                    key={c.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border px-3 py-2 text-sm"
                  >
                    <span>Version {c.version}</span>
                    <span className="text-xs text-muted-foreground">
                      {passRate}% passed ({c.pass_count}/{c.total_count}) · closed{" "}
                      {c.closed_at ? new Date(c.closed_at).toLocaleDateString() : "—"}
                    </span>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        )}
      </div>
    </AppShell>
  );
}

const PENDING_BAR = "linear-gradient(90deg, #71717a, #a1a1aa)";
const FAIL_BAR = "linear-gradient(90deg, #fb7185, #ef4444)";

function ReadinessTiles({ cycle }: { cycle: UATCycle }) {
  const passRate = cycle.total_count > 0 ? Math.round((cycle.pass_count / cycle.total_count) * 100) : 0;
  return (
    <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
      <Tile label="Pass rate" value={`${passRate}%`} bar="var(--grad-uat)" gradientText />
      <Tile label="Passed" value={String(cycle.pass_count)} bar="var(--grad-uat)" />
      <Tile label="Failed" value={String(cycle.fail_count)} bar={FAIL_BAR} />
      <Tile label="Pending" value={String(cycle.pending_count)} bar={PENDING_BAR} />
    </div>
  );
}

function Tile({ label, value, bar, gradientText }: { label: string; value: string; bar: string; gradientText?: boolean }) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-2 py-4">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className={cn("text-3xl font-bold tracking-tight", gradientText && "gradient-text")} style={gradientText ? { backgroundImage: bar } : undefined}>
          {value}
        </p>
        <div className="h-1 w-full overflow-hidden rounded-full bg-muted">
          <div className="h-full w-full rounded-full" style={{ backgroundImage: bar }} />
        </div>
      </CardContent>
    </Card>
  );
}

function FeedbackRow({ item, active, onOpen }: { item: UATFeedback; active: boolean; onOpen: () => void }) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-between gap-3 rounded-lg border px-3 py-2 text-sm",
        active ? SELECTED_ROW_ACTIVE : SELECTED_ROW_INACTIVE,
      )}
    >
      <div className="flex min-w-0 flex-col gap-0.5">
        <button type="button" onClick={onOpen} className="text-left font-medium hover:underline">
          {item.criterion}
        </button>
        {item.linked_bug && (
          <span className="text-xs text-muted-foreground">
            Bug filed: {item.linked_bug.title} ({BUG_STATUS_META[item.linked_bug.status].label})
          </span>
        )}
      </div>
      <span className={cn("shrink-0 rounded-full border px-2 py-0.5 text-xs", UAT_RESULT_META[item.result].badge)}>
        {UAT_RESULT_META[item.result].label}
      </span>
    </div>
  );
}

function AddCriterionForm({
  productId,
  cycleId,
  onAdded,
}: {
  productId: string;
  cycleId: string;
  onAdded: (feedback: UATFeedback) => void;
}) {
  const [text, setText] = useState("");
  const [adding, setAdding] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    setAdding(true);
    try {
      const created = await api.post<UATFeedback>(`/api/products/${productId}/uat/cycles/${cycleId}/feedback`, {
        criterion: text,
      });
      onAdded(created);
      setText("");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not add criterion");
    } finally {
      setAdding(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex items-start gap-2 border-t border-border pt-3">
      <Textarea
        placeholder="Add another criterion to this cycle"
        rows={1}
        value={text}
        onChange={(e) => setText(e.target.value)}
        className="flex-1"
      />
      <Button type="submit" variant="outline" size="sm" disabled={adding || !text.trim()} className="shrink-0 gap-1.5">
        <Plus className="h-3.5 w-3.5" />
        Add
      </Button>
    </form>
  );
}

function FeedbackDetail({
  productId,
  cycleId,
  item,
  onClose,
  onUpdated,
}: {
  productId: string;
  cycleId: string;
  item: UATFeedback;
  onClose: () => void;
  onUpdated: (updated: UATFeedback) => void;
}) {
  const [result, setResult] = useState<UATResult>(item.result);
  const [notes, setNotes] = useState(item.notes ?? "");
  const [file, setFile] = useState<File | null>(null);
  const [activity, setActivity] = useState<UATFeedbackActivity[] | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [converting, setConverting] = useState(false);

  useEffect(() => {
    setResult(item.result);
    setNotes(item.notes ?? "");
    setFile(null);
  }, [item.id]);

  useEffect(() => {
    // Re-fetches whenever the item's result changes (including from this same
    // panel) so the activity feed shown here doesn't go stale mid-session —
    // Infosec's item detail panel needed the exact same fix once already
    // (keying its activity effect on item.status), so build it right here.
    api
      .get<UATFeedbackActivity[]>(`/api/products/${productId}/uat/cycles/${cycleId}/feedback/${item.id}/activity`)
      .then(setActivity);
  }, [productId, cycleId, item.id, item.result]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const form = new FormData();
      form.append("result", result);
      if (notes) form.append("notes", notes);
      if (file) form.append("file", file);
      const updated = await api.post<UATFeedback>(
        `/api/products/${productId}/uat/cycles/${cycleId}/feedback/${item.id}/submit`,
        form,
      );
      onUpdated(updated);
      setFile(null);
      toast.success("Feedback saved");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not save feedback");
    } finally {
      setSubmitting(false);
    }
  }

  async function convertToBug() {
    setConverting(true);
    try {
      await api.post(`/api/products/${productId}/uat/cycles/${cycleId}/feedback/${item.id}/convert-to-bug`);
      const refreshedList = await api.get<UATFeedback[]>(
        `/api/products/${productId}/uat/cycles/${cycleId}/feedback`,
      );
      const refreshed = refreshedList.find((f) => f.id === item.id);
      if (refreshed) onUpdated(refreshed);
      toast.success("Filed as a bug");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not convert to bug");
    } finally {
      setConverting(false);
    }
  }

  function describeActivity(a: UATFeedbackActivity): string {
    const who = a.actor.name ?? a.actor.email;
    if (a.event_type === "UAT_FEEDBACK_ADDED") return `${who} added this criterion`;
    if (a.event_type === "UAT_FEEDBACK_RESULT_CHANGED" && a.result) {
      return `${who} set result to ${UAT_RESULT_META[a.result].label}`;
    }
    if (a.event_type === "BUG_FILED_FROM_UAT") return `${who} filed this as a bug`;
    return `${who} ${a.event_type.replaceAll("_", " ").toLowerCase()}`;
  }

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-2 space-y-0">
        <div>
          <CardTitle>{item.criterion}</CardTitle>
          <CardDescription>
            Last updated by {item.author.name ?? item.author.email} · {new Date(item.updated_at).toLocaleString()}
          </CardDescription>
        </div>
        <Button type="button" variant="ghost" size="sm" onClick={onClose}>
          Close
        </Button>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <form onSubmit={submit} className="flex flex-col gap-3">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="feedback-result">Result</Label>
              <Select id="feedback-result" value={result} onChange={(e) => setResult(e.target.value as UATResult)}>
                {UAT_RESULTS.map((r) => (
                  <option key={r.key} value={r.key}>
                    {r.label}
                  </option>
                ))}
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="feedback-file">Screenshot (optional)</Label>
              <Input id="feedback-file" type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            </div>
          </div>
          <Textarea placeholder="Notes (optional)" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
          {item.file_url && (
            <a
              href={`${API_URL}${item.file_url}`}
              target="_blank"
              rel="noreferrer"
              className="self-start text-xs text-muted-foreground underline hover:text-foreground"
            >
              View attached screenshot
            </a>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <Button type="submit" size="sm" disabled={submitting}>
              {submitting ? "Saving..." : "Save result"}
            </Button>
            {item.linked_bug ? (
              <span className={cn("rounded-full border px-2 py-0.5 text-xs", BUG_STATUS_META[item.linked_bug.status].badge)}>
                Bug filed: {item.linked_bug.title}
              </span>
            ) : (
              item.result === "FAIL" && (
                <Button type="button" size="sm" variant="outline" disabled={converting} onClick={convertToBug}>
                  {converting ? "Converting..." : "Convert to bug"}
                </Button>
              )
            )}
          </div>
        </form>

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
      </CardContent>
    </Card>
  );
}

type DraftCriterion = { key: string; text: string };

function newDraftCriterion(text = ""): DraftCriterion {
  return { key: crypto.randomUUID(), text };
}

function StartCyclePanel({
  productId,
  approvedBrd,
  previousClosedCycle,
  onCreated,
}: {
  productId: string;
  approvedBrd: BRD | null;
  previousClosedCycle: UATCycle | null;
  onCreated: () => void;
}) {
  const [version, setVersion] = useState("");
  const [drafts, setDrafts] = useState<DraftCriterion[]>([]);
  const [creating, setCreating] = useState(false);
  const [copying, setCopying] = useState(false);

  function importFromBrd() {
    if (!approvedBrd) return;
    const lines = splitAcceptanceCriteria(approvedBrd.sections.acceptance_criteria);
    if (lines.length === 0) {
      toast.info("No acceptance criteria found on the approved BRD.");
      return;
    }
    setDrafts((prev) => [...prev, ...lines.map((l) => newDraftCriterion(l))]);
  }

  async function copyStillOpenFailures() {
    if (!previousClosedCycle) return;
    setCopying(true);
    try {
      const prevFeedback = await api.get<UATFeedback[]>(
        `/api/products/${productId}/uat/cycles/${previousClosedCycle.id}/feedback`,
      );
      const fails = prevFeedback.filter((f) => f.result === "FAIL");
      if (fails.length === 0) {
        toast.info("No open failures in the previous cycle.");
        return;
      }
      setDrafts((prev) => [...prev, ...fails.map((f) => newDraftCriterion(f.criterion))]);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not load previous cycle");
    } finally {
      setCopying(false);
    }
  }

  function updateDraft(key: string, text: string) {
    setDrafts((prev) => prev.map((d) => (d.key === key ? { ...d, text } : d)));
  }

  function removeDraft(key: string) {
    setDrafts((prev) => prev.filter((d) => d.key !== key));
  }

  async function createCycle() {
    const ready = drafts.filter((d) => d.text.trim());
    if (!version.trim() || ready.length === 0) return;
    setCreating(true);
    try {
      const cycle = await api.post<UATCycle>(`/api/products/${productId}/uat/cycles`, { version });
      for (const d of ready) {
        await api.post(`/api/products/${productId}/uat/cycles/${cycle.id}/feedback`, { criterion: d.text });
      }
      toast.success(`Opened UAT cycle ${cycle.version} with ${ready.length} criteri${ready.length === 1 ? "on" : "a"}`);
      setVersion("");
      setDrafts([]);
      onCreated();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not open UAT cycle");
    } finally {
      setCreating(false);
    }
  }

  return (
    <Card className="mb-4">
      <CardHeader>
        <CardTitle className="text-sm">Start a UAT cycle</CardTitle>
        <CardDescription>
          Name the version being tested and build the list of criteria stakeholders will check off.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <Input
          placeholder="Version (e.g. v1.4.0, Sprint 12 build)"
          value={version}
          onChange={(e) => setVersion(e.target.value)}
        />

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => setDrafts((p) => [...p, newDraftCriterion()])}
          >
            <Plus className="h-3.5 w-3.5" />
            Add criterion
          </Button>
          {approvedBrd && (
            <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={importFromBrd}>
              Import from BRD acceptance criteria
            </Button>
          )}
          {previousClosedCycle && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1.5"
              disabled={copying}
              onClick={copyStillOpenFailures}
            >
              <Copy className="h-3.5 w-3.5" />
              {copying ? "Loading..." : "Copy still-open failures from previous cycle"}
            </Button>
          )}
        </div>

        {drafts.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No criteria yet — add one manually{approvedBrd ? " or import from the BRD" : ""}.
          </p>
        )}
        {drafts.map((d) => (
          <div key={d.key} className="flex items-start gap-2">
            <Textarea
              placeholder="Acceptance criterion"
              rows={2}
              value={d.text}
              onChange={(e) => updateDraft(d.key, e.target.value)}
              className="flex-1"
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-9 w-9 shrink-0"
              onClick={() => removeDraft(d.key)}
              aria-label="Remove criterion"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        ))}

        {drafts.length > 0 && (
          <Button
            type="button"
            disabled={creating || !version.trim() || !drafts.some((d) => d.text.trim())}
            onClick={createCycle}
            className="self-start"
          >
            {creating
              ? "Opening..."
              : `Open cycle with ${drafts.filter((d) => d.text.trim()).length} criteri${
                  drafts.filter((d) => d.text.trim()).length === 1 ? "on" : "a"
                }`}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
