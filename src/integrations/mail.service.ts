import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';

interface SendMailOptions {
  to: string;
  subject: string;
  html: string;
}

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly resend: Resend;
  private readonly from: string;

  constructor(config: ConfigService) {
    this.resend = new Resend(config.getOrThrow<string>('RESEND_API_KEY'));
    // resend.dev sender works without a verified domain — swap once Nutian has one.
    this.from = config.get<string>('MAIL_FROM') ?? 'Nutian <onboarding@resend.dev>';
  }

  async send({ to, subject, html }: SendMailOptions): Promise<void> {
    const { error } = await this.resend.emails.send({
      from: this.from,
      to,
      subject,
      html,
    });

    if (error) {
      this.logger.error(`Failed to send email to ${to}: ${error.message}`);
      throw new Error(`Failed to send email: ${error.message}`);
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
      subject: 'Your Nutian sign-in link',
      html: isExistingUser
        ? `<p>Click below to sign in to Nutian. This link expires in 15 minutes.</p>
<p><a href="${link}">${link}</a></p>
<p>If you didn't request this, you can ignore this email.</p>`
        : `<p>Click below to confirm your email and finish creating your Nutian account. This link expires in 15 minutes.</p>
<p><a href="${link}">${link}</a></p>
<p>If you didn't request this, you can ignore this email.</p>`,
    });
  }
}
