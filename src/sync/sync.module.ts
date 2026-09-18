import { Module } from '@nestjs/common';
import { SyncController } from './sync.controller.js';
import { SyncService } from './sync.service.js';
import { KeywordFilterService } from './keyword-filter.service.js';
import { EmailCandidateService } from './email-candidate.service.js';
import { CurrencyNormalizerService } from './currency-normalizer.service.js';
import { BillExtractionService } from './bill-extraction.service.js';
import { IntegrationsModule } from '../integrations/integrations.module.js';
import { BillersModule } from '../billers/billers.module.js';
import { FxModule } from '../fx/fx.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { ConnectionsModule } from '../connections/connections.module.js';

@Module({
  // ConnectionsModule only ever imports AuthModule (one-directional, see
  // PROJECT-CONTEXT.md's TokenEncryptionService note), so importing it here
  // for EmailConnectionService doesn't create a cycle back into SyncModule.
  imports: [IntegrationsModule, BillersModule, FxModule, AuthModule, ConnectionsModule],
  controllers: [SyncController],
  providers: [
    SyncService,
    KeywordFilterService,
    EmailCandidateService,
    CurrencyNormalizerService,
    BillExtractionService,
  ],
})
export class SyncModule {}
