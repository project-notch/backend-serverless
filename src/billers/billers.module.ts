import { Module } from '@nestjs/common';
import { BillerController } from './biller.controller.js';
import { BillerCatalogService } from './biller-catalog.service.js';
import { UserBillerService } from './user-biller.service.js';

@Module({
  controllers: [BillerController],
  providers: [BillerCatalogService, UserBillerService],
  exports: [BillerCatalogService, UserBillerService],
})
export class BillersModule {}
