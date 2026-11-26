import { Body, Controller, Get, HttpCode, Post, Req, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service.js';
import { LoginDto, SignupDto } from './dto.js';
import { JwtGuard } from './jwt.guard.js';

@Controller('auth')
export class AuthController {
  constructor(private auth: AuthService) {}

  // Anti fuerza bruta: 10 intentos por minuto y por IP.
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  @Post(['signup', 'register']) signup(@Body() dto: SignupDto) { return this.auth.signup(dto); }
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  @Post('login') @HttpCode(200) login(@Body() dto: LoginDto) { return this.auth.login(dto); }
  @Get('me') @UseGuards(JwtGuard) me(@Req() req: { userId: string }) { return this.auth.me(req.userId); }
}
