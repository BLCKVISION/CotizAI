import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { DataSource } from 'typeorm';

/** Sonda para Docker/despliegue: responde 200 solo si la base de datos contesta. No expone datos. */
@Controller('health')
@SkipThrottle()
export class HealthController {
  constructor(private db: DataSource) {}

  @Get() async check() {
    try { await this.db.query('SELECT 1'); } catch { throw new ServiceUnavailableException(); }
    return { status: 'ok' };
  }
}
