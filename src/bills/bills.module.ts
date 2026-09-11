import { Module } from '@nestjs/common';
import { BillController } from './bills.controller.js';
import { BillService } from './bills.service.js';

@Module({
  controllers: [BillController],
  providers: [BillService],
  exports: [BillService],
})
export class BillsModule {}
