import { ConflictException, ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { PasswordService } from '../auth/password.service.js';
import { EmailConnectionService } from '../connections/email-connection.service.js';

interface CreateUserInput {
  email: string;
  username: string;
  passwordHash?: string;
  usernameSetByUser?: boolean;
}

const RETENTION_DAYS = 365;

@Injectable()
export class UserService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwordService: PasswordService,
    private readonly emailConnectionService: EmailConnectionService,
  ) {}

  async create(input: CreateUserInput) {
    return this.prisma.user.create({ data: input });
  }

  async findById(id: string) {
    return this.prisma.user.findUnique({ where: { id } });
  }

  async findByEmail(email: string) {
    return this.prisma.user.findUnique({ where: { email } });
  }

  async findByUsername(username: string) {
    return this.prisma.user.findUnique({ where: { username } });
  }

  /**
   * Sets the account's password and, if provided, replaces the
   * auto-generated username with a user-chosen one — flips
   * `usernameSetByUser` so the app knows not to keep prompting for it.
   */
  async completeSetup(userId: string, input: { passwordHash: string; username?: string }) {
    return this.prisma.user.update({
      where: { id: userId },
      data: {
        passwordHash: input.passwordHash,
        ...(input.username ? { username: input.username, usernameSetByUser: true } : {}),
      },
    });
  }

  async updateProfile(
    userId: string,
    input: { username?: string; phone?: string; defaultCurrency?: string; timezone?: string },
  ) {
    if (input.username) {
      const existing = await this.findByUsername(input.username);
      if (existing && existing.id !== userId) {
        throw new ConflictException('That username is already taken');
      }
    }
    return this.prisma.user.update({
      where: { id: userId },
      data: {
        ...(input.username ? { username: input.username, usernameSetByUser: true } : {}),
        ...(input.phone !== undefined ? { phone: input.phone || null } : {}),
        ...(input.defaultCurrency !== undefined
          ? { defaultCurrency: input.defaultCurrency || null }
          : {}),
        ...(input.timezone !== undefined ? { timezone: input.timezone || null } : {}),
      },
    });
  }

  /**
   * Deletes the account. Password accounts must confirm with their current
   * password first, since a bearer JWT alone (7-day lifetime, see
   * AuthModule) isn't enough confidence for an irreversible action;
   * Google-only accounts (no passwordHash) have nothing to confirm with, so
   * they skip straight through.
   *
   * `keepBillData: false` (default) deletes everything immediately — auth
   * identities, connected inboxes, scanned message metadata, billers,
   * bills all cascade away with the User row.
   *
   * `keepBillData: true` instead moves the account to `pending_deletion`
   * and disconnects every inbox, but keeps the User row (and its bills)
   * for [RETENTION_DAYS] — [reactivateIfPending] cancels this entirely if
   * they log back in before then; otherwise a scheduled purge
   * (see PurgeService) deletes the row once `purgeAt` passes.
   */
  async remove(
    userId: string,
    { password, keepBillData = false }: { password?: string; keepBillData?: boolean },
  ): Promise<{ purgeAt: Date | null }> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) return { purgeAt: null };

    if (user.passwordHash) {
      const valid = password ? await this.passwordService.verify(password, user.passwordHash) : false;
      if (!valid) throw new ForbiddenException('Incorrect password');
    }

    if (!keepBillData) {
      await this.emailConnectionService.revokeAllForUser(userId);
      await this.prisma.user.delete({ where: { id: userId } });
      return { purgeAt: null };
    }

    await this.emailConnectionService.disconnectAllForUser(userId);
    const purgeAt = new Date(Date.now() + RETENTION_DAYS * 24 * 60 * 60 * 1000);
    await this.prisma.user.update({
      where: { id: userId },
      data: { status: 'pending_deletion', pendingDeletionAt: new Date(), purgeAt },
    });
    return { purgeAt };
  }

  /**
   * Cancels a pending deletion outright when the user logs back in during
   * the retention window — full reactivation, not just a pushed-out date.
   * Called from every fresh-login entry point (password, Google, magic
   * link), never from ordinary JWT-authenticated requests.
   */
  async reactivateIfPending(userId: string): Promise<boolean> {
    const { count } = await this.prisma.user.updateMany({
      where: { id: userId, status: 'pending_deletion' },
      data: { status: 'active', pendingDeletionAt: null, purgeAt: null },
    });
    return count > 0;
  }

  /**
   * Hard-deletes every account whose retention window has passed —
   * called by PurgeService on a schedule, not directly reachable by users.
   */
  async purgeExpired(): Promise<number> {
    const expired = await this.prisma.user.findMany({
      where: { status: 'pending_deletion', purgeAt: { lte: new Date() } },
      select: { id: true },
    });
    for (const { id } of expired) {
      await this.prisma.user.delete({ where: { id } });
    }
    return expired.length;
  }

  /** Login accepts either a username or an email in the same field. */
  async findByUsernameOrEmail(identifier: string) {
    return this.prisma.user.findFirst({
      where: { OR: [{ username: identifier }, { email: identifier }] },
    });
  }

  /**
   * Turns an email into a unique, URL-safe username candidate for
   * Google-signup users who haven't picked one yet — e.g.
   * "jane.doe@gmail.com" -> "janedoe", "janedoe2", "janedoe3", ...
   */
  async generateUsernameFromEmail(email: string): Promise<string> {
    const base = email.split('@')[0].replace(/[^a-zA-Z0-9]/g, '').toLowerCase() || 'user';
    let candidate = base;
    let suffix = 1;
    while (await this.findByUsername(candidate)) {
      suffix += 1;
      candidate = `${base}${suffix}`;
    }
    return candidate;
  }
}
