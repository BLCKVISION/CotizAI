import { Body, Controller, Get, HttpCode, Param, ParseIntPipe, Post, Put, Req, UseGuards } from '@nestjs/common';
import { JwtGuard } from '../auth/jwt.guard.js';
import { OnboardingService } from './onboarding.service.js';

@Controller('onboarding')
@UseGuards(JwtGuard)
export class OnboardingController {
  constructor(private svc: OnboardingService) {}

  @Get() get(@Req() r: { userId: string }) { return this.svc.get(r.userId); }

  @Post('whatsapp/connect') @HttpCode(200)
  connect(@Req() r: { userId: string }) { return this.svc.connectWhatsapp(r.userId); }

  @Put('steps/:step')
  complete(@Req() r: { userId: string }, @Param('step', ParseIntPipe) step: number, @Body() body: Record<string, unknown>) {
    return this.svc.completeStep(r.userId, step, body);
  }
}
