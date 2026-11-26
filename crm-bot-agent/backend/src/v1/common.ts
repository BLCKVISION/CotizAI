import { ArgumentMetadata, ValidationPipe } from '@nestjs/common';

export type Req_ = { userId: string };

/** Quita (en profundidad) las claves `undefined`: las clases DTO las declaran como propiedades propias y pisarían datos al mezclar. */
export function stripUndefined<T>(v: T): T {
  if (Array.isArray(v)) return v.map(stripUndefined) as T;
  if (v && typeof v === 'object' && Object.getPrototypeOf(v) !== Date.prototype) {
    return Object.fromEntries(Object.entries(v).filter(([, x]) => x !== undefined).map(([k, x]) => [k, stripUndefined(x)])) as T;
  }
  return v;
}

class CleanPipe extends ValidationPipe {
  override async transform(value: unknown, meta: ArgumentMetadata) { return stripUndefined(await super.transform(value, meta)); }
}

/** Altas: todos los campos requeridos del DTO. Los campos no declarados se descartan. */
export const full = () => new CleanPipe({ whitelist: true, transform: true });

/**
 * Ediciones parciales. El parámetro del método debe tipar `Partial<Dto>` (metadato `Object`) para que el
 * ValidationPipe global no exija los campos obligatorios; aquí se valida con el DTO real (`expectedType`).
 */
export const partial = (dto: new () => object) => new CleanPipe({ whitelist: true, transform: true, skipMissingProperties: true, expectedType: dto });
