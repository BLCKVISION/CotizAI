import { Body, Controller, Delete, Get, NotFoundException, Param, ParseUUIDPipe, Patch, Post, Req, UseGuards, ValidationPipe } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtGuard } from '../auth/jwt.guard.js';
import { EventsService } from './events.service.js';

type Row = { id: string; userId: string };
type Req_ = { userId: string };
interface Opts {
  order?: Record<string, 'ASC' | 'DESC'>;
  events?: { created?: string; updated?: string };
  /** DTO de alta; el de edición por defecto es el mismo con todos los campos opcionales. */
  create: new () => object;
  update?: new () => object;
}

const pipe = (type: new () => object, partial: boolean) =>
  new ValidationPipe({ whitelist: true, transform: true, expectedType: type, skipMissingProperties: partial });

/**
 * Controlador CRUD multi-tenant: todas las filas se filtran por el usuario del token y
 * solo se aceptan los campos declarados en el DTO (sin asignación masiva).
 */
export function crudController<T extends Row>(path: string, entity: new () => T, opts: Opts) {
  const createPipe = pipe(opts.create, false);
  const updatePipe = pipe(opts.update ?? opts.create, true);

  @Controller(path)
  @UseGuards(JwtGuard)
  class CrudController {
    constructor(@InjectRepository(entity) protected repo: Repository<T>, protected events: EventsService) {}

    @Get() list(@Req() r: Req_) {
      return this.repo.find({ where: { userId: r.userId } as never, order: (opts.order ?? { createdAt: 'DESC' }) as never });
    }

    @Post() async create(@Req() r: Req_, @Body(createPipe) body: Record<string, unknown>) {
      const row = await this.repo.save(this.repo.create({ ...body, userId: r.userId } as never) as never as T);
      if (opts.events?.created) this.events.emit(r.userId, opts.events.created, row);
      return row;
    }

    @Patch(':id') async update(@Req() r: Req_, @Param('id', ParseUUIDPipe) id: string, @Body(updatePipe) body: Record<string, unknown>) {
      const res = await this.repo.update({ id, userId: r.userId } as never, body as never);
      if (!res.affected) throw new NotFoundException();
      const row = await this.repo.findOneByOrFail({ id, userId: r.userId } as never);
      if (opts.events?.updated) this.events.emit(r.userId, opts.events.updated, row);
      return row;
    }

    @Delete(':id') async remove(@Req() r: Req_, @Param('id', ParseUUIDPipe) id: string) {
      const res = await this.repo.delete({ id, userId: r.userId } as never);
      if (!res.affected) throw new NotFoundException();
      return { ok: true };
    }
  }
  return CrudController;
}
