const LEGAL_SUFFIXES = /\b(inc|llc|ltd|co|corp|corporation|company|gmbh|plc)\b\.?/gi;

/**
 * Collapses superficial variants of the same company name ("Netflix" /
 * "Netflix, Inc." / "netflix.com") to the same key, so extraction quirks
 * across different bills, or a user typing the name slightly differently,
 * don't fragment one company into several catalog entries.
 */
export function normalizeKey(name: string): string {
  return name
    .toLowerCase()
    .replace(LEGAL_SUFFIXES, '')
    .replace(/[^a-z0-9]+/g, '');
}

/**
 * Cheap, deterministic keyword variants for a biller's `senderPatterns` —
 * the forms a company name is likely to show up as in a real email (plain
 * lowercase, legal-suffix stripped, squashed with no punctuation, "&"/"and"
 * swapped, a guessed `.com` domain). Not fuzzy matching — just the small
 * set of formatting differences actually seen from senders/extraction.
 */
export function generateKeywordVariants(name: string): string[] {
  const trimmed = name.trim();
  if (!trimmed) return [];

  const lower = trimmed.toLowerCase();
  const noSuffix = lower.replace(LEGAL_SUFFIXES, '').replace(/\s+/g, ' ').trim();
  const squashed = normalizeKey(trimmed);

  const variants = new Set<string>([lower, noSuffix, squashed]);

  if (lower.includes('&')) variants.add(lower.replace(/&/g, 'and'));
  if (/\band\b/.test(lower)) variants.add(lower.replace(/\band\b/g, '&'));
  if (squashed) variants.add(`${squashed}.com`);

  variants.delete('');
  return Array.from(variants);
}
