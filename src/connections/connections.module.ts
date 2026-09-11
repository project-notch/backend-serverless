import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { ConnectionController } from './connection.controller.js';
import { EmailConnectionService } from './email-connection.service.js';
import { TokenEncryptionService } from './token-encryption.service.js';
import { GoogleGmailStrategy } from './google-gmail.strategy.js';
import { GmailConnectStartGuard } from './gmail-connect-start.guard.js';
import { AuthModule } from '../auth/auth.module.js';

@Module({
  imports: [
    // AuthModule no longer needs anything from ConnectionsModule (that
    // dependency moved out with EmailConnectionService's token-encryption
    // fix), so this import is safely one-directional.
    AuthModule,
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
