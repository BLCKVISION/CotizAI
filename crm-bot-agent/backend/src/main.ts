import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import helmet from 'helmet';
import { AppModule } from './app.module.js';

async function bootstrap() {
  const secret = process.env['JWT_SECRET'] ?? '';
  if (process.env['NODE_ENV'] === 'production' && (secret.length < 32 || secret.startsWith('dev-'))) {
    throw new Error('JWT_SECRET debe tener al menos 32 caracteres en producción (genera uno con: openssl rand -hex 32)');
  }
  const app = await NestFactory.create(AppModule, { rawBody: true });
  // Detrás de nginx/un balanceador: usa la IP real del cliente (necesario para el límite de peticiones).
  if (process.env['TRUST_PROXY']) app.getHttpAdapter().getInstance().set('trust proxy', Number(process.env['TRUST_PROXY']) || process.env['TRUST_PROXY']);
  app.use(helmet());
  app.enableCors({ origin: (process.env['CORS_ORIGIN'] ?? 'http://localhost:4200').split(','), methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.enableShutdownHooks();
  await app.listen(process.env['PORT'] ?? 3000);
}
await bootstrap();
