import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

  async onModuleInit() {
    this.logger.log('DEBUG: $connect() starting');
    const start = Date.now();
    try {
      await this.$connect();
      this.logger.log(`DEBUG: $connect() succeeded in ${Date.now() - start}ms`);
    } catch (err) {
      this.logger.error(`DEBUG: $connect() failed after ${Date.now() - start}ms: ${err instanceof Error ? err.stack : String(err)}`);
      throw err;
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
