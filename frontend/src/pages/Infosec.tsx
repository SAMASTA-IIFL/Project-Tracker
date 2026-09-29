import { useEffect, useState, type FormEvent } from "react";
import { useParams } from "react-router-dom";
import { Copy, Download, Plus, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { currentRole } from "@/lib/roles";
import {
  INFOSEC_ITEM_STATUSES,
  type InfosecChecklistComment,
  type InfosecChecklistItem,
  type InfosecChecklistTemplate,
  type InfosecItemActivity,
  type InfosecItemStatus,
  type InfosecVAPTReport,
  type ProductDetail,
} from "@/lib/types";
import { INFOSEC_STATUS_META } from "@/lib/infosecMeta";
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

export function InfosecPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const [product, setProduct] = useState<ProductDetail | null>(null);
  const [templates, setTemplates] = useState<InfosecChecklistTemplate[] | null>(null);
  const [items, setItems] = useState<InfosecChecklistItem[] | null>(null);
  const [reports, setReports] = useState<InfosecVAPTReport[] | null>(null);
  const [showUploadReport, setShowUploadReport] = useState(false);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);

  const role = currentRole(product, user?.id);
  const isAdmin = user?.global_role === "ADMIN";
  const canManage = role === "PM" || isAdmin;

  useEffect(() => {
    if (!id) return;
    api.get<ProductDetail>(`/api/products/${id}`).then(setProduct);
    refreshItems();
    refreshReports();
    refreshTemplates();
  }, [id]);

  function refreshItems() {
    if (!id) return;
    api.get<InfosecChecklistItem[]>(`/api/products/${id}/infosec/items`).then(setItems);
  }

  function refreshReports() {
    if (!id) return;
    api.get<InfosecVAPTReport[]>(`/api/products/${id}/infosec/vapt-reports`).then(setReports);
  }

  function refreshTemplates() {
    api.get<InfosecChecklistTemplate[]>(`/api/infosec-templates`).then(setTemplates);
  }

  async function updateItem(item: InfosecChecklistItem, patch: { status?: InfosecItemStatus; assignee_id?: string | null }) {
    if (!id) return;
    try {
      const updated = await api.patch<InfosecChecklistItem>(`/api/products/${id}/infosec/items/${item.id}`, patch);
      setItems((prev) => prev?.map((i) => (i.id === updated.id ? updated : i)) ?? null);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not update item");
    }
  }

  if (!product || items === null || reports === null || templates === null) {
    return (
      <AppShell>
        <div className="mx-auto max-w-5xl px-4 py-10">
          <p className="text-sm text-muted-foreground">Loading...</p>
        </div>
      </AppShell>
    );
  }

  const stage1Items = items.filter((i) => i.stage === 1);
  const roundsDesc = [...reports].sort((a, b) => b.round - a.round);
  const itemsForRound = (round: number) => items.filter((i) => i.stage === 2 && i.round === round);
  const selectedItem = items.find((i) => i.id === selectedItemId) ?? null;

  return (
    <AppShell>
      <div className="mx-auto max-w-5xl px-4 py-10">
        <ModuleNav productId={id!} productName={product.name} active="infosec" />

        <div className="mb-6">
          <h1 className="text-title-3">Infosec</h1>
          <p className="text-sm text-muted-foreground">
            Stage 1 is the internal check before handoff. Stage 2 tracks VAPT findings across retest rounds.
          </p>
        </div>

        {isAdmin && (
          <ChecklistBankPanel templates={templates} onChanged={refreshTemplates} />
        )}

        {canManage && (
          <ApplyTemplatePanel
            productId={id!}
            templates={templates}
            onApplied={(newItems) => setItems((prev) => [...(prev ?? []), ...newItems])}
            onTemplatesChanged={refreshTemplates}
          />
        )}

        <Card className="mb-4">
          <CardHeader>
            <CardTitle className="text-sm">Stage 1 — Internal checklist</CardTitle>
            <CardDescription>Worked through before handing off to the infosec team for VAPT.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {stage1Items.length === 0 && (
              <p className="text-sm text-muted-foreground">
                No checklist items yet — apply a template above{canManage ? " or add one manually below" : ""}.
              </p>
            )}
            {stage1Items.map((item) => (
              <ChecklistItemRow
                key={item.id}
                item={item}
                members={product.members}
                currentUserId={user?.id}
                canManage={canManage}
                onStatusChange={(status) => updateItem(item, { status })}
                onAssigneeChange={(assigneeId) => updateItem(item, { assignee_id: assigneeId || null })}
                onOpen={() => setSelectedItemId(item.id)}
              />
            ))}
            {canManage && (
              <AddItemsPanel
                productId={id!}
                stage={1}
                round={1}
                members={product.members}
                onCreated={(created) => setItems((prev) => [...(prev ?? []), ...created])}
              />
            )}
          </CardContent>
        </Card>

        <Card className="mb-4">
          <CardHeader className="flex-row items-center justify-between gap-2 space-y-0">
            <div>
              <CardTitle className="text-sm">Stage 2 — VAPT findings</CardTitle>
              <CardDescription>Each uploaded report starts a new round; still-open points carry forward.</CardDescription>
            </div>
            {canManage && (
              <Button type="button" size="sm" variant="outline" className="gap-1.5 shrink-0" onClick={() => setShowUploadReport((v) => !v)}>
                <Upload className="h-3.5 w-3.5" />
                Upload VAPT report
              </Button>
            )}
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {showUploadReport && (
              <UploadVaptReportForm
                productId={id!}
                nextRound={(roundsDesc[0]?.round ?? 0) + 1}
                onUploaded={(report) => {
                  setReports((prev) => [...(prev ?? []), report]);
                  setShowUploadReport(false);
                }}
              />
            )}

            {roundsDesc.length === 0 ? (
              <p className="text-sm text-muted-foreground">No VAPT report uploaded yet.</p>
            ) : (
              roundsDesc.map((report, idx) => {
                const roundItems = itemsForRound(report.round);
                const previousRound = roundsDesc[idx + 1];
                return (
                  <div key={report.id} className="flex flex-col gap-3 rounded-lg border border-border p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <span className="text-sm font-medium">Round {report.round}</span>
                        <span className="ml-2 text-xs text-muted-foreground">
                          {report.uploaded_by.name ?? report.uploaded_by.email} ·{" "}
                          {new Date(report.uploaded_at).toLocaleDateString()}
                        </span>
                      </div>
                      <a
                        href={`${API_URL}${report.file_url}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs text-muted-foreground underline hover:text-foreground"
                      >
                        View report
                      </a>
                    </div>
                    {report.notes && <p className="text-sm text-muted-foreground">{report.notes}</p>}

                    <div className="flex flex-col gap-2">
                      {roundItems.length === 0 && (
                        <p className="text-sm text-muted-foreground">No open points added for this round yet.</p>
                      )}
                      {roundItems.map((item) => (
                        <ChecklistItemRow
                          key={item.id}
                          item={item}
                          members={product.members}
                          currentUserId={user?.id}
                          canManage={canManage}
                          onStatusChange={(status) => updateItem(item, { status })}
                          onAssigneeChange={(assigneeId) => updateItem(item, { assignee_id: assigneeId || null })}
                          onOpen={() => setSelectedItemId(item.id)}
                        />
                      ))}
                    </div>

                    {canManage && (
                      <AddItemsPanel
                        productId={id!}
                        stage={2}
                        round={report.round}
                        vaptReportId={report.id}
                        members={product.members}
                        previousRoundItems={previousRound ? itemsForRound(previousRound.round) : undefined}
                        onCreated={(created) => setItems((prev) => [...(prev ?? []), ...created])}
                      />
                    )}
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>

        {selectedItem && (
          <InfosecItemDetail
            productId={id!}
            item={selectedItem}
            members={product.members}
            currentUserId={user?.id}
            canManage={canManage}
            onClose={() => setSelectedItemId(null)}
            onStatusChange={(status) => updateItem(selectedItem, { status })}
            onAssigneeChange={(assigneeId) => updateItem(selectedItem, { assignee_id: assigneeId || null })}
          />
        )}
      </div>
    </AppShell>
  );
}

function ChecklistItemRow({
  item,
  members,
  currentUserId,
  canManage,
  onStatusChange,
  onAssigneeChange,
  onOpen,
}: {
  item: InfosecChecklistItem;
  members: ProductDetail["members"];
  currentUserId: string | undefined;
  canManage: boolean;
  onStatusChange: (status: InfosecItemStatus) => void;
  onAssigneeChange: (assigneeId: string) => void;
  onOpen: () => void;
}) {
  const canUpdateStatus = canManage || item.assignee?.id === currentUserId;

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border px-3 py-2 text-sm sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
      <div className="flex min-w-0 flex-col gap-0.5">
        <button type="button" onClick={onOpen} className="text-left font-medium hover:underline">
          {item.title}
        </button>
        {item.description && <span className="text-xs text-muted-foreground">{item.description}</span>}
      </div>
      <div className="flex flex-wrap items-center gap-2 sm:shrink-0">
        {item.category && (
          <span className="rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground">{item.category}</span>
        )}
        {canManage ? (
          <Select
            value={item.assignee?.id ?? ""}
            onChange={(e) => onAssigneeChange(e.target.value)}
            className="h-7 w-full text-xs sm:w-36"
          >
            <option value="">Unassigned</option>
            {members.map((m) => (
              <option key={m.user.id} value={m.user.id}>
                {m.user.name ?? m.user.email}
              </option>
            ))}
          </Select>
        ) : (
          item.assignee && <span className="text-xs text-muted-foreground">{item.assignee.name ?? item.assignee.email}</span>
        )}
        {canUpdateStatus ? (
          <Select
            value={item.status}
            onChange={(e) => onStatusChange(e.target.value as InfosecItemStatus)}
            className="h-7 w-full text-xs sm:w-32"
          >
            {INFOSEC_ITEM_STATUSES.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </Select>
        ) : (
          <span className={cn("rounded-full border px-2 py-0.5 text-xs", INFOSEC_STATUS_META[item.status].badge)}>
            {INFOSEC_STATUS_META[item.status].label}
          </span>
        )}
      </div>
    </div>
  );
}

function InfosecItemDetail({
  productId,
  item,
  members,
  currentUserId,
  canManage,
  onClose,
  onStatusChange,
  onAssigneeChange,
}: {
  productId: string;
  item: InfosecChecklistItem;
  members: ProductDetail["members"];
  currentUserId: string | undefined;
  canManage: boolean;
  onClose: () => void;
  onStatusChange: (status: InfosecItemStatus) => void;
  onAssigneeChange: (assigneeId: string) => void;
}) {
  const [activity, setActivity] = useState<InfosecItemActivity[] | null>(null);
  const [comments, setComments] = useState<InfosecChecklistComment[] | null>(null);
  const [commentText, setCommentText] = useState("");

  const canUpdateStatus = canManage || item.assignee?.id === currentUserId;

  useEffect(() => {
    api.get<InfosecChecklistComment[]>(`/api/products/${productId}/infosec/items/${item.id}/comments`).then(setComments);
  }, [productId, item.id]);

  useEffect(() => {
    // Re-fetches whenever the item's status changes (including from this
    // same panel) so the history shown here doesn't go stale mid-session —
    // status is the only field update_item logs as an activity event.
    api.get<InfosecItemActivity[]>(`/api/products/${productId}/infosec/items/${item.id}/activity`).then(setActivity);
  }, [productId, item.id, item.status]);

  async function postComment(e: FormEvent) {
    e.preventDefault();
    if (!commentText.trim()) return;
    try {
      const comment = await api.post<InfosecChecklistComment>(
        `/api/products/${productId}/infosec/items/${item.id}/comments`,
        { text: commentText },
      );
      setComments((prev) => [...(prev ?? []), comment]);
      setCommentText("");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not post comment");
    }
  }

  function describeActivity(a: InfosecItemActivity): string {
    const who = a.actor.name ?? a.actor.email;
    if (a.event_type === "INFOSEC_ITEM_ADDED") return `${who} added this item`;
    if (a.event_type === "INFOSEC_ITEM_STATUS_CHANGED" && a.status) {
      return `${who} changed status to ${INFOSEC_STATUS_META[a.status].label}`;
    }
    return `${who} ${a.event_type.replaceAll("_", " ").toLowerCase()}`;
  }

  return (
    <Card className="mt-6">
      <CardHeader className="flex-row items-start justify-between gap-2 space-y-0">
        <div>
          <CardTitle>{item.title}</CardTitle>
          <CardDescription>{item.description || "No description."}</CardDescription>
        </div>
        <Button type="button" variant="ghost" size="sm" onClick={onClose}>
          Close
        </Button>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {item.category && (
            <div className="flex flex-col gap-1.5">
              <Label>Category</Label>
              <span className="text-sm text-muted-foreground">{item.category}</span>
            </div>
          )}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="detail-assignee">Assignee</Label>
            {canManage ? (
              <Select id="detail-assignee" value={item.assignee?.id ?? ""} onChange={(e) => onAssigneeChange(e.target.value)}>
                <option value="">Unassigned</option>
                {members.map((m) => (
                  <option key={m.user.id} value={m.user.id}>
                    {m.user.name ?? m.user.email}
                  </option>
                ))}
              </Select>
            ) : (
              <span className="text-sm text-muted-foreground">
                {item.assignee ? (item.assignee.name ?? item.assignee.email) : "Unassigned"}
              </span>
            )}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="detail-status">Status</Label>
            {canUpdateStatus ? (
              <Select id="detail-status" value={item.status} onChange={(e) => onStatusChange(e.target.value as InfosecItemStatus)}>
                {INFOSEC_ITEM_STATUSES.map((s) => (
                  <option key={s.key} value={s.key}>
                    {s.label}
                  </option>
                ))}
              </Select>
            ) : (
              <span className={cn("w-fit rounded-full border px-2 py-0.5 text-xs", INFOSEC_STATUS_META[item.status].badge)}>
                {INFOSEC_STATUS_META[item.status].label}
              </span>
            )}
          </div>
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

type DraftItem = {
  key: string;
  title: string;
  description: string;
  category: string;
  assigneeId: string;
};

function newDraftItem(overrides: Partial<DraftItem> = {}): DraftItem {
  return { key: crypto.randomUUID(), title: "", description: "", category: "", assigneeId: "", ...overrides };
}

function AddItemsPanel({
  productId,
  stage,
  round,
  vaptReportId,
  members,
  previousRoundItems,
  onCreated,
}: {
  productId: string;
  stage: number;
  round: number;
  vaptReportId?: string;
  members: ProductDetail["members"];
  previousRoundItems?: InfosecChecklistItem[];
  onCreated: (items: InfosecChecklistItem[]) => void;
}) {
  const [drafts, setDrafts] = useState<DraftItem[]>([]);
  const [creating, setCreating] = useState(false);

  const stillOpenFromPrevious = previousRoundItems?.filter((i) => i.status !== "VERIFIED") ?? [];

  function copyFromPrevious() {
    setDrafts((prev) => [
      ...prev,
      ...stillOpenFromPrevious.map((i) =>
        newDraftItem({ title: i.title, description: i.description ?? "", category: i.category ?? "" }),
      ),
    ]);
  }

  function updateDraft(key: string, patch: Partial<DraftItem>) {
    setDrafts((prev) => prev.map((d) => (d.key === key ? { ...d, ...patch } : d)));
  }

  function removeDraft(key: string) {
    setDrafts((prev) => prev.filter((d) => d.key !== key));
  }

  async function createAll() {
    const ready = drafts.filter((d) => d.title.trim());
    if (ready.length === 0) return;
    setCreating(true);
    try {
      const created: InfosecChecklistItem[] = [];
      for (const d of ready) {
        const item = await api.post<InfosecChecklistItem>(`/api/products/${productId}/infosec/items`, {
          title: d.title,
          description: d.description || null,
          category: d.category || null,
          stage,
          round,
          vapt_report_id: vaptReportId ?? null,
          assignee_id: d.assigneeId || null,
        });
        created.push(item);
      }
      onCreated(created);
      setDrafts([]);
      toast.success(`Added ${created.length} item${created.length === 1 ? "" : "s"}`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not add items");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="flex flex-col gap-2 border-t border-border pt-3">
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={() => setDrafts((p) => [...p, newDraftItem()])}>
          <Plus className="h-3.5 w-3.5" />
          {stage === 1 ? "Add item" : "Add open point"}
        </Button>
        {stillOpenFromPrevious.length > 0 && (
          <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={copyFromPrevious}>
            <Copy className="h-3.5 w-3.5" />
            Copy {stillOpenFromPrevious.length} still-open item{stillOpenFromPrevious.length === 1 ? "" : "s"} from previous round
          </Button>
        )}
      </div>

      {drafts.map((d) => (
        <div key={d.key} className="flex flex-col gap-2 rounded-lg border border-border p-3">
          <div className="flex items-start gap-2">
            <Input
              placeholder="Item title"
              value={d.title}
              onChange={(e) => updateDraft(d.key, { title: e.target.value })}
              className="flex-1"
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-9 w-9 shrink-0"
              onClick={() => removeDraft(d.key)}
              aria-label="Remove draft item"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
          <Textarea
            placeholder="Description (optional)"
            rows={2}
            value={d.description}
            onChange={(e) => updateDraft(d.key, { description: e.target.value })}
          />
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <Input
              placeholder="Category (optional)"
              value={d.category}
              onChange={(e) => updateDraft(d.key, { category: e.target.value })}
              className="text-xs"
            />
            <Select value={d.assigneeId} onChange={(e) => updateDraft(d.key, { assigneeId: e.target.value })} className="text-xs">
              <option value="">Unassigned</option>
              {members.map((m) => (
                <option key={m.user.id} value={m.user.id}>
                  {m.user.name ?? m.user.email}
                </option>
              ))}
            </Select>
          </div>
        </div>
      ))}

      {drafts.length > 0 && (
        <Button type="button" size="sm" disabled={creating || !drafts.some((d) => d.title.trim())} onClick={createAll} className="self-start">
          {creating ? "Adding..." : `Add ${drafts.filter((d) => d.title.trim()).length} item(s)`}
        </Button>
      )}
    </div>
  );
}

const NEW_TEMPLATE_OPTION = "__new__";

function downloadChecklistCsvTemplate() {
  const csvContent = [
    "title,description,category",
    "Enforce HTTPS everywhere,All endpoints redirect http to https,Transport",
    "Sanitize all user input,Prevent XSS and SQL injection,Input Handling",
  ].join("\n");
  const blob = new Blob([csvContent], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "infosec-checklist-template.csv";
  a.click();
  URL.revokeObjectURL(url);
}

function ApplyTemplatePanel({
  productId,
  templates,
  onApplied,
  onTemplatesChanged,
}: {
  productId: string;
  templates: InfosecChecklistTemplate[];
  onApplied: (items: InfosecChecklistItem[]) => void;
  onTemplatesChanged: () => void;
}) {
  const [templateId, setTemplateId] = useState("");
  const [busy, setBusy] = useState(false);

  async function apply() {
    if (!templateId || templateId === NEW_TEMPLATE_OPTION) return;
    setBusy(true);
    try {
      const items = await api.post<InfosecChecklistItem[]>(`/api/products/${productId}/infosec/apply-template`, {
        template_id: templateId,
      });
      onApplied(items);
      toast.success(`Applied ${items.length} checklist item${items.length === 1 ? "" : "s"} to Stage 1`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not apply template");
    } finally {
      setBusy(false);
    }
  }

  if (templateId === NEW_TEMPLATE_OPTION) {
    return (
      <NewTemplateInlineForm
        templates={templates}
        onCancel={() => setTemplateId("")}
        onCreated={(template) => {
          onTemplatesChanged();
          setTemplateId(template.id);
          toast.success(`"${template.name}" created — click Apply to add it to Stage 1`);
        }}
      />
    );
  }

  return (
    <Card className="mb-4">
      <CardContent className="flex flex-wrap items-end gap-2 py-4">
        <div className="flex flex-1 flex-col gap-1.5">
          <Label htmlFor="apply-template">Apply a checklist template to Stage 1</Label>
          <Select id="apply-template" value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
            <option value="">Choose a template...</option>
            <option value={NEW_TEMPLATE_OPTION}>+ Create new checklist...</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} ({t.item_count} item{t.item_count === 1 ? "" : "s"})
              </option>
            ))}
          </Select>
        </div>
        <Button type="button" disabled={!templateId || templateId === NEW_TEMPLATE_OPTION || busy} onClick={apply}>
          Apply
        </Button>
      </CardContent>
    </Card>
  );
}

type TemplateDraftItem = {
  key: string;
  title: string;
  description: string;
  category: string;
};

function newTemplateDraftItem(): TemplateDraftItem {
  return { key: crypto.randomUUID(), title: "", description: "", category: "" };
}

function NewTemplateInlineForm({
  templates,
  onCreated,
  onCancel,
}: {
  templates: InfosecChecklistTemplate[];
  onCreated: (template: InfosecChecklistTemplate) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [method, setMethod] = useState<"manual" | "csv">("manual");
  const [drafts, setDrafts] = useState<TemplateDraftItem[]>([newTemplateDraftItem()]);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);

  function updateDraft(key: string, patch: Partial<TemplateDraftItem>) {
    setDrafts((prev) => prev.map((d) => (d.key === key ? { ...d, ...patch } : d)));
  }

  function removeDraft(key: string) {
    setDrafts((prev) => prev.filter((d) => d.key !== key));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    if (method === "manual" && !drafts.some((d) => d.title.trim())) {
      toast.error("Add at least one item");
      return;
    }
    if (method === "csv" && !file) {
      toast.error("Choose a CSV file");
      return;
    }
    const duplicate = templates.some((t) => t.name.trim().toLowerCase() === name.trim().toLowerCase());
    if (duplicate && !window.confirm(`A checklist named "${name.trim()}" already exists in the bank. Create another one with the same name anyway?`)) {
      return;
    }
    setBusy(true);
    try {
      const template = await api.post<InfosecChecklistTemplate>(`/api/infosec-templates`, {
        name,
        description: description || null,
      });
      if (method === "manual") {
        for (const d of drafts.filter((d) => d.title.trim())) {
          await api.post(`/api/infosec-templates/${template.id}/items`, {
            title: d.title,
            description: d.description || null,
            category: d.category || null,
          });
        }
      } else if (file) {
        const form = new FormData();
        form.append("file", file);
        await api.post(`/api/infosec-templates/${template.id}/items/csv`, form);
      }
      onCreated(template);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not create checklist");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="mb-4">
      <CardHeader>
        <CardTitle className="text-sm">Create new checklist</CardTitle>
        <CardDescription>Build a reusable template — applying it here also makes it available to every other product.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <Input placeholder="Checklist name" required value={name} onChange={(e) => setName(e.target.value)} />
            <Input placeholder="Description (optional)" value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>

          <div className="flex self-start rounded-md border border-border p-0.5">
            <Button
              type="button"
              size="sm"
              variant={method === "manual" ? "default" : "ghost"}
              onClick={() => setMethod("manual")}
            >
              Manual entry
            </Button>
            <Button
              type="button"
              size="sm"
              variant={method === "csv" ? "default" : "ghost"}
              onClick={() => setMethod("csv")}
            >
              Upload CSV
            </Button>
          </div>

          {method === "manual" ? (
            <div className="flex flex-col gap-2">
              {drafts.map((d) => (
                <div key={d.key} className="flex flex-col gap-2 rounded-lg border border-border p-3">
                  <div className="flex items-start gap-2">
                    <Input
                      placeholder="Item title"
                      value={d.title}
                      onChange={(e) => updateDraft(d.key, { title: e.target.value })}
                      className="flex-1"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-9 w-9 shrink-0"
                      onClick={() => removeDraft(d.key)}
                      aria-label="Remove item"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <Input
                      placeholder="Description (optional)"
                      value={d.description}
                      onChange={(e) => updateDraft(d.key, { description: e.target.value })}
                      className="text-xs"
                    />
                    <Input
                      placeholder="Category (optional)"
                      value={d.category}
                      onChange={(e) => updateDraft(d.key, { category: e.target.value })}
                      className="text-xs"
                    />
                  </div>
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1.5 self-start"
                onClick={() => setDrafts((prev) => [...prev, newTemplateDraftItem()])}
              >
                <Plus className="h-3.5 w-3.5" />
                Add item
              </Button>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1.5 self-start"
                onClick={downloadChecklistCsvTemplate}
              >
                <Download className="h-3.5 w-3.5" />
                Download CSV template
              </Button>
              <Input type="file" accept=".csv,text/csv" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
              <p className="text-xs text-muted-foreground">Columns: title (required), description, category (both optional).</p>
            </div>
          )}

          <div className="flex gap-2">
            <Button type="submit" disabled={busy}>
              {busy ? "Creating..." : "Create checklist"}
            </Button>
            <Button type="button" variant="ghost" onClick={onCancel}>
              Cancel
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function ChecklistBankPanel({
  templates,
  onChanged,
}: {
  templates: InfosecChecklistTemplate[];
  onChanged: () => void;
}) {
  const [showNew, setShowNew] = useState(false);

  return (
    <Card className="mb-4 border-dashed">
      <CardHeader className="flex-row items-center justify-between gap-2 space-y-0">
        <div>
          <CardTitle className="text-sm">Checklist bank</CardTitle>
          <CardDescription>Admin only — reusable templates any product's Infosec page can apply.</CardDescription>
        </div>
        <Button type="button" variant="outline" size="sm" className="gap-1.5 shrink-0" onClick={() => setShowNew((v) => !v)}>
          <Plus className="h-3.5 w-3.5" />
          New template
        </Button>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {showNew && (
          <NewTemplateForm
            onCreated={() => {
              setShowNew(false);
              onChanged();
            }}
          />
        )}
        {templates.length === 0 && <p className="text-sm text-muted-foreground">No templates yet.</p>}
        {templates.map((t) => (
          <TemplateRow key={t.id} template={t} onChanged={onChanged} />
        ))}
      </CardContent>
    </Card>
  );
}

function NewTemplateForm({ onCreated }: { onCreated: () => void }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post(`/api/infosec-templates`, { name, description: description || null });
      toast.success("Template created — upload a CSV of items next");
      onCreated();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not create template");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-2 rounded-lg border border-border p-3">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <Input placeholder="Template name" required value={name} onChange={(e) => setName(e.target.value)} />
        <Input placeholder="Description (optional)" value={description} onChange={(e) => setDescription(e.target.value)} />
      </div>
      <Button type="submit" size="sm" disabled={busy} className="self-start">
        Create template
      </Button>
    </form>
  );
}

function TemplateRow({ template, onChanged }: { template: InfosecChecklistTemplate; onChanged: () => void }) {
  const [uploading, setUploading] = useState(false);

  async function handleFile(file: File) {
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const titles = await api.post<string[]>(`/api/infosec-templates/${template.id}/items/csv`, form);
      toast.success(`Added ${titles.length} item${titles.length === 1 ? "" : "s"} to "${template.name}"`);
      onChanged();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not upload CSV");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border px-3 py-2 text-sm">
      <div>
        <span className="font-medium">{template.name}</span>
        <span className="ml-2 text-xs text-muted-foreground">
          {template.item_count} item{template.item_count === 1 ? "" : "s"}
        </span>
        {template.description && <p className="text-xs text-muted-foreground">{template.description}</p>}
      </div>
      <label className="flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
        <Upload className="h-3.5 w-3.5" />
        {uploading ? "Uploading..." : "Upload CSV (title, description, category)"}
        <input
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          disabled={uploading}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFile(file);
            e.target.value = "";
          }}
        />
      </label>
    </div>
  );
}

function UploadVaptReportForm({
  productId,
  nextRound,
  onUploaded,
}: {
  productId: string;
  nextRound: number;
  onUploaded: (report: InfosecVAPTReport) => void;
}) {
  const [notes, setNotes] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!file) return;
    setBusy(true);
    try {
      const form = new FormData();
      if (notes) form.append("notes", notes);
      form.append("file", file);
      const report = await api.post<InfosecVAPTReport>(`/api/products/${productId}/infosec/vapt-reports`, form);
      onUploaded(report);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not upload VAPT report");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3 rounded-lg border border-border p-3">
      <p className="text-sm font-medium">Upload report — starts Round {nextRound}</p>
      <Textarea placeholder="Notes (optional)" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
      <Input type="file" required onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
      <Button type="submit" disabled={busy} className="self-start">
        Upload
      </Button>
    </form>
  );
}
