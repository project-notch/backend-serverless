const LEGAL_SUFFIXES = /\b(inc|llc|ltd|co|corp|corporation|company|gmbh|plc)\b\.?/gi;

/**
 * Filler words that may or may not survive into a real acronym — "Bank of
 * Ceylon" is BOC (keeps "of") but "The Coca-Cola Company" is not TCC. Both
 * forms get generated rather than guessing which convention a given company
 * follows.
 */
const ACRONYM_STOPWORDS = new Set(['of', 'the', 'and', 'for', 'a', 'an']);

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
 * Acronyms a multi-word company name plausibly goes by — "Amazon Web
 * Services" -> "aws", "Bank of Ceylon" -> "boc"/"bc". Deterministic, not
 * fuzzy: these are seeded as `senderPatterns` so a later bill that says only
 * "AWS" resolves through the ordinary exact-match path.
 *
 * Deliberately narrow: needs 2+ real words, and the result must be 3-6
 * letters. A 2-letter acronym collides with far too much to be safe, and
 * nobody refers to a company by a 7-letter initialism.
 */
export function generateAcronyms(name: string): string[] {
  const words = name
    .toLowerCase()
    .replace(LEGAL_SUFFIXES, '')
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length > 0 && /^[a-z]/.test(word));

  if (words.length < 2) return [];

  const withStopwords = words.map((word) => word[0]).join('');
  const withoutStopwords = words
    .filter((word) => !ACRONYM_STOPWORDS.has(word))
    .map((word) => word[0])
    .join('');

  return [...new Set([withStopwords, withoutStopwords])].filter(
    (acronym) => acronym.length >= 3 && acronym.length <= 6,
  );
}

/**
 * Cheap, deterministic keyword variants for a biller's `senderPatterns` —
 * the forms a company name is likely to show up as in a real email (plain
 * lowercase, legal-suffix stripped, squashed with no punctuation, "&"/"and"
 * swapped, a guessed `.com` domain, and any plausible acronym). Not fuzzy
 * matching — just the set of formatting differences actually seen from
 * senders/extraction.
 */
export function generateKeywordVariants(name: string): string[] {
  const trimmed = name.trim();
  if (!trimmed) return [];

  const lower = trimmed.toLowerCase();
  const noSuffix = lower.replace(LEGAL_SUFFIXES, '').replace(/\s+/g, ' ').trim();
  const squashed = normalizeKey(trimmed);

  const variants = new Set<string>([lower, noSuffix, squashed, ...generateAcronyms(trimmed)]);

  if (lower.includes('&')) variants.add(lower.replace(/&/g, 'and'));
  if (/\band\b/.test(lower)) variants.add(lower.replace(/\band\b/g, '&'));
  if (squashed) variants.add(`${squashed}.com`);

  variants.delete('');
  return Array.from(variants);
}

/**
 * Levenshtein distance, capped — returns `max + 1` as soon as it's clear the
 * real distance exceeds `max`, so a long non-match bails early instead of
 * filling the whole DP table.
 */
function boundedLevenshtein(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;

  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    let rowBest = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      const value = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + cost);
      current.push(value);
      if (value < rowBest) rowBest = value;
    }
    if (rowBest > max) return max + 1;
    previous = current;
  }
  return previous[b.length];
}

/**
 * Whether two already-normalized biller keys are close enough to be the same
 * company, for catching extraction typos ("netflx" vs "netflix").
 *
 * The length floor and the length-scaled budget are the whole safety story
 * here: at 3-4 characters a single edit is the difference between genuinely
 * unrelated companies ("ola"/"olx"), so short keys are never fuzzy-matched
 * at all. A false positive merges two real billers' history together, which
 * is a worse outcome than leaving a typo'd name as its own catalog entry.
 */
export function isNearMatch(a: string, b: string): boolean {
  const longest = Math.max(a.length, b.length);
  if (longest < 5) return false;

  const budget = longest >= 9 ? 2 : 1;
  return boundedLevenshtein(a, b, budget) <= budget;
}
