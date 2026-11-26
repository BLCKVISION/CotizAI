import { BadRequestException, Body, Controller, Delete, Get, HttpCode, NotFoundException, Param, ParseUUIDPipe, Patch, Post, Put, Query, Req, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import { memoryStorage } from 'multer';
import { MAX_IMAGE_BYTES, removeProductImage, storeProductImage } from '../media/product-images.js';
import { ProductStatsService } from '../crm/product-stats.service.js';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { topDocs } from '../agent/agent.engine.js';
import { JwtGuard } from '../auth/jwt.guard.js';
import { KnowledgeDoc, Product, StockMovement, WaTemplate } from '../crm/entities.js';
import { InventoryService } from '../crm/inventory.service.js';
import { SettingsService } from '../crm/settings.service.js';
import { BcvV1Dto, KnowledgeDocumentDto, ProductV1Dto, TemplateV1Dto } from './dto.js';
import { StockMovementDto } from '../crm/dto.js';
import { bodyOf, chunkText, chunkView, clampInt, productView, templateView, tplStatusIn } from './mappers.js';
import { full, partial } from './common.js';
import type { Req_ } from './common.js';

const round2 = (n: number) => Math.round(n * 100) / 100;

// ── Productos e inventario ──────────────────────────────────────────────────
@Controller('v1/products')
@UseGuards(JwtGuard)
export class ProductsV1Controller {
  constructor(
    @InjectRepository(Product) private repo: Repository<Product>,
    private settings: SettingsService,
    private inventory: InventoryService,
    private stats: ProductStatsService,
  ) {}

  /** Vista de un producto con sus métricas (la demanda es relativa al resto del catálogo, por eso se calcula con todos). */
  private async viewOne(userId: string, p: Product) {
    const [rate, all] = await Promise.all([this.settings.rate(userId), this.repo.find({ where: { userId }, take: 2000 })]);
    const st = await this.stats.compute(userId, all.some(x => x.id === p.id) ? all.map(x => (x.id === p.id ? p : x)) : [...all, p]);
    return productView(p, rate, st.get(p.id));
  }

  @Get() async list(@Req() r: Req_) {
    const [rows, rate] = await Promise.all([this.repo.find({ where: { userId: r.userId }, order: { createdAt: 'DESC' }, take: 2000 }), this.settings.rate(r.userId)]);
    const st = await this.stats.compute(r.userId, rows);
    return rows.map(p => productView(p, rate, st.get(p.id)));
  }

  // Rutas estáticas antes que ':id'
  @Get('bcv-rate') async bcv(@Req() r: Req_) { return { ...(await this.settings.bcv(r.userId)), currency: 'VES/USD' }; }
  @Post('bcv-rate') @HttpCode(200) async setBcv(@Req() r: Req_, @Body(full()) dto: BcvV1Dto) { return { ...(await this.settings.saveBcv(r.userId, dto)), currency: 'VES/USD' }; }
  @Post('bcv-rate/refresh') @HttpCode(200) async refreshBcv(@Req() r: Req_) { return { ...(await this.settings.refreshBcv(r.userId)), currency: 'VES/USD' }; }

  @Get('inventory/summary') async summary(@Req() r: Req_) {
    const list = await this.repo.findBy({ userId: r.userId });
    const tracked = list.filter(p => p.trackStock);
    return {
      products: list.length, tracked: tracked.length, units: tracked.reduce((s, p) => s + p.stock, 0),
      costValue: round2(tracked.reduce((s, p) => s + p.stock * p.cost, 0)), retailValue: round2(tracked.reduce((s, p) => s + p.stock * p.price, 0)),
      outOfStock: tracked.filter(p => p.stock <= 0).length, lowStock: tracked.filter(p => p.stock > 0 && p.stock <= p.minStock).length,
    };
  }

  @Get(':id') async get(@Req() r: Req_, @Param('id', ParseUUIDPipe) id: string) { return this.viewOne(r.userId, await this.owned(r.userId, id)); }

  @Get(':id/movements') async movements(@Req() r: Req_, @Param('id', ParseUUIDPipe) id: string) {
    await this.owned(r.userId, id);
    return this.repo.manager.find(StockMovement, { where: { userId: r.userId, productId: id }, order: { createdAt: 'DESC' }, take: 100 });
  }

  @Post(':id/stock') @HttpCode(200) async stock(@Req() r: Req_, @Param('id', ParseUUIDPipe) id: string, @Body(full()) dto: StockMovementDto) {
    const res = await this.inventory.move(r.userId, id, dto.type, dto.quantity, dto.reason);
    return { product: await this.viewOne(r.userId, res.product), movement: res.movement };
  }

  @Post() async create(@Req() r: Req_, @Body(full()) dto: ProductV1Dto) {
    const { isAvailable, sku, ...rest } = dto;
    const cleanSku = (sku ?? '').trim();
    await this.assertSku(r.userId, cleanSku);
    const row = await this.repo.save(this.repo.create({ ...rest, sku: cleanSku, ...(isAvailable !== undefined ? { active: isAvailable } : {}), userId: r.userId }));
    await this.inventory.initialStock(r.userId, row);
    return this.viewOne(r.userId, row);
  }

  @Put(':id') put(@Req() r: Req_, @Param('id', ParseUUIDPipe) id: string, @Body(partial(ProductV1Dto)) dto: Partial<ProductV1Dto>) { return this.update(r, id, dto); }

  /** Si llega un `stock` distinto del actual se registra como movimiento de ajuste (queda historial). */
  @Patch(':id') async update(@Req() r: Req_, @Param('id', ParseUUIDPipe) id: string, @Body(partial(ProductV1Dto)) dto: Partial<ProductV1Dto>) {
    const cur = await this.owned(r.userId, id);
    const { isAvailable, sku, stock, ...rest } = dto;
    if (sku !== undefined) await this.assertSku(r.userId, sku.trim(), id);
    Object.assign(cur, rest, sku !== undefined ? { sku: sku.trim() } : {}, isAvailable !== undefined ? { active: isAvailable } : {});
    await this.repo.save(cur);
    if (stock !== undefined && cur.trackStock && stock !== cur.stock) await this.inventory.move(r.userId, id, 'adjust', stock, 'Edición manual');
    return this.viewOne(r.userId, await this.owned(r.userId, id));
  }

  @Patch(':id/toggle-availability') async toggle(@Req() r: Req_, @Param('id', ParseUUIDPipe) id: string) {
    const cur = await this.owned(r.userId, id);
    cur.active = !cur.active;
    await this.repo.save(cur);
    return this.viewOne(r.userId, cur);
  }

  /**
   * Imagen del producto (multipart, campo "file"). Solo JPEG/PNG/WebP de hasta 5 MB; se re-codifica a WebP y se quitan
   * los metadatos. Reemplaza la anterior. Los guards corren antes que multer: sin sesión no se procesa nada.
   */
  @Post(':id/image') @HttpCode(200) @Throttle({ default: { ttl: 60_000, limit: 30 } })
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: MAX_IMAGE_BYTES, files: 1, fields: 0, parts: 2 } }))
  async uploadImage(@Req() r: Req_, @Param('id', ParseUUIDPipe) id: string, @UploadedFile() file?: Express.Multer.File) {
    const cur = await this.owned(r.userId, id);
    if (!file?.buffer?.length) throw new BadRequestException('Falta la imagen (campo "file")');
    const url = await storeProductImage(r.userId, file.buffer);
    const old = cur.imageUrl;
    cur.imageUrl = url;
    await this.repo.save(cur);
    await removeProductImage(old, r.userId);
    return this.viewOne(r.userId, cur);
  }

  @Delete(':id/image') async deleteImage(@Req() r: Req_, @Param('id', ParseUUIDPipe) id: string) {
    const cur = await this.owned(r.userId, id);
    const old = cur.imageUrl;
    cur.imageUrl = '';
    await this.repo.save(cur);
    await removeProductImage(old, r.userId);
    return this.viewOne(r.userId, cur);
  }

  @Delete(':id') async remove(@Req() r: Req_, @Param('id', ParseUUIDPipe) id: string) {
    const prod = await this.owned(r.userId, id);
    await this.repo.manager.transaction(async m => { await m.delete(StockMovement, { userId: r.userId, productId: id }); await m.delete(Product, { id, userId: r.userId }); });
    await removeProductImage(prod.imageUrl, r.userId);
    return { success: true, ok: true };
  }

  private async owned(userId: string, id: string) {
    const p = await this.repo.findOneBy({ id, userId });
    if (!p) throw new NotFoundException('Producto no encontrado');
    return p;
  }

  private async assertSku(userId: string, sku: string, selfId?: string) {
    if (!sku) return;
    const taken = await this.repo.findOneBy({ userId, sku });
    if (taken && taken.id !== selfId) throw new BadRequestException('Ya existe un producto con ese SKU');
  }
}

