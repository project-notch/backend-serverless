import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { UserService } from '../users/user.service.js';
import { MailService } from '../integrations/mail.service.js';
import { AuthIdentityService } from './auth-identity.service.js';
import { PasswordService } from './password.service.js';
import { MagicLinkService } from './magic-link.service.js';
import { MagicLinkRateLimiterService } from './magic-link-rate-limiter.service.js';

interface RegisterInput {
  email: string;
  username: string;
  password: string;
}

interface GoogleLoginInput {
  googleId: string;
  email: string;
  emailVerified: boolean;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly userService: UserService,
    private readonly authIdentityService: AuthIdentityService,
    private readonly passwordService: PasswordService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    private readonly mailService: MailService,
    private readonly magicLinkService: MagicLinkService,
    private readonly magicLinkRateLimiter: MagicLinkRateLimiterService,
  ) {}

  async register(input: RegisterInput) {
    const [existingEmail, existingUsername] = await Promise.all([
      this.userService.findByEmail(input.email),
      this.userService.findByUsername(input.username),
    ]);
    if (existingEmail) throw new ConflictException('Email already in use');
    if (existingUsername) throw new ConflictException('Username already taken');

    const passwordHash = await this.passwordService.hash(input.password);
    return this.userService.create({
      email: input.email,
      username: input.username,
      passwordHash,
      usernameSetByUser: true,
    });
  }

  async validatePasswordLogin(identifier: string, password: string) {
    const user = await this.userService.findByUsernameOrEmail(identifier);
    if (!user?.passwordHash) return null; // no such user, or an OAuth-only account with no password
    const valid = await this.passwordService.verify(password, user.passwordHash);
    return valid ? user : null;
  }

  async validateGoogleLogin(input: GoogleLoginInput) {
    const existingIdentity = await this.authIdentityService.findByProvider('google', input.googleId);
    if (existingIdentity) return existingIdentity.user;

    const existingUser = await this.userService.findByEmail(input.email);
    if (existingUser) {
      // Account-linking: only link if Google has verified ownership of this
      // email address. Without this check, anyone able to register a Google
      // account using a victim's email could take over their Nutian account.
      if (!input.emailVerified) {
        throw new UnauthorizedException(
          'An account already exists with this email. Sign in with your password, or verify this email with Google first.',
        );
      }
      await this.authIdentityService.link(existingUser.id, 'google', input.googleId, input.email);
      return existingUser;
    }

    const username = await this.userService.generateUsernameFromEmail(input.email);
    const newUser = await this.userService.create({ email: input.email, username });
    await this.authIdentityService.link(newUser.id, 'google', input.googleId, input.email);
    return newUser;
  }

  async requestMagicLink(email: string): Promise<void> {
    this.magicLinkRateLimiter.check(email);

    const existingUser = await this.userService.findByEmail(email);
    const token = this.magicLinkService.sign(email);
    const apiUrl = this.config.getOrThrow<string>('API_URL');
    const link = `${apiUrl}/auth/magic/callback?token=${token}`;
    await this.mailService.sendMagicLink(email, link, { isExistingUser: !!existingUser });
  }

  /** Mirrors validateGoogleLogin's find-or-create — a verified magic link is as good as a verified OAuth email. */
  async verifyMagicLink(token: string) {
    const email = this.magicLinkService.verify(token);
    const existingUser = await this.userService.findByEmail(email);
    if (existingUser) return existingUser;

    const username = await this.userService.generateUsernameFromEmail(email);
    return this.userService.create({ email, username });
  }

  /**
   * Finishes setting up an account that was created passwordless (magic-link
   * or Google) — sets a password so the user isn't locked into email/OAuth
   * only, and optionally lets them replace the auto-generated username.
   */
  async completeSetup(userId: string, input: { username?: string; password: string }) {
    if (input.username) {
      const existing = await this.userService.findByUsername(input.username);
      if (existing && existing.id !== userId) {
        throw new ConflictException('Username already taken');
      }
    }

    const passwordHash = await this.passwordService.hash(input.password);
    return this.userService.completeSetup(userId, {
      passwordHash,
      username: input.username,
    });
  }

  signAccessToken(user: { id: string; email: string }): string {
    return this.jwtService.sign({ sub: user.id, email: user.email });
  }

  buildFrontendRedirectUrl(token: string, reactivated = false): string {
    const frontendUrl = this.config.getOrThrow<string>('FRONTEND_URL');
    const suffix = reactivated ? '&reactivated=1' : '';
    return `${frontendUrl}/auth/callback?token=${token}${suffix}`;
  }
}
