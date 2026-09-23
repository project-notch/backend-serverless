import { Module } from '@nestjs/common';
import { DashboardController } from './dashboard.controller.js';
import { DashboardService } from './dashboard.service.js';
import { AuthModule } from '../auth/auth.module.js';
import { FxModule } from '../fx/fx.module.js';

@Module({
  imports: [AuthModule, FxModule],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
