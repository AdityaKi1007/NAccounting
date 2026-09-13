import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";

// Symmetric encryption for secrets this app has to store recoverably — the SMTP password,
// SendGrid API key, S3 secret access key, and AWS SES secret access key an org enters on the
// Email Settings / File Storage settings pages (see EmailSettingsForm.tsx/S3StorageSettingsForm.tsx
// and their API routes). These can't be hashed the way api-keys.ts hashes API keys, since the
// app has to send the real plaintext value to the SMTP server / AWS on every use, not just
// verify a match against it.
//
// Deliberately NOT a new required env var: the key is derived from AUTH_SECRET, which every
// deployment of this app already has set (NextAuth won't start without it) — see
// .env.example. This is app-level encryption suitable for this app's threat model (protects
// the value at rest in the database from a casual DB read; it is not a substitute for a real
// KMS/HSM in a high-security deployment), disclosed as such in the project doc.

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // recommended for GCM
const AUTH_TAG_LENGTH = 16;

function getKey(): Buffer {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    throw new Error(
      "AUTH_SECRET must be set to store encrypted integration credentials (SMTP password / S3 secret key)."
    );
  }
  // sha256 gives a deterministic 32-byte key from whatever length AUTH_SECRET happens to be.
  return createHash("sha256").update(secret).digest();
}

/** Encrypts a plaintext secret for storage in a `*_encrypted` column. Returns a single
 * base64 string (iv + auth tag + ciphertext concatenated) — self-contained, nothing else
 * needs to be stored alongside it. */
export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, encrypted]).toString("base64");
}

/** Reverses encryptSecret. Throws if the value can't be decrypted (wrong key / corrupted
 * data) — callers should let this surface as a clear "reconfigure this" error rather than a
 * silently wrong credential. */
export function decryptSecret(stored: string): string {
  const raw = Buffer.from(stored, "base64");
  const iv = raw.subarray(0, IV_LENGTH);
  const authTag = raw.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const encrypted = raw.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
  const decipher = createDecipheriv(ALGORITHM, getKey(), iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
}
