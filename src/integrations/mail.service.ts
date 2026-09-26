import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import sgMail from '@sendgrid/mail';
import { renderMagicLinkEmail } from './email-templates/magic-link.template.js';
import { renderPasswordResetEmail } from './email-templates/password-reset.template.js';

interface SendMailOptions {
  to: string;
  subject: string;
  html: string;
}

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly from: string;
  private clientReady = false;

  constructor(private readonly config: ConfigService) {
    // Must be a SendGrid Single Sender verified address — see MAIL_FROM in .env.example.
    this.from = config.get<string>('MAIL_FROM') ?? 'Nutian <onboarding@example.com>';
  }

  /**
   * API key set lazily, on first send, instead of in the constructor — so a missing
   * SENDGRID_API_KEY only breaks the email-sending path, not app boot. This service
   * is eagerly instantiated as part of AuthModule's DI graph, so a constructor-time
   * getOrThrow would take the whole API down over one missing integration key (as it
   * did in production with Resend).
   */
  private ensureClient(): void {
    if (!this.clientReady) {
      sgMail.setApiKey(this.config.getOrThrow<string>('SENDGRID_API_KEY'));
      this.clientReady = true;
    }
  }

  async send({ to, subject, html }: SendMailOptions): Promise<void> {
    this.ensureClient();

    try {
      await sgMail.send({ to, from: this.from, subject, html });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to send email to ${to}: ${message}`);
      throw new Error(`Failed to send email: ${message}`);
    }
  }

  async sendMagicLink(
    to: string,
    link: string,
    options?: { isExistingUser?: boolean },
  ): Promise<void> {
    const isExistingUser = options?.isExistingUser ?? false;
    await this.send({
      to,
      subject: isExistingUser ? 'Your Nutian sign-in link' : 'Confirm your Nutian account',
      html: renderMagicLinkEmail(link, isExistingUser),
    });
  }

  async sendPasswordReset(to: string, link: string): Promise<void> {
    await this.send({
      to,
      subject: 'Reset your Nutian password',
      html: renderPasswordResetEmail(link),
    });
  }
}
