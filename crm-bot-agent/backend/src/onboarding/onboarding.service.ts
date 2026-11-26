import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Onboarding, TOTAL_STEPS } from './onboarding.entity.js';

@Injectable()
export class OnboardingService {
  constructor(@InjectRepository(Onboarding) private repo: Repository<Onboarding>) {}

  async get(userId: string) {
    const o = (await this.repo.findOneBy({ userId })) ?? (await this.repo.save(this.repo.create({ userId })));
    return { ...o, totalSteps: TOTAL_STEPS };
  }

  /** Guarda los datos del paso y avanza. Los pasos no se pueden saltar. */
  async completeStep(userId: string, step: number, payload: Record<string, unknown>) {
    const o = await this.get(userId);
    if (step < 1 || step > TOTAL_STEPS) throw new BadRequestException('Paso inválido');
    if (step > o.currentStep) throw new BadRequestException('Completa los pasos anteriores primero');
    if (step > 1 && !o.whatsappConnected) throw new BadRequestException('Conecta WhatsApp primero');
    o.data = { ...o.data, [step]: payload };
    o.currentStep = Math.max(o.currentStep, Math.min(step + 1, TOTAL_STEPS));
    if (step === TOTAL_STEPS) o.completedAt = new Date();
    const { totalSteps, ...entity } = o;
    await this.repo.save(entity);
    return o;
  }

  /**
   * TODO: integrar Meta Embedded Signup. Por ahora simula la vinculación
   * para poder desarrollar el resto del flujo.
   */
  async connectWhatsapp(userId: string) {
    const o = await this.get(userId);
    const { totalSteps, ...entity } = o;
    entity.whatsappConnected = true;
    entity.currentStep = Math.max(entity.currentStep, 2);
    await this.repo.save(entity);
    return { ...entity, totalSteps };
  }
}
