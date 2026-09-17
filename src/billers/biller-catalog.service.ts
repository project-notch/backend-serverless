import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class BillerCatalogService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Exact case-insensitive match against the global Biller catalog, creating
   * a new catalog entry when no match exists so future extractions for the
   * same company name resolve consistently.
   *
   * TODO: fuzzy matching (e.g. "Amazon Web Services" vs "AWS", punctuation/
   * legal-suffix variants) — exact case-insensitive match is a deliberate
   * MVP simplification per the plan, not the final resolution strategy.
   */
  async findOrCreateByName(companyName: string) {
    const trimmed = companyName.trim();
    if (!trimmed) return null;

    const existing = await this.prisma.biller.findFirst({
      where: { canonicalName: { equals: trimmed, mode: 'insensitive' } },
    });
    if (existing) return existing;

    return this.prisma.biller.create({ data: { canonicalName: trimmed } });
  }
}
