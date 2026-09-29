import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { api, ApiError } from "@/lib/api";
import type { User } from "@/lib/types";
import { exportPublicKey, generateKeyPair, unwrapPrivateKey, wrapPrivateKey, type WrappedPrivateKeyBlob } from "@/lib/vaultCrypto";

type TokenResponse = { access_token: string; user: User };
type VaultKeypairRead = { public_key: string; wrapped_private_key: string };

type AuthContextValue = {
  user: User | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => void;
  // Secrets Vault (see lib/vaultCrypto.ts). vaultReady is null while
  // unknown/loading, false if this user has never set up a vault, true once
  // key material exists server-side. vaultKey is the *unwrapped* private
  // key — held only in memory for this tab/session, never persisted
  // anywhere, so a page refresh always requires unlockVault() again. A
  // normal sign-in opportunistically unlocks it using the password just
  // entered (discarded immediately after); this is a deliberate trade-off,
  // not an oversight — see the vault plan's Known Limitations.
  vaultReady: boolean | null;
  vaultPublicKey: string | null;
  vaultKey: CryptoKey | null;
  setupVault: (password: string) => Promise<void>;
  unlockVault: (password: string) => Promise<void>;
  lockVault: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [vaultReady, setVaultReady] = useState<boolean | null>(null);
  const [vaultPublicKey, setVaultPublicKey] = useState<string | null>(null);
  const [vaultKey, setVaultKey] = useState<CryptoKey | null>(null);

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) {
      setLoading(false);
      return;
    }
    api
      .get<User>("/api/auth/me")
      .then(async (u) => {
        setUser(u);
        await refreshVaultReady();
      })
      .catch(() => localStorage.removeItem("token"))
      .finally(() => setLoading(false));
  }, []);

  async function refreshVaultReady() {
    try {
      const keypair = await api.get<VaultKeypairRead>("/api/vault/keypair");
      setVaultReady(true);
      setVaultPublicKey(keypair.public_key);
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        setVaultReady(false);
        setVaultPublicKey(null);
      }
      // any other error (network, transient) — leave state as-is; the Vault page can retry.
    }
  }

  async function signIn(email: string, password: string) {
    const res = await api.post<TokenResponse>("/api/auth/dev-login", { email, password });
    localStorage.setItem("token", res.access_token);
    setUser(res.user);

    // Opportunistic vault unlock using the password just entered — never
    // persisted, only held in this function's closure. Swallowed on any
    // failure (vault not set up yet, or a setup-time password that's
    // diverged from the login password) so a vault problem never blocks a
    // normal sign-in.
    try {
      const keypair = await api.get<VaultKeypairRead>("/api/vault/keypair");
      setVaultReady(true);
      setVaultPublicKey(keypair.public_key);
      const blob: WrappedPrivateKeyBlob = JSON.parse(keypair.wrapped_private_key);
      const privateKey = await unwrapPrivateKey(blob, password);
      setVaultKey(privateKey);
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        setVaultReady(false);
        setVaultPublicKey(null);
      }
      setVaultKey(null);
    }
  }

  function signOut() {
    localStorage.removeItem("token");
    setUser(null);
    setVaultReady(null);
    setVaultPublicKey(null);
    setVaultKey(null);
  }

  async function setupVault(password: string) {
    const keyPair = await generateKeyPair();
    const publicKeyB64 = await exportPublicKey(keyPair.publicKey);
    const wrapped = await wrapPrivateKey(keyPair.privateKey, password);
    await api.post<VaultKeypairRead>("/api/vault/keypair", {
      public_key: publicKeyB64,
      wrapped_private_key: JSON.stringify(wrapped),
    });
    setVaultReady(true);
    setVaultPublicKey(publicKeyB64);
    setVaultKey(keyPair.privateKey);
  }

  // Throws on a wrong password (propagated from unwrapPrivateKey) — the
  // caller (Vault.tsx) is responsible for showing that as a clear error.
  async function unlockVault(password: string) {
    const keypair = await api.get<VaultKeypairRead>("/api/vault/keypair");
    const blob: WrappedPrivateKeyBlob = JSON.parse(keypair.wrapped_private_key);
    const privateKey = await unwrapPrivateKey(blob, password);
    setVaultPublicKey(keypair.public_key);
    setVaultKey(privateKey);
  }

  function lockVault() {
    setVaultKey(null);
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        signIn,
        signOut,
        vaultReady,
        vaultPublicKey,
        vaultKey,
        setupVault,
        unlockVault,
        lockVault,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
