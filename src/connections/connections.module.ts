import { Module, forwardRef } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { ConnectionController } from './connection.controller.js';
import { EmailConnectionService } from './email-connection.service.js';
import { TokenEncryptionService } from './token-encryption.service.js';
import { GoogleGmailStrategy } from './google-gmail.strategy.js';
import { GmailConnectStartGuard } from './gmail-connect-start.guard.js';
import { AuthModule } from '../auth/auth.module.js';

@Module({
  imports: [
    // UsersModule now imports ConnectionsModule (for account-deletion's
    // token revocation), closing a cycle back through AuthModule
    // (UsersModule -> ConnectionsModule -> AuthModule -> UsersModule) —
    // forwardRef defers this reference past module load, avoiding the
    // "Cannot access before initialization" ESM cycle error.
    forwardRef(() => AuthModule),
    PassportModule.register({ defaultStrategy: 'google-gmail' }),
  ],
  controllers: [ConnectionController],
  providers: [
    EmailConnectionService,
    TokenEncryptionService,
    GoogleGmailStrategy,
    GmailConnectStartGuard,
  ],
  exports: [EmailConnectionService],
})
export class ConnectionsModule {}
