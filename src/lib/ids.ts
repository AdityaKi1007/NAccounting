import { customAlphabet } from "nanoid";

const numeric = customAlphabet("0123456789", 6);

/** Generates a human-friendly sequential-looking document number, e.g. INV-000123 */
export function docNumber(prefix: string) {
  return `${prefix}-${numeric()}`;
}

export function slugify(input: string) {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}
