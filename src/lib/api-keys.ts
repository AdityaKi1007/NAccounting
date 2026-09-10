import { randomBytes, createHash } from "crypto";

// Third-party REST API keys (see /api/v1/* and the "API Keys" settings page that replaced
// Incoming Webhooks under Integrations). Keys look like "nz_live_<40 hex chars>". Only a
// sha256 hash of the full key is ever persisted (api_keys.key_hash, unique) — the raw key is
// shown to the user exactly once, right after creation, and can't be recovered afterwards.
// key_prefix keeps the first 12 characters around unhashed purely for display in the
// management UI (e.g. "nz_live_a1b2c3d4••••").

const KEY_PREFIX = "nz_live_";

export function generateApiKey() {
  const raw = `${KEY_PREFIX}${randomBytes(20).toString("hex")}`;
  return {
    raw,
    prefix: raw.slice(0, 16),
    hash: hashApiKey(raw),
  };
}

export function hashApiKey(raw: string) {
  return createHash("sha256").update(raw).digest("hex");
}

export function maskKey(prefix: string) {
  return `${prefix}${"•".repeat(8)}`;
}
