import { customAlphabet } from "nanoid";

const TOKEN_ALPHABET = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
const generateToken = customAlphabet(TOKEN_ALPHABET, 32);

export function generateWebhookToken() {
  return generateToken();
}

// This build has no billing plans/tiers, so there's no real per-day quota to enforce.
// Zoho Books shows a plan-based cap on this page ("Usage Stats (per day): X / Y"); we show
// the same shape with a fixed placeholder limit rather than pretending to enforce one.
export const INCOMING_WEBHOOK_DAILY_LIMIT = 25;

export function incomingWebhookPath(token: string) {
  return `/api/webhooks/incoming/${token}`;
}
