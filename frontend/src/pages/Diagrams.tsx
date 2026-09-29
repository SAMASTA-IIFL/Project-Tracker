import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useParams } from "react-router-dom";
import { Minus, Plus, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { currentRole } from "@/lib/roles";
import type { ArchitectureDiagram, DiagramComment, ProductDetail } from "@/lib/types";
import { AppShell } from "@/components/AppShell";
import { ModuleNav } from "@/components/ModuleNav";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

const API_URL = import.meta.env.VITE_API_URL as string;
const isImage = (url: string) => /\.(png|jpe?g|gif|webp|svg)$/i.test(url);

export function DiagramsPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const [product, setProduct] = useState<ProductDetail | null>(null);
  const [diagrams, setDiagrams] = useState<ArchitectureDiagram[] | null>(null);
  const [showUpload, setShowUpload] = useState(false);
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const [viewerUrl, setViewerUrl] = useState<string | null>(null);

  const role = currentRole(product, user?.id);
  const canUpload = role === "PM" || role === "DELIVERY";

  useEffect(() => {
    if (!id) return;
    api.get<ProductDetail>(`/api/products/${id}`).then(setProduct);
    refresh();
  }, [id]);

  function refresh() {
    if (!id) return;
    api.get<ArchitectureDiagram[]>(`/api/products/${id}/diagrams`).then(setDiagrams);
  }

  const groups = useMemo(() => {
    if (!diagrams) return [];
    const byTitle = new Map<string, ArchitectureDiagram[]>();
    for (const d of diagrams) {
      const list = byTitle.get(d.title) ?? [];
      list.push(d);
      byTitle.set(d.title, list);
    }
    return Array.from(byTitle.entries()).map(([title, versions]) => ({
      title,
      versions: versions.sort((a, b) => b.version - a.version),
    }));
  }, [diagrams]);

  if (!product || diagrams === null) {
    return (
      <AppShell>
        <div className="mx-auto max-w-5xl px-4 py-10">
          <p className="text-sm text-muted-foreground">Loading...</p>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-5xl px-4 py-10">
        <ModuleNav productId={id!} productName={product.name} active="diagrams" />

        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-title-3">Architecture diagrams</h1>
          {canUpload && (
            <Button type="button" size="sm" className="gap-1.5" onClick={() => setShowUpload((v) => !v)}>
              <Upload className="h-4 w-4" />
              Upload diagram
            </Button>
          )}
        </div>

        {showUpload && (
          <UploadForm
            productId={id!}
            existingTitles={groups.map((g) => g.title)}
            onUploaded={() => {
              setShowUpload(false);
              refresh();
            }}
          />
        )}

        {groups.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              No diagrams uploaded yet.
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {groups.map((group) => {
              const latest = group.versions[0];
              return (
                <Card key={group.title} className="overflow-hidden">
                  <button
                    type="button"
                    onClick={() => (isImage(latest.file_url) ? setViewerUrl(latest.file_url) : window.open(`${API_URL}${latest.file_url}`, "_blank"))}
                    className="block aspect-video w-full overflow-hidden bg-muted"
                  >
                    {isImage(latest.file_url) ? (
                      <img src={`${API_URL}${latest.file_url}`} alt={latest.title} className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">
                        Open file
                      </div>
                    )}
                  </button>
                  <CardHeader>
                    <CardTitle className="text-sm">{group.title}</CardTitle>
                    <CardDescription>
                      v{latest.version} · {latest.uploaded_by.name ?? latest.uploaded_by.email} ·{" "}
                      {new Date(latest.created_at).toLocaleDateString()}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="flex flex-col gap-3">
                    {latest.description && <p className="text-sm text-muted-foreground">{latest.description}</p>}
                    <div className="flex items-center gap-2">
                      {canUpload && (
                        <NewVersionButton productId={id!} diagram={latest} onUploaded={refresh} />
                      )}
                      {group.versions.length > 1 && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => setOpenGroup(openGroup === group.title ? null : group.title)}
                        >
                          {group.versions.length} versions
                        </Button>
                      )}
                    </div>
                    {openGroup === group.title && (
                      <div className="flex flex-col gap-1 border-t border-border pt-2">
                        {group.versions.map((v) => (
                          <button
                            key={v.id}
                            type="button"
                            onClick={() => (isImage(v.file_url) ? setViewerUrl(v.file_url) : window.open(`${API_URL}${v.file_url}`, "_blank"))}
                            className="flex items-center justify-between rounded-md px-2 py-1 text-left text-xs hover:bg-accent"
                          >
                            <span>v{v.version}</span>
                            <span className="text-muted-foreground">{new Date(v.created_at).toLocaleDateString()}</span>
                          </button>
                        ))}
                      </div>
                    )}
                    <DiagramComments productId={id!} diagramId={latest.id} />
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {viewerUrl && <ImageViewer url={`${API_URL}${viewerUrl}`} onClose={() => setViewerUrl(null)} />}
    </AppShell>
  );
}

function UploadForm({
  productId,
  existingTitles,
  onUploaded,
}: {
  productId: string;
  existingTitles: string[];
  onUploaded: () => void;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!file) return;
    if (existingTitles.includes(title)) {
      toast.error("A diagram with that title already exists — use \"new version\" on it instead");
      return;
    }
    setBusy(true);
    try {
      const form = new FormData();
      form.append("title", title);
      if (description) form.append("description", description);
      form.append("file", file);
      await api.post(`/api/products/${productId}/diagrams`, form);
      onUploaded();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not upload diagram");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="mb-4">
      <CardHeader>
        <CardTitle className="text-sm">Upload diagram</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="diagram-title">Title</Label>
            <Input id="diagram-title" required value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="diagram-desc">What changed / why</Label>
            <Textarea id="diagram-desc" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="diagram-file">File</Label>
            <Input
              id="diagram-file"
              type="file"
              required
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </div>
          <Button type="submit" disabled={busy} className="self-start">
            Upload
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function NewVersionButton({
  productId,
  diagram,
  onUploaded,
}: {
  productId: string;
  diagram: ArchitectureDiagram;
  onUploaded: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [description, setDescription] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!file) return;
    setBusy(true);
    try {
      const form = new FormData();
      if (description) form.append("description", description);
      form.append("file", file);
      await api.post(`/api/products/${productId}/diagrams/${diagram.id}/new-version`, form);
      setOpen(false);
      setDescription("");
      setFile(null);
      onUploaded();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not upload new version");
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
        New version
      </Button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex w-full flex-col gap-2 rounded-md border border-border p-2">
      <Textarea
        placeholder="What changed and why?"
        rows={2}
        value={description}
        onChange={(e) => setDescription(e.target.value)}
      />
      <Input type="file" required onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={busy}>
          Upload
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

function DiagramComments({ productId, diagramId }: { productId: string; diagramId: string }) {
  const [comments, setComments] = useState<DiagramComment[] | null>(null);
  const [text, setText] = useState("");

  useEffect(() => {
    api.get<DiagramComment[]>(`/api/products/${productId}/diagrams/${diagramId}/comments`).then(setComments);
  }, [productId, diagramId]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    const comment = await api.post<DiagramComment>(`/api/products/${productId}/diagrams/${diagramId}/comments`, { text });
    setComments((prev) => [...(prev ?? []), comment]);
    setText("");
  }

  return (
    <div className="flex flex-col gap-2 border-t border-border pt-2">
      {comments?.map((c) => (
        <div key={c.id} className="text-xs">
          <span className="font-medium">{c.author.name ?? c.author.email}</span>{" "}
          <span className="text-muted-foreground">{c.text}</span>
        </div>
      ))}
      <form onSubmit={submit} className="flex gap-2">
        <Input placeholder="Comment on this design..." value={text} onChange={(e) => setText(e.target.value)} className="h-8 text-xs" />
        <Button type="submit" size="sm" className="h-8" disabled={!text.trim()}>
          Send
        </Button>
      </form>
    </div>
  );
}

function ImageViewer({ url, onClose }: { url: string; onClose: () => void }) {
  const [zoom, setZoom] = useState(1);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/90" onClick={onClose}>
      <div
        className="flex items-center justify-end gap-2 bg-white/10 p-4 backdrop-blur-md transition-colors duration-base ease-apple-out"
        onClick={(e) => e.stopPropagation()}
      >
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label="Zoom out"
          onClick={() => setZoom((z) => Math.max(0.5, z - 0.25))}
        >
          <Minus className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label="Zoom in"
          onClick={() => setZoom((z) => Math.min(3, z + 0.25))}
        >
          <Plus className="h-4 w-4" />
        </Button>
        <Button type="button" variant="outline" size="icon" aria-label="Close" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>
      <div className="flex flex-1 items-center justify-center overflow-auto p-4">
        <img
          src={url}
          alt="Architecture diagram"
          style={{ transform: `scale(${zoom})` }}
          className={cn("max-h-none max-w-none transition-transform")}
          onClick={(e) => e.stopPropagation()}
        />
      </div>
    </div>
  );
}
