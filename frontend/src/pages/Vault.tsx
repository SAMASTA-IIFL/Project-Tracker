import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Check, Copy, KeyRound, Lock, Plus, ShieldAlert, Unlock, X } from "lucide-react";
import { toast } from "sonner";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { decryptSecretValue, encryptSecretValue, generateDEK, importPublicKey, unwrapDEK, wrapDEK } from "@/lib/vaultCrypto";
import type { Product, VaultAuditEntry, VaultGrant, VaultSecret, VaultSecretReveal, VaultUserSearchResult } from "@/lib/types";
import { VAULT_AUDIT_LABELS } from "@/lib/types";
import { AppShell } from "@/components/AppShell";
import { UserPicker } from "@/components/UserPicker";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Tabs } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

// Revealed plaintext auto-hides after this long, and is never persisted
// anywhere (not in component state beyond a plain useState, never written
// to storage) — see the vault plan's "transient reveal" requirement.
const REVEAL_TIMEOUT_MS = 20_000;

export function VaultPage() {
  const { vaultReady, vaultKey, vaultPublicKey, setupVault, unlockVault } = useAuth();
  const [tab, setTab] = useState<"mine" | "shared">("mine");
  const [mySecrets, setMySecrets] = useState<VaultSecret[] | null>(null);
  const [sharedSecrets, setSharedSecrets] = useState<VaultSecret[] | null>(null);
  const [products, setProducts] = useState<Product[] | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const unlocked = vaultReady === true && vaultKey !== null;

  useEffect(() => {
    api.get<Product[]>("/api/products").then(setProducts).catch(() => setProducts([]));
  }, []);

  useEffect(() => {
    if (unlocked) refresh();
  }, [unlocked]);

  function refresh() {
    api.get<VaultSecret[]>("/api/vault/secrets?scope=mine").then(setMySecrets);
    api.get<VaultSecret[]>("/api/vault/secrets?scope=shared").then(setSharedSecrets);
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-5xl px-4 py-10">
        <div className="mb-6 flex items-center justify-between gap-4">
          <div>
            <h1 className="text-title-3">Secrets Vault</h1>
            <p className="text-sm text-muted-foreground">
              End-to-end encrypted secret sharing — only you and the people you explicitly grant access to can ever
              read a value.
            </p>
          </div>
          {unlocked && (
            <Button type="button" size="sm" className="shrink-0 gap-1.5" onClick={() => setShowCreate((v) => !v)}>
              <Plus className="h-4 w-4" />
              New secret
            </Button>
          )}
        </div>

        {vaultReady === null && <p className="text-sm text-muted-foreground">Loading...</p>}
        {vaultReady === false && <SetupVaultCard onSetup={setupVault} />}
        {vaultReady === true && !vaultKey && <UnlockVaultCard onUnlock={unlockVault} />}

        {unlocked && (
          <>
            {showCreate && (
              <CreateSecretForm
                products={products ?? []}
                ownPublicKeyB64={vaultPublicKey!}
                onCreated={() => {
                  setShowCreate(false);
                  refresh();
                }}
              />
            )}

            <Tabs
              tabs={[
                { key: "mine", label: "My secrets" },
                { key: "shared", label: "Shared with me" },
              ]}
              active={tab}
              onChange={setTab}
            />

            <div className="mt-4">
              {tab === "mine" ? (
                <SecretList
                  secrets={mySecrets}
                  emptyText="No secrets yet — create one to share it securely with someone."
                  renderCard={(s) => <OwnedSecretCard key={s.id} secret={s} vaultKey={vaultKey!} onChanged={refresh} />}
                />
              ) : (
                <SecretList
                  secrets={sharedSecrets}
                  emptyText="Nothing has been shared with you yet."
                  renderCard={(s) => <SharedSecretCard key={s.id} secret={s} vaultKey={vaultKey!} />}
                />
              )}
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}

function SetupVaultCard({ onSetup }: { onSetup: (password: string) => Promise<void> }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (password !== confirm) {
      toast.error("Passwords don't match");
      return;
    }
    setBusy(true);
    try {
      await onSetup(password);
      toast.success("Vault set up");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not set up vault");
    } finally {
      setBusy(false);
      setPassword("");
      setConfirm("");
    }
  }

  return (
    <Card className="mb-6 border-dashed">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm">
          <KeyRound className="h-4 w-4" />
          Set up your vault
        </CardTitle>
        <CardDescription>
          Choose a vault password — it can match your login password or be different. Anything shared with you is
          only readable after you unlock with it, and <strong>there is no recovery if you forget it.</strong>
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="vault-setup-password">Vault password</Label>
            <Input
              id="vault-setup-password"
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="vault-setup-confirm">Confirm password</Label>
            <Input
              id="vault-setup-confirm"
              type="password"
              required
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
          </div>
          <Button type="submit" disabled={busy} className="self-start">
            Set up vault
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function UnlockVaultCard({ onUnlock }: { onUnlock: (password: string) => Promise<void> }) {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await onUnlock(password);
    } catch {
      toast.error("Wrong password");
    } finally {
      setBusy(false);
      setPassword("");
    }
  }

  return (
    <Card className="mb-6 border-dashed">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm">
          <Lock className="h-4 w-4" />
          Unlock your vault
        </CardTitle>
        <CardDescription>
          Your vault key isn't loaded in this browser session — it's never stored, so a refresh always needs this
          again.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="flex gap-2">
          <Input
            type="password"
            placeholder="Vault password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="max-w-xs"
          />
          <Button type="submit" disabled={busy} className="gap-1.5">
            <Unlock className="h-4 w-4" />
            Unlock
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function SecretList({
  secrets,
  emptyText,
  renderCard,
}: {
  secrets: VaultSecret[] | null;
  emptyText: string;
  renderCard: (s: VaultSecret) => ReactNode;
}) {
  if (secrets === null) return <p className="text-sm text-muted-foreground">Loading...</p>;
  if (secrets.length === 0) {
    return (
      <Card className="border-dashed">
        <CardContent className="py-10 text-center text-sm text-muted-foreground">{emptyText}</CardContent>
      </Card>
    );
  }
  return <div className="flex flex-col gap-3">{secrets.map(renderCard)}</div>;
}

function CreateSecretForm({
  products,
  ownPublicKeyB64,
  onCreated,
}: {
  products: Product[];
  ownPublicKeyB64: string;
  onCreated: () => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [value, setValue] = useState("");
  const [productId, setProductId] = useState("");
  const [grantees, setGrantees] = useState<VaultUserSearchResult[]>([]);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const recovery = await api.get<{ public_key: string }>("/api/vault/recovery-public-key");
      const dek = await generateDEK();
      const { iv, ciphertext } = await encryptSecretValue(dek, value);

      const ownPublicKey = await importPublicKey(ownPublicKeyB64);
      const ownerWrappedKey = await wrapDEK(dek, ownPublicKey);

      const recoveryPublicKey = await importPublicKey(recovery.public_key);
      const recoveryWrappedKey = await wrapDEK(dek, recoveryPublicKey);

      const initialGrants: { user_id: string; wrapped_key: string }[] = [];
      for (const grantee of grantees) {
        if (!grantee.vault_public_key) continue;
        const granteePublicKey = await importPublicKey(grantee.vault_public_key);
        const wrappedKey = await wrapDEK(dek, granteePublicKey);
        initialGrants.push({ user_id: grantee.id, wrapped_key: wrappedKey });
      }

      await api.post("/api/vault/secrets", {
        name,
        description: description || null,
        product_id: productId || null,
        ciphertext,
        iv,
        recovery_wrapped_key: recoveryWrappedKey,
        owner_wrapped_key: ownerWrappedKey,
        initial_grants: initialGrants,
      });

      toast.success("Secret created");
      setName("");
      setDescription("");
      setValue("");
      setProductId("");
      setGrantees([]);
      onCreated();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not create secret");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="mb-4">
      <CardHeader>
        <CardTitle className="text-sm">New secret</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="secret-name">Name</Label>
            <Input id="secret-name" required value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="secret-description">Description</Label>
            <Input id="secret-description" value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="secret-value">Value</Label>
            <Textarea
              id="secret-value"
              required
              rows={3}
              placeholder="The actual secret — API key, password, token..."
              value={value}
              onChange={(e) => setValue(e.target.value)}
            />
          </div>
          {products.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="secret-product">Associate with a product (optional label only — doesn't grant that product's members access)</Label>
              <Select id="secret-product" value={productId} onChange={(e) => setProductId(e.target.value)}>
                <option value="">No product</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
            </div>
          )}
          <div className="flex flex-col gap-1.5">
            <Label>Share with (optional)</Label>
            <UserPicker selected={grantees} onChange={setGrantees} />
          </div>
          <Button type="submit" disabled={busy} className="self-start">
            Create secret
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function RevealSection({ secretId, vaultKey }: { secretId: string; vaultKey: CryptoKey }) {
  const [revealed, setRevealed] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, []);

  async function reveal() {
    setBusy(true);
    try {
      const data = await api.get<VaultSecretReveal>(`/api/vault/secrets/${secretId}/reveal-data`);
      const dek = await unwrapDEK(data.wrapped_key, vaultKey);
      const plaintext = await decryptSecretValue(dek, data.iv, data.ciphertext);
      setRevealed(plaintext);
      if (hideTimer.current) clearTimeout(hideTimer.current);
      hideTimer.current = setTimeout(() => setRevealed(null), REVEAL_TIMEOUT_MS);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not reveal secret");
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    if (!revealed) return;
    await navigator.clipboard.writeText(revealed);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (revealed === null) {
    return (
      <Button type="button" variant="outline" size="sm" disabled={busy} onClick={reveal} className="shrink-0">
        Reveal
      </Button>
    );
  }

  return (
    <div className="flex items-center gap-2 rounded-md border border-border bg-accent/30 px-2 py-1.5">
      <code className="max-w-[220px] flex-1 break-all text-xs">{revealed}</code>
      <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={copy} aria-label="Copy">
        {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-7 w-7"
        onClick={() => setRevealed(null)}
        aria-label="Hide"
      >
        <Lock className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

function OwnedSecretCard({
  secret,
  vaultKey,
  onChanged,
}: {
  secret: VaultSecret;
  vaultKey: CryptoKey;
  onChanged: () => void;
}) {
  const [showAccess, setShowAccess] = useState(false);
  const [showAudit, setShowAudit] = useState(false);

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
        <div>
          <CardTitle className="text-sm">{secret.name}</CardTitle>
          {secret.description && <CardDescription>{secret.description}</CardDescription>}
        </div>
        <RevealSection secretId={secret.id} vaultKey={vaultKey} />
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={() => setShowAccess((v) => !v)}>
            Manage access
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => setShowAudit((v) => !v)}>
            Audit log
          </Button>
        </div>
        {showAccess && <ManageAccessPanel secret={secret} vaultKey={vaultKey} onChanged={onChanged} />}
        {showAudit && <AuditLogPanel secretId={secret.id} />}
      </CardContent>
    </Card>
  );
}

function SharedSecretCard({ secret, vaultKey }: { secret: VaultSecret; vaultKey: CryptoKey }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
        <div>
          <CardTitle className="text-sm">{secret.name}</CardTitle>
          <CardDescription>
            Shared by {secret.owner.name ?? secret.owner.email}
            {secret.description ? ` — ${secret.description}` : ""}
          </CardDescription>
        </div>
        <RevealSection secretId={secret.id} vaultKey={vaultKey} />
      </CardHeader>
    </Card>
  );
}

// Only the owner ever sees this panel (owner-only endpoints) — a grantee
// cannot see who else has access, by design (see the vault plan).
function ManageAccessPanel({
  secret,
  vaultKey,
  onChanged,
}: {
  secret: VaultSecret;
  vaultKey: CryptoKey;
  onChanged: () => void;
}) {
  const [grants, setGrants] = useState<VaultGrant[] | null>(null);
  const [adding, setAdding] = useState<VaultUserSearchResult[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    refresh();
  }, [secret.id]);

  function refresh() {
    api.get<VaultGrant[]>(`/api/vault/secrets/${secret.id}/grants`).then(setGrants);
  }

  const grantees = (grants ?? []).filter((g) => g.user.id !== secret.owner.id);

  async function addGrantees() {
    if (adding.length === 0) return;
    setBusy(true);
    try {
      // Unwrap the owner's own copy of the DEK to re-wrap it for the new
      // grantee(s) — this never reveals the plaintext value in the UI,
      // it's a DEK-level operation only.
      const reveal = await api.get<VaultSecretReveal>(`/api/vault/secrets/${secret.id}/reveal-data`);
      const dek = await unwrapDEK(reveal.wrapped_key, vaultKey);

      for (const grantee of adding) {
        if (!grantee.vault_public_key) continue;
        const granteePublicKey = await importPublicKey(grantee.vault_public_key);
        const wrappedKey = await wrapDEK(dek, granteePublicKey);
        await api.post(`/api/vault/secrets/${secret.id}/grants`, { user_id: grantee.id, wrapped_key: wrappedKey });
      }
      toast.success("Access granted");
      setAdding([]);
      refresh();
      onChanged();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not grant access");
    } finally {
      setBusy(false);
    }
  }

  async function revoke(userId: string) {
    try {
      await api.delete(`/api/vault/secrets/${secret.id}/grants/${userId}`);
      toast.success("Access revoked");
      refresh();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not revoke access");
    }
  }

  return (
    <div className="flex flex-col gap-2 rounded-md border border-border p-3">
      {grants === null ? (
        <p className="text-xs text-muted-foreground">Loading...</p>
      ) : grantees.length === 0 ? (
        <p className="text-xs text-muted-foreground">Only you have access.</p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {grantees.map((g) => (
            <span
              key={g.id}
              className="flex items-center gap-1.5 rounded-full border border-border bg-accent/40 py-0.5 pl-1 pr-2 text-xs"
            >
              <Avatar label={g.user.name ?? g.user.email} className="h-5 w-5 text-[9px]" />
              {g.user.name ?? g.user.email}
              <button
                type="button"
                onClick={() => revoke(g.user.id)}
                aria-label={`Revoke ${g.user.name ?? g.user.email}`}
                className="text-muted-foreground hover:text-destructive"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}
      <UserPicker selected={adding} onChange={setAdding} excludeIds={grantees.map((g) => g.user.id)} />
      {adding.length > 0 && (
        <Button type="button" size="sm" disabled={busy} onClick={addGrantees} className="self-start">
          Grant access
        </Button>
      )}
    </div>
  );
}

function AuditLogPanel({ secretId }: { secretId: string }) {
  const [entries, setEntries] = useState<VaultAuditEntry[] | null>(null);

  useEffect(() => {
    api.get<VaultAuditEntry[]>(`/api/vault/secrets/${secretId}/audit`).then(setEntries);
  }, [secretId]);

  if (entries === null) return <p className="text-xs text-muted-foreground">Loading...</p>;
  if (entries.length === 0) return <p className="text-xs text-muted-foreground">No activity yet.</p>;

  return (
    <div className="flex flex-col gap-1.5 rounded-md border border-border p-3">
      {entries.map((e) => (
        <div
          key={e.id}
          className={cn(
            "flex items-center justify-between text-xs",
            e.action === "ADMIN_BREAKGLASS_VIEWED" && "font-medium text-destructive",
          )}
        >
          <span className="flex items-center gap-1.5">
            {e.action === "ADMIN_BREAKGLASS_VIEWED" && <ShieldAlert className="h-3 w-3" />}
            {VAULT_AUDIT_LABELS[e.action]} — {e.actor.name ?? e.actor.email}
          </span>
          <span className="text-muted-foreground">{new Date(e.created_at).toLocaleString()}</span>
        </div>
      ))}
    </div>
  );
}
