import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

interface CreateUserInput {
  email: string;
  username: string;
  passwordHash?: string;
}

@Injectable()
export class UserService {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: CreateUserInput) {
    return this.prisma.user.create({ data: input });
  }

  async findById(id: string) {
    return this.prisma.user.findUnique({ where: { id } });
  }

  async findByEmail(email: string) {
    return this.prisma.user.findUnique({ where: { email } });
  }

  async findByUsername(username: string) {
    return this.prisma.user.findUnique({ where: { username } });
  }

  /** Login accepts either a username or an email in the same field. */
  async findByUsernameOrEmail(identifier: string) {
    return this.prisma.user.findFirst({
      where: { OR: [{ username: identifier }, { email: identifier }] },
    });
  }

  /**
   * Turns an email into a unique, URL-safe username candidate for
   * Google-signup users who haven't picked one yet — e.g.
   * "jane.doe@gmail.com" -> "janedoe", "janedoe2", "janedoe3", ...
   */
  async generateUsernameFromEmail(email: string): Promise<string> {
    const base = email.split('@')[0].replace(/[^a-zA-Z0-9]/g, '').toLowerCase() || 'user';
    let candidate = base;
    let suffix = 1;
    while (await this.findByUsername(candidate)) {
      suffix += 1;
      candidate = `${base}${suffix}`;
    }
    return candidate;
  }
}
