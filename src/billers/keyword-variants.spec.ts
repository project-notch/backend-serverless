import { describe, expect, it } from 'vitest';
import { generateAcronyms, generateKeywordVariants, isNearMatch, normalizeKey } from './keyword-variants.js';

describe('generateAcronyms', () => {
  it('derives the acronym a multi-word company actually goes by', () => {
    expect(generateAcronyms('Amazon Web Services')).toContain('aws');
    expect(generateAcronyms('Sri Lanka Telecom')).toContain('slt');
  });

  it('covers both conventions for names containing filler words', () => {
    // "Bank of Ceylon" is BOC in practice, but "The Coca-Cola Company" is not
    // TCC — so both the with- and without-stopword forms are generated.
    expect(generateAcronyms('Board of Investment Sri Lanka')).toEqual(
      expect.arrayContaining(['boisl', 'bisl']),
    );
  });

  it('still drops a stopword-stripped form that falls under the length floor', () => {
    // "Bank of Ceylon" -> "boc" (kept) and "bc" (dropped: 2 letters is far
    // too collision-prone to match on).
    expect(generateAcronyms('Bank of Ceylon')).toEqual(['boc']);
  });

  it('ignores single-word names, which have no acronym', () => {
    expect(generateAcronyms('Netflix')).toEqual([]);
  });

  it('rejects acronyms too short to be distinctive or too long to be real', () => {
    // 2 letters collides with far too much.
    expect(generateAcronyms('Acme Corp')).toEqual([]);
    expect(generateAcronyms('One Two Three Four Five Six Seven')).toEqual([]);
  });

  it('is exposed through the keyword variants a new catalog entry is seeded with', () => {
    expect(generateKeywordVariants('Amazon Web Services')).toContain('aws');
  });
});

describe('isNearMatch', () => {
  const key = (name: string) => normalizeKey(name);

  it('catches single-character extraction typos', () => {
    expect(isNearMatch(key('netflix'), key('netflx'))).toBe(true);
    expect(isNearMatch(key('amazon'), key('amazan'))).toBe(true);
  });

  it('allows a second edit only once the name is long enough to afford it', () => {
    expect(isNearMatch(key('sltmobitel'), key('sltmobtel'))).toBe(true);
    // 8 characters — budget is 1, and this is 2 edits away.
    expect(isNearMatch(key('dialogtv'), key('dialog'))).toBe(false);
  });

  it('never fuzzy-matches short names, where one edit means a different company', () => {
    expect(isNearMatch(key('ola'), key('olx'))).toBe(false);
    expect(isNearMatch(key('uber'), key('user'))).toBe(false);
    expect(isNearMatch(key('hsbc'), key('hsbo'))).toBe(false);
  });

  it('keeps genuinely different companies apart', () => {
    expect(isNearMatch(key('netflix'), key('spotify'))).toBe(false);
    expect(isNearMatch(key('Bank of Ceylon'), key('Peoples Bank'))).toBe(false);
  });

  it('matches a name against itself', () => {
    expect(isNearMatch(key('Dialog Axiata'), key('Dialog Axiata'))).toBe(true);
  });
});
