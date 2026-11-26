import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EventsService } from './events.service.js';
import { Product, StockMovement } from './entities.js';

/** Movimientos de inventario: transaccionales, con bloqueo de fila y sin stock negativo. */
@Injectable()
export class InventoryService {
  constructor(@InjectRepository(Product) private products: Repository<Product>, private events: EventsService) {}

  async move(userId: string, productId: string, type: 'in' | 'out' | 'adjust', quantity: number, reason = '') {
    const result = await this.products.manager.transaction(async m => {
      const p = await m.findOne(Product, { where: { id: productId, userId }, lock: { mode: 'pessimistic_write' } });
      if (!p) throw new NotFoundException();
      if (!p.trackStock) throw new BadRequestException('Este producto no controla inventario');
      if (type !== 'adjust' && quantity < 1) throw new BadRequestException('La cantidad debe ser al menos 1');
      const after = type === 'in' ? p.stock + quantity : type === 'out' ? p.stock - quantity : quantity;
      if (after < 0) throw new BadRequestException(`Stock insuficiente: hay ${p.stock} unidades`);
      const movement = await m.save(StockMovement, m.create(StockMovement, { userId, productId, type, quantity, stockBefore: p.stock, stockAfter: after, reason }));
      const crossedLow = p.stock > p.minStock && after <= p.minStock;
      p.stock = after;
      await m.save(Product, p);
      return { product: p, movement, crossedLow };
    });
    this.events.emit(userId, 'stock.updated', { product: result.product, movement: result.movement });
    if (result.crossedLow) this.events.emit(userId, 'stock.low', { product: result.product });
    return { product: result.product, movement: result.movement };
  }

  /** Registra el stock inicial de un producto recién creado como primer movimiento. */
  async initialStock(userId: string, p: Product) {
    if (p.trackStock && p.stock > 0) {
      await this.products.manager.save(StockMovement, this.products.manager.create(StockMovement, { userId, productId: p.id, type: 'in', quantity: p.stock, stockBefore: 0, stockAfter: p.stock, reason: 'Stock inicial' }));
    }
  }
}
