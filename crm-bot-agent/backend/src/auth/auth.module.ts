import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Onboarding } from '../onboarding/onboarding.entity.js';
import { User } from '../users/user.entity.js';
import { AuthController } from './auth.controller.js';
import { TourController } from './tour.js';
import { AuthService } from './auth.service.js';
import { JwtGuard } from './jwt.guard.js';

@Global()
@Module({
  imports: [
    TypeOrmModule.forFeature([User, Onboarding]),
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (c: ConfigService) => ({ secret: c.getOrThrow('JWT_SECRET'), signOptions: { expiresIn: '7d' } }),
    }),
  ],
  controllers: [AuthController, TourController],
  providers: [AuthService, JwtGuard],
  exports: [JwtModule, JwtGuard],
})
export class AuthModule {}
