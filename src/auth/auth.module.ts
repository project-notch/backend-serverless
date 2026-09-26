import { Module, forwardRef } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { AuthIdentityService } from './auth-identity.service.js';
import { PasswordService } from './password.service.js';
import { OAuthStateService } from './oauth-state.service.js';
import { MagicLinkService } from './magic-link.service.js';
import { MagicLinkRateLimiterService } from './magic-link-rate-limiter.service.js';
import { GoogleLoginStrategy } from './google-login.strategy.js';
import { LocalStrategy } from './local.strategy.js';
import { JwtStrategy } from './jwt.strategy.js';
import { JwtAuthGuard } from './jwt-auth.guard.js';
import { UsersModule } from '../users/users.module.js';
import { IntegrationsModule } from '../integrations/integrations.module.js';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    forwardRef(() => UsersModule),
    IntegrationsModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('JWT_SECRET'),
        // Interim value while password login exists without a refresh-token
        // table — 30 min was fine for Google-only login, but re-typing a
        // password every 30 min is not acceptable UX. Proper fix (short
        // access token + revocable refresh token) is tracked, not built yet.
        signOptions: { expiresIn: '7d' },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    AuthIdentityService,
    PasswordService,
    OAuthStateService,
    MagicLinkService,
    MagicLinkRateLimiterService,
    GoogleLoginStrategy,
    LocalStrategy,
    JwtStrategy,
    JwtAuthGuard,
  ],
  exports: [
    AuthService,
    AuthIdentityService,
    PasswordService,
    OAuthStateService,
    JwtAuthGuard,
    JwtModule,
    PassportModule,
  ],
})
export class AuthModule {}
