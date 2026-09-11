import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { UserService } from '../users/user.service.js';
import { AuthIdentityService } from './auth-identity.service.js';
import { PasswordService } from './password.service.js';

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
      // account using a victim's email could take over their Notch account.
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

  signAccessToken(user: { id: string; email: string }): string {
    return this.jwtService.sign({ sub: user.id, email: user.email });
  }

  buildFrontendRedirectUrl(token: string): string {
    const frontendUrl = this.config.getOrThrow<string>('FRONTEND_URL');
    return `${frontendUrl}/auth/callback?token=${token}`;
  }
}
