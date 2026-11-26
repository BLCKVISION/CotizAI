import { Body, Controller, Delete, HttpCode, Put, Req, UseGuards, ValidationPipe } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsIn } from 'class-validator';
import { Repository } from 'typeorm';
import { User } from '../users/user.entity.js';
import { JwtGuard } from './jwt.guard.js';

/** Sube este número cuando cambie el tour para que vuelva a mostrarse a todas las cuentas. */
export const TOUR_VERSION = 1;

export const tourState = (u: Pick<User, 'tourStatus' | 'tourCompletedAt' | 'tourVersion'>) => ({
  tourStatus: u.tourStatus ?? null,
  tourCompletedAt: u.tourCompletedAt ?? null,
  needsTour: !u.tourStatus || u.tourVersion < TOUR_VERSION,
});

export class TourDto {
  @IsIn(['completed', 'skipped']) status!: 'completed' | 'skipped';
}

@Controller('v1/onboarding/tour')
@UseGuards(JwtGuard)
export class TourController {
  constructor(@InjectRepository(User) private users: Repository<User>) {}

  /** Marca el tour como completado u omitido (siempre sobre la cuenta del token). */
  @Put() async save(@Req() r: { userId: string }, @Body(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true })) dto: TourDto) {
    await this.users.update({ id: r.userId }, { tourStatus: dto.status, tourCompletedAt: new Date(), tourVersion: TOUR_VERSION });
    return tourState(await this.users.findOneByOrFail({ id: r.userId }));
  }

  /** Reinicia el tour ("Ver tour de nuevo"). */
  @Delete() @HttpCode(200) async reset(@Req() r: { userId: string }) {
    await this.users.update({ id: r.userId }, { tourStatus: null, tourCompletedAt: null, tourVersion: 0 });
    return tourState(await this.users.findOneByOrFail({ id: r.userId }));
  }
}
