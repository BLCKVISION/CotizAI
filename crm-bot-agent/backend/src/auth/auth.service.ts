import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import bcrypt from 'bcryptjs';
import { Repository } from 'typeorm';
import { Onboarding } from '../onboarding/onboarding.entity.js';
import { User } from '../users/user.entity.js';
import { slugify } from '../v1/mappers.js';
import { LoginDto, SignupDto } from './dto.js';
import { tourState } from './tour.js';

const DUMMY_HASH = bcrypt.hashSync('no-such-user', 10);

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User) private users: Repository<User>,
    @InjectRepository(Onboarding) private onboardings: Repository<Onboarding>,
    private jwt: JwtService,
  ) {}

  async signup(dto: SignupDto) {
    const email = dto.email.toLowerCase();
    if (await this.users.existsBy({ email })) throw new ConflictException('El email ya está registrado');
    const user = await this.users.save(
      this.users.create({ email, name: dto.name, companyName: dto.companyName, passwordHash: await bcrypt.hash(dto.password, 10) }),
    );
    await this.onboardings.save(this.onboardings.create({ userId: user.id }));
    return this.session(user);
  }

  async login(dto: LoginDto) {
    const user = await this.users.findOneBy({ email: dto.email.toLowerCase() });
    // Compara siempre contra un hash para que el tiempo de respuesta no delate si el email existe.
    const ok = await bcrypt.compare(dto.password, user?.passwordHash ?? DUMMY_HASH);
    if (!user || !ok) {
      throw new UnauthorizedException('Credenciales inválidas');
    }
    return this.session(user);
  }

  async me(userId: string) {
    const u = await this.users.findOneByOrFail({ id: userId });
    return { ...this.publicUser(u), user: this.publicUser(u), tenant: this.tenant(u) };
  }

  /** Usuario tal como lo espera el frontend de Replay (role fijo: cada cuenta es de un solo dueño). */
  private publicUser = (u: User) => ({ id: u.id, email: u.email, name: u.name, companyName: u.companyName, role: 'owner', ...tourState(u) });

  /** tenant == usuario en nuestro modelo. */
  private tenant = (u: User) => ({ id: u.id, name: u.companyName, slug: `${slugify(u.companyName)}-${u.id.slice(0, 6)}`, plan: 'trial', status: 'trial' });

  private async session(user: User) {
    const token = await this.jwt.signAsync({ sub: user.id });
    return { token, accessToken: token, user: this.publicUser(user), tenant: this.tenant(user) };
  }
}
