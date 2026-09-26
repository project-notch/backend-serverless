import { Module, forwardRef } from '@nestjs/common';
import { UserController } from './user.controller.js';
import { PurgeController } from './purge.controller.js';
import { UserService } from './user.service.js';
import { AuthModule } from '../auth/auth.module.js';
import { ConnectionsModule } from '../connections/connections.module.js';

@Module({
  imports: [forwardRef(() => AuthModule), forwardRef(() => ConnectionsModule)],
  controllers: [UserController, PurgeController],
  providers: [UserService],
  exports: [UserService],
})
export class UsersModule {}
