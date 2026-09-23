import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { generateAcronyms, generateKeywordVariants, isNearMatch, normalizeKey } from './keyword-variants.js';

@Injectable()
export class BillerCatalogService {
  private readonly logger = new Logger(BillerCatalogService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Resolves a company name to a global Biller catalog entry, creating one
   * when nothing matches, so future extractions for the same company resolve
   * consistently. Matching runs widest-confidence-first:
   *
   * 1. Exact match on the normalized name or any stored `senderPatterns`
   *    keyword — collapses superficial formatting variants ("Netflix, Inc."
   *    vs "netflix.com").
   * 2. Acronym match ("AWS" vs "Amazon Web Services"), checked in both
   *    directions since either form can be the one already in the catalog.
   * 3. Near match on edit distance, for extraction typos ("netflx").
   *
   * Only exact and acronym matches broaden the catalog entry's keywords.
   * A fuzzy match deliberately does not, so that if it was wrong it affects
   * the one bill in front of it rather than permanently teaching the catalog
   * that a different company's name belongs to this entry.
   */
  async findOrCreateByName(companyName: string) {
    const trimmed = companyName.trim();
    if (!trimmed) return null;

    const key = normalizeKey(trimmed);
    if (key) {
      const candidates = await this.prisma.biller.findMany();

      const exact = candidates.find(
        (b) => normalizeKey(b.canonicalName) === key || b.senderPatterns.some((p) => normalizeKey(p) === key),
      );
      if (exact) return this._growKeywords(exact, trimmed);

      // The incoming name may be either the acronym or the long form, and
      // older catalog rows predate acronym seeding, so both directions are
      // generated and compared rather than relying on stored patterns alone.
      const incomingAcronyms = new Set(generateAcronyms(trimmed));
      const acronymMatch = candidates.find((b) => {
        if (incomingAcronyms.has(normalizeKey(b.canonicalName))) return true;
        return generateAcronyms(b.canonicalName).includes(key);
      });
      if (acronymMatch) {
        this.logger.log(`Acronym-matched "${trimmed}" to biller "${acronymMatch.canonicalName}"`);
        return this._growKeywords(acronymMatch, trimmed);
      }

      const nearMatch = candidates.find(
        (b) =>
          isNearMatch(normalizeKey(b.canonicalName), key) ||
          b.senderPatterns.some((p) => isNearMatch(normalizeKey(p), key)),
      );
      if (nearMatch) {
        this.logger.log(`Fuzzy-matched "${trimmed}" to biller "${nearMatch.canonicalName}" (keywords not broadened)`);
        return nearMatch;
      }
    }

    return this.prisma.biller.create({
      data: { canonicalName: trimmed, senderPatterns: generateKeywordVariants(trimmed) },
    });
  }

  private async _growKeywords(
    biller: { id: string; senderPatterns: string[] } & Record<string, unknown>,
    seenAsName: string,
  ) {
    const newVariants = generateKeywordVariants(seenAsName).filter((v) => !biller.senderPatterns.includes(v));
    if (newVariants.length === 0) return biller;

    return this.prisma.biller.update({
      where: { id: biller.id },
      data: { senderPatterns: { push: newVariants } },
    });
  }
}
