import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenAI } from '@google/genai';

const MODEL_NAME = 'gemini-flash-lite-latest';

/**
 * Ported verbatim from the Python POC
 * (`demo-runs/bill-detector-poc/src/stage2_extract.py`, `PROMPT_TEMPLATE`).
 */
const PROMPT_TEMPLATE = `You are extracting structured bill data from an email.

Return ONLY a JSON object (no markdown fences, no prose) matching exactly this schema:
{
  "is_bill": boolean,
  "company_name": string or null,
  "amount": number or null,
  "currency": string or null,
  "due_date": string (YYYY-MM-DD) or null,
  "bill_type": "utility" | "telecom" | "subscription" | "insurance" | "membership" | "other" | null,
  "confidence": number (0 to 1),
  "reasoning": string (max 20 words)
}

Rules:
- If the email/document is not a bill, invoice, or payment obligation: is_bill=false, all other fields null except confidence/reasoning.
- Resolve relative due dates ("due in 10 days") against the email's received date, not today's real date.
- Never hallucinate an amount. If none is stated, amount=null.
- confidence reflects certainty in the extraction being correct, not general confidence.

{content_block}
`;

export interface BillExtractionResult {
  is_bill: boolean;
  company_name: string | null;
  amount: number | null;
  currency: string | null;
  due_date: string | null;
  bill_type: 'utility' | 'telecom' | 'subscription' | 'insurance' | 'membership' | 'other' | null;
  confidence: number;
  reasoning: string;
}

/**
 * Rough per-call cost estimate for the cost-guard log line in
 * BillExtractionService — gemini-flash-lite-latest pricing as of the POC's
 * validation run. Deliberately approximate: token counts aren't returned by
 * every call path, so this is an order-of-magnitude guard, not a billing
 * reconciliation.
 */
const APPROX_USD_PER_1K_INPUT_TOKENS = 0.0001;
const APPROX_USD_PER_1K_OUTPUT_TOKENS = 0.0004;

@Injectable()
export class GeminiService {
  private readonly logger = new Logger(GeminiService.name);
  private client: GoogleGenAI | null = null;

  constructor(private readonly config: ConfigService) {}

  /**
   * Lazily constructed — same reasoning as MailService.ensureClient: a
   * missing GEMINI_API_KEY should only break the extraction path, not app
   * boot, since GeminiService sits in the eagerly-instantiated
   * IntegrationsModule DI graph.
   */
  private getClient(): GoogleGenAI {
    if (!this.client) {
      this.client = new GoogleGenAI({ apiKey: this.config.getOrThrow<string>('GEMINI_API_KEY') });
    }
    return this.client;
  }

  private buildPrompt(contentBlock: string): string {
    return PROMPT_TEMPLATE.replace('{content_block}', contentBlock);
  }

  /**
   * Text-only extraction — ported from the POC's `call_gemini_text_raw`.
   */
  async extractFromText(
    subject: string,
    sender: string,
    date: string,
    body: string,
  ): Promise<{ raw: string; estimatedCostUsd: number }> {
    const contentBlock = `EMAIL:\nSUBJECT: ${subject}\nFROM: ${sender}\nRECEIVED_DATE: ${date}\n\n${body}`;
    const prompt = this.buildPrompt(contentBlock);

    this.logger.log(`generateContent (text) — subject="${subject}"`);
    try {
      const response = await this.getClient().models.generateContent({
        model: MODEL_NAME,
        contents: prompt,
      });
      return { raw: response.text ?? '', estimatedCostUsd: this.estimateCost(prompt, response.text ?? '') };
    } catch (error) {
      this.logger.error(`generateContent (text) failed: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  /**
   * PDF multimodal extraction — ported from the POC's `call_gemini_pdf_bytes`.
   */
  async extractFromPdf(
    pdfBytes: Buffer,
    subject: string,
    sender: string,
    date: string,
  ): Promise<{ raw: string; estimatedCostUsd: number }> {
    const contentBlock =
      `The bill document is attached as a PDF.\n` +
      `EMAIL SUBJECT: ${subject}\nEMAIL FROM: ${sender}\nEMAIL RECEIVED_DATE: ${date}\n` +
      `Use EMAIL RECEIVED_DATE to resolve any relative due date stated in the PDF ` +
      `(e.g. 'due in 5 days', 'within 5 days of receipt').`;
    const prompt = this.buildPrompt(contentBlock);

    this.logger.log(`generateContent (pdf) — subject="${subject}" pdfBytes=${pdfBytes.length}`);
    try {
      const response = await this.getClient().models.generateContent({
        model: MODEL_NAME,
        contents: [
          { text: prompt },
          { inlineData: { mimeType: 'application/pdf', data: pdfBytes.toString('base64') } },
        ],
      });

      return {
        raw: response.text ?? '',
        // PDF bytes dominate input tokens in a way plain string length can't
        // estimate — treated as a fixed rough addition rather than modeled precisely.
        estimatedCostUsd: this.estimateCost(prompt, response.text ?? '', pdfBytes.length),
      };
    } catch (error) {
      this.logger.error(`generateContent (pdf) failed: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  /**
   * Ported from the POC's `parse_json_response` — strips an optional
   * markdown code fence, then parses. Throws on invalid JSON; the caller
   * (BillExtractionService) is responsible for turning that into a
   * rejected/failed candidate rather than letting it bubble up.
   */
  parseResponse(raw: string): BillExtractionResult {
    let cleaned = raw.trim();
    if (cleaned.startsWith('```')) {
      cleaned = cleaned.replace(/^`+/, '').replace(/`+$/, '');
      const firstNewline = cleaned.indexOf('\n');
      cleaned = firstNewline >= 0 ? cleaned.slice(firstNewline + 1) : cleaned;
      if (cleaned.toLowerCase().startsWith('json')) {
        cleaned = cleaned.slice(4);
      }
    }
    const parsed = JSON.parse(cleaned.trim());
    this.validate(parsed);
    return parsed as BillExtractionResult;
  }

  private validate(parsed: unknown): asserts parsed is BillExtractionResult {
    if (typeof parsed !== 'object' || parsed === null) {
      throw new Error('Gemini response is not a JSON object');
    }
    const obj = parsed as Record<string, unknown>;
    if (typeof obj.is_bill !== 'boolean') {
      throw new Error('Gemini response missing boolean is_bill');
    }
    if (typeof obj.confidence !== 'number') {
      throw new Error('Gemini response missing numeric confidence');
    }
  }

  private estimateCost(prompt: string, output: string, extraBytes = 0): number {
    // Rough token-per-character heuristic (~4 chars/token for English text),
    // good enough for an order-of-magnitude cost-guard log, not billing.
    const inputTokens = Math.ceil((prompt.length + extraBytes) / 4);
    const outputTokens = Math.ceil(output.length / 4);
    const cost =
      (inputTokens / 1000) * APPROX_USD_PER_1K_INPUT_TOKENS +
      (outputTokens / 1000) * APPROX_USD_PER_1K_OUTPUT_TOKENS;
    this.logger.debug(
      `Gemini call estimate: ~${inputTokens} input tokens, ~${outputTokens} output tokens, ~$${cost.toFixed(6)}`,
    );
    return cost;
  }
}