// ── Plantillas de WhatsApp ──────────────────────────────────────────────────
@Controller('v1/templates')
@UseGuards(JwtGuard)
export class TemplatesV1Controller {
  constructor(@InjectRepository(WaTemplate) private repo: Repository<WaTemplate>) {}

  @Get() async list(@Req() r: Req_) { return (await this.repo.find({ where: { userId: r.userId }, order: { createdAt: 'DESC' }, take: 500 })).map(templateView); }
  @Get(':id') async get(@Req() r: Req_, @Param('id', ParseUUIDPipe) id: string) { return templateView(await this.owned(r.userId, id)); }

  @Post() async create(@Req() r: Req_, @Body(full()) dto: TemplateV1Dto) {
    const body = (dto.body ?? bodyOf(dto.components)).trim();
    if (!body) throw new BadRequestException('Falta el texto: envía `body` o un componente BODY');
    const components = dto.components?.length ? dto.components : [{ type: 'BODY', text: body }];
    const row = await this.repo.save(this.repo.create({ userId: r.userId, name: dto.name, category: dto.category ?? 'UTILITY', language: dto.language ?? 'es', status: tplStatusIn(dto.status) ?? 'pendiente', body, components }));
    return templateView(row);
  }

  @Put(':id') put(@Req() r: Req_, @Param('id', ParseUUIDPipe) id: string, @Body(partial(TemplateV1Dto)) dto: Partial<TemplateV1Dto>) { return this.update(r, id, dto); }
  @Patch(':id') async update(@Req() r: Req_, @Param('id', ParseUUIDPipe) id: string, @Body(partial(TemplateV1Dto)) dto: Partial<TemplateV1Dto>) {
    const cur = await this.owned(r.userId, id);
    if (dto.name !== undefined) cur.name = dto.name;
    if (dto.category !== undefined) cur.category = dto.category;
    if (dto.language !== undefined) cur.language = dto.language;
    if (dto.status !== undefined) cur.status = tplStatusIn(dto.status) ?? cur.status;
    const body = dto.body ?? (dto.components ? bodyOf(dto.components) : undefined);
    if (body !== undefined) { if (!body.trim()) throw new BadRequestException('El texto no puede quedar vacío'); cur.body = body; }
    if (dto.components?.length) cur.components = dto.components; else if (dto.body !== undefined) cur.components = [{ type: 'BODY', text: cur.body }];
    return templateView(await this.repo.save(cur));
  }

