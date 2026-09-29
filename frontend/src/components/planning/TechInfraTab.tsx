import { useEffect, useState, type FormEvent } from "react";
import { ExternalLink, Pencil, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { api, ApiError } from "@/lib/api";
import {
  HOSTING_PROVIDERS,
  REPO_PROVIDERS,
  TECH_STACK_CATEGORIES,
  type HostingEnvironment,
  type ProjectRepository,
  type TechStackItem,
} from "@/lib/types";
import { TECH_STACK_CATEGORY_META } from "@/lib/workspaceMeta";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { cn } from "@/lib/utils";

export function TechInfraTab({ productId, canEdit }: { productId: string; canEdit: boolean }) {
  return (
    <div className="flex flex-col gap-4">
      <RepositoriesSection productId={productId} canEdit={canEdit} />
      <TechStackSection productId={productId} canEdit={canEdit} />
      <HostingSection productId={productId} canEdit={canEdit} />
    </div>
  );
}

// --- Repositories ---

function RepositoriesSection({ productId, canEdit }: { productId: string; canEdit: boolean }) {
  const [repos, setRepos] = useState<ProjectRepository[] | null>(null);
  const [adding, setAdding] = useState(false);

  function refresh() {
    api.get<ProjectRepository[]>(`/api/products/${productId}/workspace/repositories`).then(setRepos);
  }
  useEffect(refresh, [productId]);

  async function remove(id: string) {
    try {
      await api.delete(`/api/products/${productId}/workspace/repositories/${id}`);
      setRepos((prev) => prev?.filter((r) => r.id !== id) ?? null);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not remove repository");
    }
  }

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-2 space-y-0">
        <div>
          <CardTitle className="text-sm">Repositories</CardTitle>
          <CardDescription>Where this product's code lives.</CardDescription>
        </div>
        {canEdit && !adding && (
          <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={() => setAdding(true)}>
            <Plus className="h-3.5 w-3.5" />
            Add repo
          </Button>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {adding && (
          <RepoForm
            productId={productId}
            onDone={(repo) => {
              setAdding(false);
              if (repo) setRepos((prev) => [...(prev ?? []), repo]);
            }}
          />
        )}
        {repos === null ? (
          <p className="text-sm text-muted-foreground">Loading...</p>
        ) : repos.length === 0 && !adding ? (
          <p className="text-sm text-muted-foreground">No repositories linked yet.</p>
        ) : (
          repos.map((r) => (
            <div key={r.id} className="flex items-center justify-between gap-2 rounded-lg border border-border px-3 py-2 text-sm">
              <div className="flex min-w-0 flex-col">
                <a href={r.url} target="_blank" rel="noreferrer" className="flex items-center gap-1 font-medium hover:underline">
                  {r.label}
                  <ExternalLink className="h-3 w-3 shrink-0" />
                </a>
                <span className="truncate text-xs text-muted-foreground">
                  {r.provider}
                  {r.default_branch ? ` · ${r.default_branch}` : ""}
                </span>
              </div>
              {canEdit && (
                <Button type="button" variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => remove(r.id)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}

function RepoForm({ productId, onDone }: { productId: string; onDone: (repo: ProjectRepository | null) => void }) {
  const [label, setLabel] = useState("");
  const [provider, setProvider] = useState("GITHUB");
  const [url, setUrl] = useState("");
  const [defaultBranch, setDefaultBranch] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!label.trim() || !url.trim()) return;
    setBusy(true);
    try {
      const repo = await api.post<ProjectRepository>(`/api/products/${productId}/workspace/repositories`, {
        label,
        provider,
        url,
        default_branch: defaultBranch || null,
      });
      onDone(repo);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not add repository");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-2 rounded-lg border border-border p-3 sm:flex-row sm:items-center">
      <Input placeholder="Label (e.g. Backend API)" value={label} onChange={(e) => setLabel(e.target.value)} className="sm:flex-1" />
      <Select value={provider} onChange={(e) => setProvider(e.target.value)} className="sm:w-32">
        {REPO_PROVIDERS.map((p) => (
          <option key={p.key} value={p.key}>
            {p.label}
          </option>
        ))}
      </Select>
      <Input placeholder="https://github.com/..." value={url} onChange={(e) => setUrl(e.target.value)} className="sm:flex-1" />
      <Input placeholder="main" value={defaultBranch} onChange={(e) => setDefaultBranch(e.target.value)} className="sm:w-24" />
      <div className="flex gap-1.5">
        <Button type="submit" size="sm" disabled={busy}>
          Add
        </Button>
        <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => onDone(null)}>
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
    </form>
  );
}

// --- Tech stack ---

function TechStackSection({ productId, canEdit }: { productId: string; canEdit: boolean }) {
  const [items, setItems] = useState<TechStackItem[] | null>(null);
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  function refresh() {
    api.get<TechStackItem[]>(`/api/products/${productId}/workspace/tech-stack`).then(setItems);
  }
  useEffect(refresh, [productId]);

  async function remove(id: string) {
    try {
      await api.delete(`/api/products/${productId}/workspace/tech-stack/${id}`);
      setItems((prev) => prev?.filter((i) => i.id !== id) ?? null);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not remove item");
    }
  }

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-2 space-y-0">
        <div>
          <CardTitle className="text-sm">Tech stack &amp; AI models</CardTitle>
          <CardDescription>Frameworks, languages, databases, and AI models this product runs on.</CardDescription>
        </div>
        {canEdit && !adding && (
          <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={() => setAdding(true)}>
            <Plus className="h-3.5 w-3.5" />
            Add item
          </Button>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {adding && (
          <TechStackForm
            productId={productId}
            onDone={(item) => {
              setAdding(false);
              if (item) setItems((prev) => [...(prev ?? []), item]);
            }}
          />
        )}
        {items === null ? (
          <p className="text-sm text-muted-foreground">Loading...</p>
        ) : items.length === 0 && !adding ? (
          <p className="text-sm text-muted-foreground">No tech stack items added yet.</p>
        ) : (
          items.map((i) =>
            editingId === i.id ? (
              <TechStackForm
                key={i.id}
                productId={productId}
                existing={i}
                onDone={(updated) => {
                  setEditingId(null);
                  if (updated) setItems((prev) => prev?.map((x) => (x.id === updated.id ? updated : x)) ?? null);
                }}
              />
            ) : (
              <div key={i.id} className="flex items-center justify-between gap-2 rounded-lg border border-border px-3 py-2 text-sm">
                <div className="flex min-w-0 items-center gap-2">
                  <span
                    className={cn(
                      "shrink-0 rounded-full border px-2 py-0.5 text-xs",
                      TECH_STACK_CATEGORY_META[i.category].badge,
                    )}
                  >
                    {TECH_STACK_CATEGORIES.find((c) => c.key === i.category)?.label}
                  </span>
                  <span className="truncate font-medium">{i.name}</span>
                  {i.version && <span className="shrink-0 text-xs text-muted-foreground">v{i.version}</span>}
                </div>
                {canEdit && (
                  <div className="flex shrink-0 gap-1">
                    <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditingId(i.id)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => remove(i.id)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                )}
              </div>
            ),
          )
        )}
      </CardContent>
    </Card>
  );
}

function TechStackForm({
  productId,
  existing,
  onDone,
}: {
  productId: string;
  existing?: TechStackItem;
  onDone: (item: TechStackItem | null) => void;
}) {
  const [category, setCategory] = useState(existing?.category ?? "BACKEND");
  const [name, setName] = useState(existing?.name ?? "");
  const [version, setVersion] = useState(existing?.version ?? "");
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    try {
      const body = { category, name, version: version || null };
      const item = existing
        ? await api.patch<TechStackItem>(`/api/products/${productId}/workspace/tech-stack/${existing.id}`, body)
        : await api.post<TechStackItem>(`/api/products/${productId}/workspace/tech-stack`, body);
      onDone(item);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not save item");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-2 rounded-lg border border-border p-3 sm:flex-row sm:items-center">
      <Select value={category} onChange={(e) => setCategory(e.target.value as typeof category)} className="sm:w-40">
        {TECH_STACK_CATEGORIES.map((c) => (
          <option key={c.key} value={c.key}>
            {c.label}
          </option>
        ))}
      </Select>
      <Input placeholder="Name (e.g. FastAPI)" value={name} onChange={(e) => setName(e.target.value)} className="sm:flex-1" />
      <Input placeholder="Version (optional)" value={version} onChange={(e) => setVersion(e.target.value)} className="sm:w-32" />
      <div className="flex gap-1.5">
        <Button type="submit" size="sm" disabled={busy}>
          {existing ? "Save" : "Add"}
        </Button>
        <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => onDone(null)}>
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
    </form>
  );
}

// --- Hosting environments ---

function HostingSection({ productId, canEdit }: { productId: string; canEdit: boolean }) {
  const [envs, setEnvs] = useState<HostingEnvironment[] | null>(null);
  const [adding, setAdding] = useState(false);

  function refresh() {
    api.get<HostingEnvironment[]>(`/api/products/${productId}/workspace/hosting`).then(setEnvs);
  }
  useEffect(refresh, [productId]);

  async function remove(id: string) {
    try {
      await api.delete(`/api/products/${productId}/workspace/hosting/${id}`);
      setEnvs((prev) => prev?.filter((e) => e.id !== id) ?? null);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not remove environment");
    }
  }

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-2 space-y-0">
        <div>
          <CardTitle className="text-sm">Hosting environments</CardTitle>
          <CardDescription>Where this product is deployed.</CardDescription>
        </div>
        {canEdit && !adding && (
          <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={() => setAdding(true)}>
            <Plus className="h-3.5 w-3.5" />
            Add environment
          </Button>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {adding && (
          <HostingForm
            productId={productId}
            onDone={(env) => {
              setAdding(false);
              if (env) setEnvs((prev) => [...(prev ?? []), env]);
            }}
          />
        )}
        {envs === null ? (
          <p className="text-sm text-muted-foreground">Loading...</p>
        ) : envs.length === 0 && !adding ? (
          <p className="text-sm text-muted-foreground">No hosting environments added yet.</p>
        ) : (
          envs.map((e) => (
            <div key={e.id} className="flex items-center justify-between gap-2 rounded-lg border border-border px-3 py-2 text-sm">
              <div className="flex min-w-0 flex-col">
                <span className="font-medium">{e.name}</span>
                <span className="truncate text-xs text-muted-foreground">
                  {e.provider}
                  {e.region ? ` · ${e.region}` : ""}
                </span>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                {e.url && (
                  <a href={e.url} target="_blank" rel="noreferrer" className="text-muted-foreground hover:text-foreground">
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                )}
                {canEdit && (
                  <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => remove(e.id)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}

function HostingForm({ productId, onDone }: { productId: string; onDone: (env: HostingEnvironment | null) => void }) {
  const [name, setName] = useState("");
  const [provider, setProvider] = useState("AWS");
  const [url, setUrl] = useState("");
  const [region, setRegion] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    try {
      const env = await api.post<HostingEnvironment>(`/api/products/${productId}/workspace/hosting`, {
        name,
        provider,
        url: url || null,
        region: region || null,
      });
      onDone(env);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not add environment");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-2 rounded-lg border border-border p-3 sm:flex-row sm:items-center">
      <Input placeholder="Name (e.g. Production)" value={name} onChange={(e) => setName(e.target.value)} className="sm:flex-1" />
      <Select value={provider} onChange={(e) => setProvider(e.target.value)} className="sm:w-32">
        {HOSTING_PROVIDERS.map((p) => (
          <option key={p.key} value={p.key}>
            {p.label}
          </option>
        ))}
      </Select>
      <Input placeholder="Region (optional)" value={region} onChange={(e) => setRegion(e.target.value)} className="sm:w-28" />
      <Input placeholder="URL (optional)" value={url} onChange={(e) => setUrl(e.target.value)} className="sm:flex-1" />
      <div className="flex gap-1.5">
        <Button type="submit" size="sm" disabled={busy}>
          Add
        </Button>
        <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => onDone(null)}>
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
    </form>
  );
}
