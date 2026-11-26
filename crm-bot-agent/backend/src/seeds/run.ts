/**
 * Seeders de usuarios. Idempotente: si el email ya existe no lo toca.
 *
 *   npm run seed                      # crea los usuarios que falten
 *   npm run seed -- --reset-password  # además, regenera la contraseña de los que ya existen
 *   npm run seed -- --demo            # además, carga datos de demostración (solo en cuentas sin clientes)
 *
 * Las contraseñas NUNCA van en el repositorio: se toman de SEED_PASSWORD_<USERNAME> o se generan
 * aleatorias y se muestran una sola vez al crearlas. El email por defecto se puede cambiar con
 * SEED_EMAIL_<USERNAME>.
 */
import { randomBytes } from 'node:crypto';
import { NestFactory } from '@nestjs/core';
import { getRepositoryToken } from '@nestjs/typeorm';
import bcrypt from 'bcryptjs';
import { Repository } from 'typeorm';
import { AppModule } from '../app.module.js';
import { Onboarding } from '../onboarding/onboarding.entity.js';
import { User } from '../users/user.entity.js';
import { DataSource } from 'typeorm';
import { seedDemo } from './demo/build.js';
import { seedDemoImages } from './demo/images.js';
import { moda } from './demo/profile-moda.js';
import { dental } from './demo/profile-dental.js';
import type { UserSeed } from './seed.types.js';
import { albertfonseca } from './users/albertfonseca.seed.js';
import { ejimenez } from './users/ejimenez.seed.js';

const SEEDS: UserSeed[] = [albertfonseca, ejimenez];
const PROFILES = { moda, dental };

// Misma política que el registro: 10+ caracteres con letras y números.
const valid = (p: string) => p.length >= 10 && p.length <= 72 && /[A-Za-z]/.test(p) && /\d/.test(p);

function generatePassword() {
  let p = '';
  while (!valid(p)) p = randomBytes(18).toString('base64url').slice(0, 20);
  return p;
}

async function main() {
  process.env['SCHEDULER'] ??= 'off'; // el seeder no debe arrancar tareas programadas
  const reset = process.argv.includes('--reset-password');
  const demo = process.argv.includes('--demo');
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  const users = app.get<Repository<User>>(getRepositoryToken(User));
  const onboardings = app.get<Repository<Onboarding>>(getRepositoryToken(Onboarding));
  const created: { email: string; password: string; note: string }[] = [];

  for (const s of SEEDS) {
    const key = s.username.toUpperCase();
    const email = (process.env[`SEED_EMAIL_${key}`] ?? s.email).trim().toLowerCase();
    const provided = process.env[`SEED_PASSWORD_${key}`];
    if (provided && !valid(provided)) throw new Error(`SEED_PASSWORD_${key} no cumple la política (10-72 caracteres, letras y números)`);

    const existing = await users.findOneBy({ email });
    if (existing && !reset) { console.log(`= ${email}: ya existe, sin cambios`); continue; }

    const password = provided ?? generatePassword();
    const passwordHash = await bcrypt.hash(password, 10);
    if (existing) {
      await users.update(existing.id, { passwordHash });
      created.push({ email, password: provided ? '(la de SEED_PASSWORD)' : password, note: 'contraseña restablecida' });
    } else {
      const user = await users.save(users.create({ email, name: s.name, companyName: s.companyName, passwordHash }));
      await onboardings.save(onboardings.create({ userId: user.id }));
      created.push({ email, password: provided ? '(la de SEED_PASSWORD)' : password, note: 'creado' });
    }
  }

  // --demo: datos de uso realista (clientes, conversaciones, citas, inventario…) en cuentas que aún no tienen clientes
  if (demo) {
    const ds = app.get(DataSource);
    for (const s of SEEDS) {
      if (!s.demo) continue;
      const email = (process.env[`SEED_EMAIL_${s.username.toUpperCase()}`] ?? s.email).trim().toLowerCase();
      const u = await users.findOneBy({ email });
      if (!u) { console.log(`- ${email}: no existe, se omite la demo`); continue; }
      const res = await seedDemo(ds, u.id, PROFILES[s.demo]);
      const imgs = await seedDemoImages(ds, u.id, PROFILES[s.demo]);
      if (imgs) console.log(`+ ${email}: ${imgs} imágenes de producto generadas`);
      console.log(res.skipped ? `= ${email}: ya tiene clientes, sin cambios` : `+ ${email}: demo "${s.demo}" cargada → ${res.contacts} clientes, ${res.messages} mensajes, ${res.appointments} citas, ${res.products} productos, ${res.movements} movimientos de stock`);
    }
  }

  await app.close();
  if (created.length) {
    console.log('\nUsuarios (guarda las contraseñas ahora; no se vuelven a mostrar):');
    for (const c of created) console.log(`  ${c.email}  ${c.password}  [${c.note}]`);
  }
  process.exit(0);
}

main().catch(e => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
