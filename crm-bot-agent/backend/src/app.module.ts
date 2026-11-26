import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { ExecutionContext, Injectable } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HealthController } from './health.controller.js';
import { AuthModule } from './auth/auth.module.js';
import { OnboardingModule } from './onboarding/onboarding.module.js';
import { User } from './users/user.entity.js';
import { CrmModule } from './crm/crm.module.js';
import { CRM_ENTITIES } from './crm/entities.js';
import { Onboarding } from './onboarding/onboarding.entity.js';

/** El límite de peticiones solo aplica a HTTP; los mensajes de Socket.IO no pasan por él. */
@Injectable()
class HttpThrottlerGuard extends ThrottlerGuard {
  override canActivate(ctx: ExecutionContext) { return ctx.getType() === 'http' ? super.canActivate(ctx) : Promise.resolve(true); }
}

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    // Límite global por IP; login/registro tienen uno más estricto (ver AuthController).
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (c: ConfigService) => ({
        type: 'postgres',
        host: c.get('DB_HOST'),
        port: Number(c.get('DB_PORT')),
        username: c.get('DB_USER'),
        password: c.get('DB_PASS'),
        database: c.get('DB_NAME'),
        entities: [User, Onboarding, ...CRM_ENTITIES],
        // Sin migraciones todavía: en producción hay que activarlo explícitamente (DB_SYNC=true).
        synchronize: c.get('DB_SYNC') === 'true' || c.get('NODE_ENV') !== 'production',
      }),
    }),
    AuthModule,
    OnboardingModule,
    CrmModule,
  ],
  controllers: [HealthController],
  providers: [{ provide: APP_GUARD, useClass: HttpThrottlerGuard }],
})
export class AppModule {}
