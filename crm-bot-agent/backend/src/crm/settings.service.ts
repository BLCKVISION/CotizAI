import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BusinessSettings } from './entities.js';

const BCV_URL = () => process.env['BCV_RATE_URL'] ?? 'https://ve.dolarapi.com/v1/dolares/oficial';

@Injectable()
export class SettingsService {
  private log = new Logger('Settings');
  constructor(@InjectRepository(BusinessSettings) private repo: Repository<BusinessSettings>) {}

  private async get(userId: string) {
    return (await this.repo.findOneBy({ userId })) ?? this.repo.save(this.repo.create({ userId }));
  }

  private view = (s: BusinessSettings) => ({ rate: s.bcvRate, auto: s.bcvAuto, updatedAt: s.bcvUpdatedAt });

  async bcv(userId: string) { return this.view(await this.get(userId)); }

  /** Tasa Bs/USD vigente para convertir precios (null si no se configuró). */
  async rate(userId: string) { return (await this.repo.findOneBy({ userId }))?.bcvRate ?? null; }

  async saveBcv(userId: string, dto: { rate?: number; auto?: boolean }) {
    const s = await this.get(userId);
    if (dto.rate !== undefined) { s.bcvRate = dto.rate; s.bcvUpdatedAt = new Date(); }
    if (dto.auto !== undefined) s.bcvAuto = dto.auto;
    return this.view(await this.repo.save(s));
  }

  /** Lee la tasa oficial de una API pública. Si falla, conserva la tasa anterior. */
  async fetchOfficialRate() {
    const res = await fetch(BCV_URL(), { signal: AbortSignal.timeout(8000), headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body = (await res.json()) as { promedio?: number; venta?: number };
    const rate = Number(body.promedio ?? body.venta);
    if (!Number.isFinite(rate) || rate <= 0 || rate > 1e9) throw new Error('Respuesta sin tasa válida');
    return rate;
  }

  async refreshBcv(userId: string) {
    let rate: number;
    try { rate = await this.fetchOfficialRate(); } catch (e) { throw new BadRequestException(`No se pudo obtener la tasa oficial: ${(e as Error).message}`); }
    return this.saveBcv(userId, { rate });
  }

  /** Usado por el planificador: actualiza a todos los usuarios con tasa automática. */
  async refreshAuto() {
    const users = await this.repo.findBy({ bcvAuto: true });
    if (!users.length) return;
    try {
      const rate = await this.fetchOfficialRate();
      for (const s of users) { s.bcvRate = rate; s.bcvUpdatedAt = new Date(); }
      await this.repo.save(users);
    } catch (e) { this.log.warn(`Tasa BCV no actualizada: ${(e as Error).message}`); }
  }
}
