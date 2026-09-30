import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { onAuthStateChanged, signInWithPopup, signOut as firebaseSignOut } from "firebase/auth";
import { auth, googleProvider } from "@/lib/firebase";
import { api } from "@/lib/api";
import {
  exportPublicKey,
  generateKeyPair,
  unwrapPrivateKey,
  wrapPrivateKey,
  type WrappedPrivateKeyBlob,
} from "@/lib/vaultCrypto";
import type { User } from "@/lib/types";

type AuthContextValue = {
  user: User | null;
  loading: boolean;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;

  // Secrets Vault unlock state — independent of sign-in (see Vault.tsx). The
  // vault's own password is never Firebase's/Google's; it only ever exists
  // client-side to derive the key that wraps the user's vault private key
  // (see lib/vaultCrypto.ts). null = not checked yet, false = no vault set
  // up, true = vault exists (may still need unlockVault() this session).
  vaultReady: boolean | null;
  vaultKey: CryptoKey | null;
  vaultPublicKey: string | null;
  setupVault: (password: string) => Promise<void>;
  unlockVault: (password: string) => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const [vaultReady, setVaultReady] = useState<boolean | null>(null);
  const [vaultKey, setVaultKey] = useState<CryptoKey | null>(null);
  const [vaultPublicKey, setVaultPublicKey] = useState<string | null>(null);

  useEffect(() => {
    // Restores the session on page load/refresh — Firebase persists the
    // signed-in Google account in the browser and replays it here.
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (!firebaseUser) {
        setUser(null);
        setLoading(false);
        return;
      }
      try {
        setUser(await api.get<User>("/api/auth/me"));
      } catch {
        setUser(null);
      } finally {
        setLoading(false);
      }
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    // A fresh sign-in (or reload) always starts with the vault locked —
    // the unwrapped private key never persists across sessions/reloads,
    // by design (see vaultCrypto.ts).
    setVaultKey(null);
    if (!user) {
      setVaultReady(null);
      setVaultPublicKey(null);
      return;
    }
    api
      .get<{ public_key: string; wrapped_private_key: string }>("/api/vault/keypair")
      .then((res) => {
        setVaultReady(true);
        setVaultPublicKey(res.public_key);
      })
      .catch(() => {
        setVaultReady(false);
        setVaultPublicKey(null);
      });
  }, [user?.id]);

  async function signIn() {
    await signInWithPopup(auth, googleProvider);
    // /api/auth/me both verifies the new ID token and upserts the matching
    // Firestore user record — see backend/app/routers/auth.py.
    setUser(await api.get<User>("/api/auth/me"));
  }

  async function signOut() {
    await firebaseSignOut(auth);
    setUser(null);
  }

  async function setupVault(password: string) {
    const keyPair = await generateKeyPair();
    const publicKeyB64 = await exportPublicKey(keyPair.publicKey);
    const wrappedBlob = await wrapPrivateKey(keyPair.privateKey, password);
    await api.post("/api/vault/keypair", {
      public_key: publicKeyB64,
      wrapped_private_key: JSON.stringify(wrappedBlob),
    });
    setVaultPublicKey(publicKeyB64);
    setVaultKey(keyPair.privateKey);
    setVaultReady(true);
  }

  async function unlockVault(password: string) {
    const res = await api.get<{ public_key: string; wrapped_private_key: string }>("/api/vault/keypair");
    const blob = JSON.parse(res.wrapped_private_key) as WrappedPrivateKeyBlob;
    const key = await unwrapPrivateKey(blob, password); // throws on wrong password
    setVaultKey(key);
    setVaultPublicKey(res.public_key);
  }

  return (
    <AuthContext.Provider
      value={{ user, loading, signIn, signOut, vaultReady, vaultKey, vaultPublicKey, setupVault, unlockVault }}
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
