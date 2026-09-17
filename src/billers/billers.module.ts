import { Module } from '@nestjs/common';
import { BillerController } from './biller.controller.js';
import { BillerCatalogService } from './biller-catalog.service.js';
import { UserBillerService } from './user-biller.service.js';
import { AuthModule } from '../auth/auth.module.js';

@Module({
  imports: [AuthModule],
  controllers: [BillerController],
  providers: [BillerCatalogService, UserBillerService],
  exports: [BillerCatalogService, UserBillerService],
})
export class BillersModule {}
