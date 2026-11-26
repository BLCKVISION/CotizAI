import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OnboardingController } from './onboarding.controller.js';
import { Onboarding } from './onboarding.entity.js';
import { OnboardingService } from './onboarding.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([Onboarding])],
  controllers: [OnboardingController],
  providers: [OnboardingService],
  exports: [OnboardingService],
})
export class OnboardingModule {}
