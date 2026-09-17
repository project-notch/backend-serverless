import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import type { MessageMetadata } from '../integrations/gmail.service.js';

@Injectable()
export class EmailCandidateService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Persists a candidate found via keyword search or history.list.
   * Dedup relies on the `@@unique([emailConnectionId, gmailMessageId])`
   * constraint on EmailCandidate — `upsert` makes re-running sync on the
   * same mailbox idempotent instead of erroring on the unique violation.
   */
  async upsertCandidate(params: {
    userId: string;
    emailConnectionId: string;
    message: MessageMetadata;
  }) {
    const { userId, emailConnectionId, message } = params;
    return this.prisma.emailCandidate.upsert({
      where: {
        emailConnectionId_gmailMessageId: {
          emailConnectionId,
          gmailMessageId: message.gmailMessageId,
        },
      },
      update: {},
      create: {
        userId,
        emailConnectionId,
        gmailMessageId: message.gmailMessageId,
        subject: message.subject,
        sender: message.sender,
        receivedAt: message.receivedAt,
      },
    });
  }

  async findUnprocessed(emailConnectionId: string, limit: number) {
    return this.prisma.emailCandidate.findMany({
      where: { emailConnectionId, processed: false },
      orderBy: { createdAt: 'asc' },
      take: limit,
    });
  }

  async markProcessed(
    candidateId: string,
    result: { isBill: boolean; rejectionReason?: string | null },
  ) {
    return this.prisma.emailCandidate.update({
      where: { id: candidateId },
      data: {
        processed: true,
        isBill: result.isBill,
        rejectionReason: result.rejectionReason ?? null,
      },
    });
  }
}
