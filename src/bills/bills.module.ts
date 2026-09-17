import { Module } from '@nestjs/common';
import { BillController } from './bills.controller.js';
import { BillService } from './bills.service.js';
import { AuthModule } from '../auth/auth.module.js';

@Module({
  imports: [AuthModule],
  controllers: [BillController],
  providers: [BillService],
  exports: [BillService],
})
export class BillsModule {}
