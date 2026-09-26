import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
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
    // Not bound as a global guard — only /auth/login and /auth/register
    // (@UseGuards(ThrottlerGuard) + @Throttle there) opt in, so every other
    // endpoint's normal call volume (e.g. mobile's dashboard polling) is
    // unaffected. In-memory store: on Vercel this only tracks a single warm
    // lambda instance, not a shared count across every concurrent instance —
    // real defense-in-depth here still needs a shared store (Redis/Upstash),
    // tracked separately. This still stops the common case (one attacker
    // hammering from one connection during a warm instance's lifetime).
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 5 }]),
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
