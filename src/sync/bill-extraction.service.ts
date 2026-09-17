import { Injectable, Logger } from '@nestjs/common';
import type { EmailCandidate } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { GmailService, GoogleAuthError } from '../integrations/gmail.service.js';
import { GeminiService } from '../integrations/gemini.service.js';
import { CurrencyNormalizerService } from './currency-normalizer.service.js';
import { EmailCandidateService } from './email-candidate.service.js';
import { BillerCatalogService } from '../billers/biller-catalog.service.js';
import { UserBillerService } from '../billers/user-biller.service.js';
import { FxRateService } from '../fx/fx-rate.service.js';

/**
 * Stage 2 orchestration: takes one already-persisted EmailCandidate,
 * re-fetches its content, runs it through Gemini, normalizes the result,
 * resolves a biller, converts currency, and writes the resulting Bill row.
 *
 * Re-throws GoogleAuthError so the caller (the pg-boss sync job handler)
 * can flip the connection to `needs_reauth` — every other failure is
 * swallowed here and recorded as a rejected candidate, since one bad email
 * shouldn't fail the whole sync run.
 */
@Injectable()
export class BillExtractionService {
  private readonly logger = new Logger(BillExtractionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly gmailService: GmailService,
    private readonly geminiService: GeminiService,
    private readonly currencyNormalizer: CurrencyNormalizerService,
    private readonly emailCandidateService: EmailCandidateService,
    private readonly billerCatalog: BillerCatalogService,
    private readonly userBillerService: UserBillerService,
    private readonly fxRateService: FxRateService,
  ) {}

  async processCandidate(params: {
    userId: string;
    refreshToken: string;
    candidate: EmailCandidate;
  }): Promise<void> {
    const { userId, refreshToken, candidate } = params;

    try {
      const message = await this.gmailService.fetchMessage(refreshToken, candidate.gmailMessageId);
      const dateStr = message.receivedAt?.toISOString() ?? '';

      const pdf = message.pdfAttachments[0];
      const { raw, estimatedCostUsd } = pdf
        ? await this.geminiService.extractFromPdf(pdf.data, message.subject, message.sender, dateStr)
        : await this.geminiService.extractFromText(message.subject, message.sender, dateStr, message.bodyText);

      this.logger.log(
        `Gemini extraction cost estimate for candidate ${candidate.id}: ~$${estimatedCostUsd.toFixed(6)}`,
      );

      let extracted;
      try {
        extracted = this.geminiService.parseResponse(raw);
      } catch (parseError) {
        const msg = parseError instanceof Error ? parseError.message : String(parseError);
        await this.emailCandidateService.markProcessed(candidate.id, {
          isBill: false,
          rejectionReason: `Failed to parse Gemini response: ${msg}`,
        });
        return;
      }

      const currency = this.currencyNormalizer.normalize(extracted.currency);

      if (!extracted.is_bill) {
        await this.emailCandidateService.markProcessed(candidate.id, {
          isBill: false,
          rejectionReason: extracted.reasoning || 'Not identified as a bill',
        });
        return;
      }

      let userBillerId: string | null = null;
      if (extracted.company_name) {
        const biller = await this.billerCatalog.findOrCreateByName(extracted.company_name);
        const userBiller = await this.userBillerService.findOrCreateForUser(
          userId,
          biller?.id ?? null,
          extracted.company_name,
        );
        userBillerId = userBiller.id;
      }

      let convertedAmount: number | null = null;
      let convertedCurrency: string | null = null;
      let fxRateUsed: number | null = null;

      if (extracted.amount !== null && currency) {
        const user = await this.prisma.user.findUnique({
          where: { id: userId },
          select: { defaultCurrency: true },
        });
        const targetCurrency = user?.defaultCurrency;
        if (targetCurrency && targetCurrency.toUpperCase() !== currency.toUpperCase()) {
          const converted = await this.fxRateService.convert(extracted.amount, currency, targetCurrency);
          if (converted) {
            convertedAmount = converted.convertedAmount;
            convertedCurrency = targetCurrency;
            fxRateUsed = converted.rate;
          }
        }
      }

      await this.prisma.bill.create({
        data: {
          userId,
          userBillerId,
          emailCandidateId: candidate.id,
          extractedCompany: extracted.company_name,
          amount: extracted.amount,
          currency,
          dueDate: extracted.due_date ? new Date(extracted.due_date) : null,
          category: extracted.bill_type,
          confidence: extracted.confidence,
          convertedAmount,
          convertedCurrency,
          fxRateUsed,
        },
      });

      await this.emailCandidateService.markProcessed(candidate.id, { isBill: true });
    } catch (error) {
      if (error instanceof GoogleAuthError) throw error;
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Bill extraction failed for candidate ${candidate.id}: ${message}`);
      await this.emailCandidateService.markProcessed(candidate.id, {
        isBill: false,
        rejectionReason: `Extraction error: ${message}`,
      });
    }
  }
}
