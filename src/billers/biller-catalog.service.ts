import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { generateKeywordVariants, normalizeKey } from './keyword-variants.js';

@Injectable()
export class BillerCatalogService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Matches against the global Biller catalog by normalized name or by any
   * of its stored `senderPatterns` keywords, creating a new catalog entry
   * (seeded with keyword variants) when no match exists, so future
   * extractions or lookups for the same company resolve consistently. Every
   * match also broadens that catalog entry's keywords with variants of
   * whatever name it was just matched against, so the net for that company
   * grows over time instead of needing every variant seeded up front.
   *
   * TODO: true fuzzy matching (e.g. "Amazon Web Services" vs "AWS") is still
   * out of scope — this only collapses superficial formatting variants.
   */
  async findOrCreateByName(companyName: string) {
    const trimmed = companyName.trim();
    if (!trimmed) return null;

    const key = normalizeKey(trimmed);
    if (key) {
      const candidates = await this.prisma.biller.findMany();
      const existing = candidates.find(
        (b) => normalizeKey(b.canonicalName) === key || b.senderPatterns.some((p) => normalizeKey(p) === key),
      );
      if (existing) return this._growKeywords(existing, trimmed);
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
