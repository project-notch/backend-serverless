import { Module } from '@nestjs/common';
import { GmailService } from './gmail.service.js';
import { GeminiService } from './gemini.service.js';
import { FxProviderService } from './fx-provider.service.js';
import { MailService } from './mail.service.js';

@Module({
  providers: [GmailService, GeminiService, FxProviderService, MailService],
  exports: [GmailService, GeminiService, FxProviderService, MailService],
})
export class IntegrationsModule {}
