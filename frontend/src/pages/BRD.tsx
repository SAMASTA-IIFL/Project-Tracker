import { useEffect, useState, type FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import { Check, History, MessageSquare } from "lucide-react";
import { toast } from "sonner";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { currentRole } from "@/lib/roles";
import { BRD_SECTION_FIELDS, type BRD, type BRDComment, type BRDSections, type ProductDetail } from "@/lib/types";
import { BRD_STATUS_META } from "@/lib/brdStatus";
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

const EMPTY_SECTIONS: BRDSections = { objective: "", scope: "", requirements: "", acceptance_criteria: "" };

export function BRDPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const [product, setProduct] = useState<ProductDetail | null>(null);
  const [brds, setBrds] = useState<BRD[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [comments, setComments] = useState<BRDComment[]>([]);
  const [busy, setBusy] = useState(false);

  const [title, setTitle] = useState("");
  const [sections, setSections] = useState<BRDSections>(EMPTY_SECTIONS);
  const [dirty, setDirty] = useState(false);

  const [commentText, setCommentText] = useState("");
  const [commentSection, setCommentSection] = useState<string>("");
  const [changesNote, setChangesNote] = useState("");

  const role = currentRole(product, user?.id);
  const canAuthor = role === "PM";
  const canReview = role === "PM" || role === "STAKEHOLDER";

  useEffect(() => {
    if (!id) return;
    api.get<ProductDetail>(`/api/products/${id}`).then(setProduct);
    refreshBrds();
  }, [id]);

  function refreshBrds() {
    if (!id) return;
    api.get<BRD[]>(`/api/products/${id}/brd`).then((list) => {
      setBrds(list);
      if (list.length > 0) setSelectedId((prev) => prev ?? list[0].id);
    });
  }

  const selected = brds?.find((b) => b.id === selectedId) ?? null;
  const isLatest = brds && selected ? selected.version === Math.max(...brds.map((b) => b.version)) : false;

  useEffect(() => {
    if (selected) {
      setTitle(selected.title);
      setSections(selected.sections);
      setDirty(false);
    }
    if (id && selectedId) {
      api.get<BRDComment[]>(`/api/products/${id}/brd/${selectedId}/comments`).then(setComments);
    }
  }, [selectedId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!product || brds === null) {
    return (
      <AppShell>
        <div className="mx-auto max-w-4xl px-4 py-10">
          <p className="text-sm text-muted-foreground">Loading...</p>
        </div>
      </AppShell>
    );
  }

  const editable = isLatest && selected && (selected.status === "DRAFT" || selected.status === "CHANGES_REQUESTED");

  async function createBrd(e: FormEvent) {
    e.preventDefault();
    if (!id) return;
    setBusy(true);
    try {
      await api.post<BRD>(`/api/products/${id}/brd`, { title, sections });
      toast.success("BRD drafted");
      refreshBrds();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not create BRD");
    } finally {
      setBusy(false);
    }
  }

  async function saveDraft() {
    if (!id || !selected) return;
    setBusy(true);
    try {
      await api.patch<BRD>(`/api/products/${id}/brd/${selected.id}`, { title, sections });
      toast.success("Draft saved");
      setDirty(false);
      refreshBrds();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not save");
    } finally {
      setBusy(false);
    }
  }

  async function submitForReview() {
    if (!id || !selected) return;
    setBusy(true);
    try {
      if (dirty) await api.patch<BRD>(`/api/products/${id}/brd/${selected.id}`, { title, sections });
      await api.post(`/api/products/${id}/brd/${selected.id}/submit`);
      toast.success("Submitted for review");
      refreshBrds();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not submit");
    } finally {
      setBusy(false);
    }
  }

  async function approve() {
    if (!id || !selected) return;
    setBusy(true);
    try {
      await api.post(`/api/products/${id}/brd/${selected.id}/approve`);
      toast.success("BRD approved");
      refreshBrds();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not approve");
    } finally {
      setBusy(false);
    }
  }

  async function requestChanges() {
    if (!id || !selected) return;
    setBusy(true);
    try {
      await api.post(`/api/products/${id}/brd/${selected.id}/request-changes`, { note: changesNote || null });
      toast.success("Changes requested");
      setChangesNote("");
      refreshBrds();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not request changes");
    } finally {
      setBusy(false);
    }
  }

  async function startNewVersion() {
    if (!id || !selected) return;
    setBusy(true);
    try {
      const next = await api.post<BRD>(`/api/products/${id}/brd/${selected.id}/new-version`);
      toast.success(`Started version ${next.version}`);
      setBrds((prev) => [next, ...(prev ?? [])]);
      setSelectedId(next.id);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not start a new version");
    } finally {
      setBusy(false);
    }
  }

  async function addComment(e: FormEvent) {
    e.preventDefault();
    if (!id || !selected || !commentText.trim()) return;
    try {
      const comment = await api.post<BRDComment>(`/api/products/${id}/brd/${selected.id}/comments`, {
        text: commentText,
        section_anchor: commentSection || null,
      });
      setComments((prev) => [...prev, comment]);
      setCommentText("");
      setCommentSection("");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not add comment");
    }
  }

  async function toggleResolve(commentId: string) {
    if (!id || !selected) return;
    const updated = await api.post<BRDComment>(
      `/api/products/${id}/brd/${selected.id}/comments/${commentId}/resolve`,
    );
    setComments((prev) => prev.map((c) => (c.id === commentId ? updated : c)));
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-4xl px-4 py-10">
        <ModuleNav productId={id!} productName={product.name} active="brd" />

        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-title-3">Business Requirements Document</h1>
        </div>

        {brds.length === 0 ? (
          canAuthor ? (
            <Card>
              <CardHeader>
                <CardTitle>Draft the first BRD</CardTitle>
                <CardDescription>Fill out each section — you can save as a draft before submitting for review.</CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={createBrd} className="flex flex-col gap-4">
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="title">Title</Label>
                    <Input id="title" required value={title} onChange={(e) => setTitle(e.target.value)} />
                  </div>
                  <SectionFields sections={sections} onChange={setSections} />
                  <Button type="submit" disabled={busy} className="mt-2 self-start">
                    Create draft
                  </Button>
                </form>
              </CardContent>
            </Card>
          ) : (
            <Card className="border-dashed">
              <CardContent className="py-10 text-center text-sm text-muted-foreground">
                No BRD has been drafted yet.
              </CardContent>
            </Card>
          )
        ) : (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <div className="flex flex-col gap-4 lg:col-span-2">
              <Card>
                <CardHeader className="flex-row items-center justify-between gap-2 space-y-0">
                  <div>
                    <CardTitle>{selected?.title}</CardTitle>
                    <CardDescription>
                      Version {selected?.version} · {selected && new Date(selected.created_at).toLocaleDateString()}
                    </CardDescription>
                  </div>
                  {selected && (
                    <span
                      className={cn(
                        "shrink-0 rounded-full border px-2.5 py-1 text-xs font-medium",
                        BRD_STATUS_META[selected.status].badge,
                      )}
                    >
                      {BRD_STATUS_META[selected.status].label}
                    </span>
                  )}
                </CardHeader>
                <CardContent className="flex flex-col gap-4">
                  {editable && canAuthor ? (
                    <>
                      <div className="flex flex-col gap-1.5">
                        <Label htmlFor="edit-title">Title</Label>
                        <Input
                          id="edit-title"
                          value={title}
                          onChange={(e) => {
                            setTitle(e.target.value);
                            setDirty(true);
                          }}
                        />
                      </div>
                      <SectionFields
                        sections={sections}
                        onChange={(s) => {
                          setSections(s);
                          setDirty(true);
                        }}
                      />
                      <div className="flex gap-2">
                        <Button type="button" variant="outline" disabled={busy || !dirty} onClick={saveDraft}>
                          Save draft
                        </Button>
                        <Button type="button" disabled={busy} onClick={submitForReview}>
                          Submit for review
                        </Button>
                      </div>
                    </>
                  ) : (
                    <>
                      {BRD_SECTION_FIELDS.map((f) => (
                        <div key={f.key}>
                          <h3 className="mb-1 text-sm font-medium">{f.label}</h3>
                          <p className="whitespace-pre-wrap text-sm text-muted-foreground">
                            {selected?.sections[f.key] || "—"}
                          </p>
                        </div>
                      ))}

                      {isLatest && selected?.status === "IN_REVIEW" && canReview && (
                        <div className="flex flex-col gap-2 border-t border-border pt-4">
                          <Button type="button" disabled={busy} onClick={approve} className="gap-1.5 self-start">
                            <Check className="h-4 w-4" />
                            Approve
                          </Button>
                          <div className="flex flex-col gap-1.5">
                            <Label htmlFor="changes-note">Request changes (optional note)</Label>
                            <Textarea
                              id="changes-note"
                              rows={2}
                              value={changesNote}
                              onChange={(e) => setChangesNote(e.target.value)}
                            />
                            <Button type="button" variant="outline" disabled={busy} onClick={requestChanges} className="self-start">
                              Request changes
                            </Button>
                          </div>
                        </div>
                      )}

                      {isLatest && selected?.status === "APPROVED" && canAuthor && (
                        <Button type="button" variant="outline" disabled={busy} onClick={startNewVersion} className="self-start">
                          Start a new version
                        </Button>
                      )}
                    </>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
                    <MessageSquare className="h-4 w-4" />
                    Review comments
                  </CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col gap-3">
                  {comments.length === 0 && <p className="text-sm text-muted-foreground">No comments yet.</p>}
                  {comments.map((c) => (
                    <div key={c.id} className={cn("rounded-lg border border-border p-3", c.resolved && "opacity-60")}>
                      <div className="mb-1 flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <span className="font-medium text-foreground">{c.author.name ?? c.author.email}</span>
                          {c.section_anchor && (
                            <span className="rounded-full border border-border px-2 py-0.5">{c.section_anchor}</span>
                          )}
                          <span>{new Date(c.created_at).toLocaleString()}</span>
                        </div>
                        {canReview && (
                          <Button type="button" variant="ghost" size="sm" onClick={() => toggleResolve(c.id)}>
                            {c.resolved ? "Reopen" : "Resolve"}
                          </Button>
                        )}
                      </div>
                      <p className="text-sm">{c.text}</p>
                    </div>
                  ))}

                  {canReview && (
                    <form onSubmit={addComment} className="mt-2 flex flex-col gap-2 border-t border-border pt-3">
                      <div className="flex gap-2">
                        <Select
                          value={commentSection}
                          onChange={(e) => setCommentSection(e.target.value)}
                          className="w-48"
                        >
                          <option value="">General comment</option>
                          {BRD_SECTION_FIELDS.map((f) => (
                            <option key={f.key} value={f.key}>
                              {f.label}
                            </option>
                          ))}
                        </Select>
                      </div>
                      <Textarea
                        placeholder="Leave a review comment..."
                        rows={2}
                        value={commentText}
                        onChange={(e) => setCommentText(e.target.value)}
                      />
                      <Button type="submit" size="sm" className="self-start" disabled={!commentText.trim()}>
                        Comment
                      </Button>
                    </form>
                  )}
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
                  <History className="h-4 w-4" />
                  Version history
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-1.5">
                {brds.map((b) => (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => setSelectedId(b.id)}
                    className={cn(
                      "flex items-center justify-between rounded-lg border px-3 py-2 text-left text-sm transition-colors",
                      b.id === selectedId ? SELECTED_ROW_ACTIVE : SELECTED_ROW_INACTIVE,
                    )}
                  >
                    <span>Version {b.version}</span>
                    <span className={cn("rounded-full border px-2 py-0.5 text-xs", BRD_STATUS_META[b.status].badge)}>
                      {BRD_STATUS_META[b.status].label}
                    </span>
                  </button>
                ))}
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </AppShell>
  );
}

function SectionFields({ sections, onChange }: { sections: BRDSections; onChange: (s: BRDSections) => void }) {
  return (
    <>
      {BRD_SECTION_FIELDS.map((f) => (
        <div key={f.key} className="flex flex-col gap-1.5">
          <Label htmlFor={f.key}>{f.label}</Label>
          <Textarea
            id={f.key}
            rows={3}
            value={sections[f.key]}
            onChange={(e) => onChange({ ...sections, [f.key]: e.target.value })}
          />
        </div>
      ))}
    </>
  );
}
