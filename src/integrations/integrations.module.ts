import { Module } from '@nestjs/common';
import { GmailService } from './gmail.service.js';
import { GeminiService } from './gemini.service.js';
import { FxProviderService } from './fx-provider.service.js';

@Module({
  providers: [GmailService, GeminiService, FxProviderService],
  exports: [GmailService, GeminiService, FxProviderService],
})
export class IntegrationsModule {}