  @Delete(':id') async remove(@Req() r: Req_, @Param('id', ParseUUIDPipe) id: string) {
    await this.owned(r.userId, id);
    await this.repo.delete({ id, userId: r.userId });
    return { success: true, ok: true };
  }

  private async owned(userId: string, id: string) {
    const t = await this.repo.findOneBy({ id, userId });
    if (!t) throw new NotFoundException();
    return t;
  }
}

// ── Base de conocimiento (cada fila = un fragmento) ─────────────────────────
@Controller('v1/knowledge')
@UseGuards(JwtGuard)
export class KnowledgeV1Controller {
  constructor(@InjectRepository(KnowledgeDoc) private repo: Repository<KnowledgeDoc>) {}

  @Get() async list(@Req() r: Req_) {
    return (await this.repo.find({ where: { userId: r.userId }, order: { createdAt: 'DESC', chunkIndex: 'ASC' }, take: 1000 })).map(chunkView);
  }

  @Post('document') async add(@Req() r: Req_, @Body(full()) dto: KnowledgeDocumentDto) {
    const chunks = chunkText(dto.text);
    if (!chunks.length) throw new BadRequestException('El texto está vacío');
    const source = (dto.sourceFile?.trim() || 'Manual Entry').slice(0, 200);
    const rows = await this.repo.save(chunks.map((content, i) => this.repo.create({ userId: r.userId, title: source, content, category: 'Documento', chunkIndex: i })));
    return rows.map(chunkView);
  }

  @Get('search') async search(@Req() r: Req_, @Query('q') q?: string, @Query('limit') limit?: string) {
    const docs = await this.repo.findBy({ userId: r.userId });
    return topDocs(docs, (q ?? '').slice(0, 500), clampInt(limit, 5, 1, 20)).map(chunkView);
  }

  @Delete('clear') async clear(@Req() r: Req_) {
    const res = await this.repo.delete({ userId: r.userId });
    return { success: true, deleted: res.affected ?? 0 };
  }

  @Delete('chunk/:id') async remove(@Req() r: Req_, @Param('id', ParseUUIDPipe) id: string) {
    const res = await this.repo.delete({ id, userId: r.userId });
    if (!res.affected) throw new NotFoundException();
    return { success: true, ok: true };
  }
}
