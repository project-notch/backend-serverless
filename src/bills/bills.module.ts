import { Module } from '@nestjs/common';
import { BillController } from './bills.controller.js';
import { BillService } from './bills.service.js';
import { AuthModule } from '../auth/auth.module.js';
import { FxModule } from '../fx/fx.module.js';

@Module({
  imports: [AuthModule, FxModule],
  controllers: [BillController],
  providers: [BillService],
  exports: [BillService],
})
export class BillsModule {}
