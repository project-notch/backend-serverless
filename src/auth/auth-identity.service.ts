import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class AuthIdentityService {
  constructor(private readonly prisma: PrismaService) {}

  async findByProvider(provider: string, providerAccountId: string) {
    return this.prisma.authIdentity.findUnique({
      where: { provider_providerAccountId: { provider, providerAccountId } },
      include: { user: true },
    });
  }

  async link(userId: string, provider: string, providerAccountId: string, email: string) {
    return this.prisma.authIdentity.create({
      data: { userId, provider, providerAccountId, email },
    });
  }
}
