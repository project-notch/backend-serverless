import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { AuthModule } from './auth/auth.module.js';
import { UsersModule } from './users/users.module.js';
import { ConnectionsModule } from './connections/connections.module.js';
import { BillersModule } from './billers/billers.module.js';
import { BillsModule } from './bills/bills.module.js';
import { DashboardModule } from './dashboard/dashboard.module.js';
import { FxModule } from './fx/fx.module.js';
import { SyncModule } from './sync/sync.module.js';
import { IntegrationsModule } from './integrations/integrations.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuthModule,
    UsersModule,
    ConnectionsModule,
    BillersModule,
    BillsModule,
    DashboardModule,
    FxModule,
    SyncModule,
    IntegrationsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
