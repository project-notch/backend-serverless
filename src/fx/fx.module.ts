import { Module } from '@nestjs/common';
import { FxRateService } from './fx-rate.service.js';
import { IntegrationsModule } from '../integrations/integrations.module.js';

@Module({
  imports: [IntegrationsModule],
  providers: [FxRateService],
  exports: [FxRateService],
})
export class FxModule {}
