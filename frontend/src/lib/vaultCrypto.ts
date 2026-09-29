// Secrets Vault client-side crypto. All real cryptography happens here via
// the browser's native WebCrypto (crypto.subtle) — the backend only ever
// stores/returns opaque base64 strings (see backend/app/routers/vault.py,
// which never touches a secret's plaintext value except through the
// separate, audited admin-breakglass path).
//
// - Per-user keypair: RSA-OAEP-2048 / SHA-256. wrapKey/unwrapKey do direct
//   key-wrapping with RSA-OAEP in one call — no ephemeral-key/ECIES
//   bookkeeping to get wrong.
// - Per-secret DEK: AES-256-GCM, generated fresh per secret.
// - Private-key-at-rest: PBKDF2-SHA256 (600,000 iterations — current OWASP
//   guidance) derives an AES-256-GCM key from the login password, which
//   wraps the PKCS8-exported private key. Only this wrapped blob ever
//   leaves the browser.

const PBKDF2_ITERATIONS = 600_000;

export type WrappedPrivateKeyBlob = { salt: string; iv: string; ciphertext: string; iterations: number };

function toBase64(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

// Typed Uint8Array<ArrayBuffer> (not the default ArrayBufferLike) so these
// satisfy WebCrypto's BufferSource parameters directly, with no cast needed
// at every call site — true at runtime since `new Uint8Array(n)` always
// allocates a real ArrayBuffer, never a SharedArrayBuffer.
function fromBase64(str: string): Uint8Array<ArrayBuffer> {
  const binary = atob(str);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function randomBytes(length: number): Uint8Array<ArrayBuffer> {
  return crypto.getRandomValues(new Uint8Array(length));
}

// --- Keypair ---

export async function generateKeyPair(): Promise<CryptoKeyPair> {
  return crypto.subtle.generateKey(
    { name: "RSA-OAEP", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
    true,
    ["wrapKey", "unwrapKey"],
  );
}

export async function exportPublicKey(key: CryptoKey): Promise<string> {
  const spki = await crypto.subtle.exportKey("spki", key);
  return toBase64(spki);
}

export async function importPublicKey(spkiB64: string): Promise<CryptoKey> {
  return crypto.subtle.importKey("spki", fromBase64(spkiB64), { name: "RSA-OAEP", hash: "SHA-256" }, true, [
    "wrapKey",
  ]);
}

// --- Private-key-at-rest wrapping (password-derived) ---

async function deriveWrappingKey(password: string, salt: Uint8Array<ArrayBuffer>, iterations: number): Promise<CryptoKey> {
  const baseKey = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, [
    "deriveKey",
  ]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations, hash: "SHA-256" },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["wrapKey", "unwrapKey"],
  );
}

export async function wrapPrivateKey(privateKey: CryptoKey, password: string): Promise<WrappedPrivateKeyBlob> {
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const wrappingKey = await deriveWrappingKey(password, salt, PBKDF2_ITERATIONS);
  const ciphertext = await crypto.subtle.wrapKey("pkcs8", privateKey, wrappingKey, { name: "AES-GCM", iv });
  return { salt: toBase64(salt), iv: toBase64(iv), ciphertext: toBase64(ciphertext), iterations: PBKDF2_ITERATIONS };
}

// Throws if the password is wrong (AES-GCM decrypt failure) — callers should
// surface that as a clear "wrong password" error, not a generic failure.
export async function unwrapPrivateKey(blob: WrappedPrivateKeyBlob, password: string): Promise<CryptoKey> {
  const wrappingKey = await deriveWrappingKey(password, fromBase64(blob.salt), blob.iterations);
  return crypto.subtle.unwrapKey(
    "pkcs8",
    fromBase64(blob.ciphertext),
    wrappingKey,
    { name: "AES-GCM", iv: fromBase64(blob.iv) },
    { name: "RSA-OAEP", hash: "SHA-256" },
    false,
    ["unwrapKey"],
  );
}

// --- Per-secret DEK ---

export async function generateDEK(): Promise<CryptoKey> {
  return crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
}

export async function wrapDEK(dek: CryptoKey, recipientPublicKey: CryptoKey): Promise<string> {
  const wrapped = await crypto.subtle.wrapKey("raw", dek, recipientPublicKey, { name: "RSA-OAEP" });
  return toBase64(wrapped);
}

// extractable: true (unlike unwrapPrivateKey's result) — a secret owner
// needs to re-wrap their own unwrapped DEK for a newly granted user without
// ever revealing the plaintext value (see Vault.tsx's "Manage access"),
// and WebCrypto refuses to wrapKey() a non-extractable key.
export async function unwrapDEK(wrappedB64: string, myPrivateKey: CryptoKey): Promise<CryptoKey> {
  return crypto.subtle.unwrapKey(
    "raw",
    fromBase64(wrappedB64),
    myPrivateKey,
    { name: "RSA-OAEP" },
    { name: "AES-GCM", length: 256 },
    true,
    ["decrypt", "encrypt"],
  );
}

// --- Secret value ---

export async function encryptSecretValue(dek: CryptoKey, plaintext: string): Promise<{ iv: string; ciphertext: string }> {
  const iv = randomBytes(12);
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, dek, new TextEncoder().encode(plaintext));
  return { iv: toBase64(iv), ciphertext: toBase64(ciphertext) };
}

export async function decryptSecretValue(dek: CryptoKey, iv: string, ciphertext: string): Promise<string> {
  const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromBase64(iv) }, dek, fromBase64(ciphertext));
  return new TextDecoder().decode(plaintext);
}
