import { encryptedColumn } from '../common/crypto.js';
import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

export const CONTACT_STATUSES = ['nuevo', 'contactado', 'calificado', 'interesado', 'negociacion', 'cerrado', 'perdido'] as const;

abstract class Tenant {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Index() @Column('uuid') userId!: string;
  @CreateDateColumn() createdAt!: Date;
  @UpdateDateColumn() updatedAt!: Date;
}

@Entity('contacts')
export class Contact extends Tenant {
  @Column() name!: string;
  @Column({ default: '' }) phone!: string;
  @Column({ default: '' }) email!: string;
  @Column({ default: 'nuevo' }) status!: string;
  @Column({ default: 0 }) score!: number;
  @Column({ default: 'manual' }) source!: string;
  @Column({ default: '' }) notes!: string;
  /** Cliente esperando atención humana (intervención). */
  @Column({ default: false }) needsHuman!: boolean;
  /** Posición actual en el funnel (índice del paso) y datos capturados por el agente. */
  @Column({ default: 0 }) funnelStep!: number;
  @Column({ type: 'jsonb', default: {} }) data!: Record<string, string>;
  @Column({ type: 'jsonb', default: [] }) tags!: string[];
  /** Último momento en que el equipo leyó la conversación (para unreadCount). */
  @Column({ type: 'timestamptz', nullable: true }) lastReadAt!: Date | null;
  /** Un humano respondió: el bot no contesta hasta esta fecha (o hasta resume-bot). */
  @Column({ type: 'timestamptz', nullable: true }) botPausedUntil!: Date | null;
  @Column({ default: false }) resolved!: boolean;
  @Column({ type: 'uuid', nullable: true }) assignedAgentId!: string | null;
}

@Entity('messages')
export class Message extends Tenant {
  @Index() @Column('uuid') contactId!: string;
  @Column() direction!: 'in' | 'out';
  /** auto = recordatorios y reglas del funnel (no cuentan como respuestas de la IA en las métricas). */
  @Column() sender!: 'client' | 'ai' | 'human' | 'auto';
  @Column('text') body!: string;
  /** Id del mensaje en WhatsApp, para no procesar dos veces el mismo. */
  @Index() @Column({ type: 'varchar', nullable: true }) externalId!: string | null;
}

@Entity('appointments')
export class Appointment extends Tenant {
  @Column({ type: 'uuid', nullable: true }) contactId!: string | null;
  @Column() title!: string;
  @Column({ type: 'timestamptz' }) startsAt!: Date;
  @Column({ default: 'pendiente' }) status!: string;
  @Column({ default: '' }) notes!: string;
  @Column({ default: 'user' }) createdBy!: 'user' | 'ai';
  @Column({ default: '' }) service!: string;
  @Column({ type: 'timestamptz', nullable: true }) endsAt!: Date | null;
  @Column({ default: '' }) googleMeetLink!: string;
  @Column({ default: false }) reminder24hSent!: boolean;
  @Column({ default: false }) reminder2hSent!: boolean;
}

@Entity('products')
export class Product extends Tenant {
  @Column() name!: string;
  @Column({ default: '' }) description!: string;
  @Column({ type: 'numeric', precision: 12, scale: 2, default: 0, transformer: { to: (v: number) => v, from: (v: string) => Number(v) } }) price!: number;
  @Column({ default: '' }) category!: string;
  @Column({ default: true }) active!: boolean;
  @Column({ default: 'USD' }) currency!: string;
  @Column({ default: '' }) imageUrl!: string;
  @Column({ default: '' }) sku!: string;
  /** Costo unitario (para margen). */
  @Column({ type: 'numeric', precision: 12, scale: 2, default: 0, transformer: { to: (v: number) => v, from: (v: string) => Number(v) } }) cost!: number;
  /** false = servicio o producto sin inventario (stock ilimitado). */
  @Column({ default: true }) trackStock!: boolean;
  @Column({ type: 'int', default: 0 }) stock!: number;
  /** Alerta de stock bajo cuando stock <= minStock. */
  @Column({ type: 'int', default: 0 }) minStock!: number;
}

/** Historial de inventario: cada entrada, salida o ajuste queda registrado. */
@Entity('stock_movements')
export class StockMovement extends Tenant {
  @Index() @Column('uuid') productId!: string;
  @Column() type!: 'in' | 'out' | 'adjust';
  /** Cantidad movida (siempre positiva; en 'adjust' es el nuevo stock). */
  @Column({ type: 'int' }) quantity!: number;
  @Column({ type: 'int' }) stockBefore!: number;
  @Column({ type: 'int' }) stockAfter!: number;
  @Column({ default: '' }) reason!: string;
}

@Entity('knowledge_docs')
export class KnowledgeDoc extends Tenant {
  @Column() title!: string;
  @Column('text') content!: string;
  @Column({ default: 'General' }) category!: string;
  @Column({ default: false }) synced!: boolean;
  /** Posición del fragmento dentro de un documento largo (API v1 trata cada fila como un chunk). */
  @Column({ type: 'int', default: 0 }) chunkIndex!: number;
}

@Entity('funnel_steps')
export class FunnelStep extends Tenant {
  @Column({ default: 0 }) position!: number;
  @Column() name!: string;
  @Column({ type: 'text', default: '' }) prompt!: string;
  @Column({ type: 'text', default: '' }) objectives!: string;
  @Column({ type: 'text', default: '' }) criteria!: string;
}

@Entity('webhooks')
export class Webhook extends Tenant {
  @Column() url!: string;
  @Column({ default: '' }) name!: string;
  @Column('simple-array') events!: string[];
  @Column() secret!: string;
  @Column({ default: true }) active!: boolean;
  @Column({ type: 'timestamptz', nullable: true }) lastDeliveryAt!: Date | null;
  @Column({ type: 'int', nullable: true }) lastStatus!: number | null;
}

@Entity('wa_templates')
export class WaTemplate extends Tenant {
  @Column() name!: string;
  @Column({ default: 'UTILITY' }) category!: string;
  @Column({ default: 'es' }) language!: string;
  @Column('text') body!: string;
  @Column({ default: 'pendiente' }) status!: string; // aprobada | pendiente | rechazada | desactivada
  /** Componentes estilo Meta (HEADER/BODY/FOOTER/BUTTONS); body es el texto del BODY. */
  @Column({ type: 'jsonb', default: [] }) components!: { type: string; text?: string }[];
}

@Entity('agent_configs')
export class AgentConfig {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Index({ unique: true }) @Column('uuid') userId!: string;
  @Column({ default: false }) configured!: boolean;
  @Column({ default: true }) enabled!: boolean;
  @Column({ default: '' }) name!: string;
  @Column({ default: 'cercano' }) tone!: string;
  @Column({ default: '' }) businessName!: string;
  @Column({ default: '' }) industry!: string;
  @Column({ type: 'text', default: '' }) instructions!: string;
  @Column({ type: 'text', default: '' }) greeting!: string;
  /** Temas o acciones que el agente nunca debe hacer. */
  @Column({ type: 'text', default: '' }) restrictions!: string;
  @Column({ default: '' }) agentRole!: string;
  @Column({ default: '' }) personality!: string;
  @Column({ default: 'es' }) language!: string;
  @Column({ type: 'text', default: '' }) salesFlow!: string;
  /** Informativo: el modelo real lo fija ANTHROPIC_MODEL en el servidor. */
  @Column({ default: '' }) model!: string;
  @Column({ type: 'float', default: 0.7 }) temperature!: number;
  @Column({ type: 'jsonb', default: [] }) faq!: { question: string; answer: string }[];
  /** Si el cliente escribe alguna de estas palabras, se deriva a una persona sin pasar por el modelo. */
  @Column({ type: 'jsonb', default: [] }) handoffKeywords!: string[];
  @Column({ type: 'text', default: '' }) handoffMessage!: string;
  /** Horario de atención: fuera de él se responde con outOfHoursMessage (hora local del negocio). */
  @Column({ type: 'jsonb', default: { enabled: false, days: [1, 2, 3, 4, 5], start: '09:00', end: '18:00' } }) hours!: { enabled: boolean; days: number[]; start: string; end: string };
  @Column({ type: 'text', default: '' }) outOfHoursMessage!: string;
  @UpdateDateColumn() updatedAt!: Date;
}

@Entity('whatsapp_accounts')
export class WhatsappAccount {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Index({ unique: true }) @Column('uuid') userId!: string;
  @Index({ unique: true }) @Column() phoneNumberId!: string;
  @Column({ type: 'text', transformer: encryptedColumn }) accessToken!: string;
  @Column() verifyToken!: string;
  @Column({ default: '' }) displayPhone!: string;
  @Column({ default: '' }) wabaId!: string;
  @CreateDateColumn() createdAt!: Date;
}

/** Ajustes de negocio por usuario: tasa de cambio BCV (USD → Bs) para mostrar precios en bolívares. */
@Entity('business_settings')
export class BusinessSettings {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Index({ unique: true }) @Column('uuid') userId!: string;
  @Column({ type: 'numeric', precision: 14, scale: 4, nullable: true, transformer: { to: (v: number | null) => v, from: (v: string | null) => (v === null ? null : Number(v)) } }) bcvRate!: number | null;
  @Column({ default: false }) bcvAuto!: boolean;
  @Column({ type: 'timestamptz', nullable: true }) bcvUpdatedAt!: Date | null;
  @UpdateDateColumn() updatedAt!: Date;
}

export const AUTOMATION_TRIGGERS = ['inactivity', 'appointment_created', 'status_changed'] as const;

/**
 * Regla de automatización del funnel: cuando ocurre el disparador (y se cumple la condición),
 * envía un mensaje al cliente y/o lo mueve de estado.
 */
@Entity('automation_rules')
export class AutomationRule extends Tenant {
  @Column() name!: string;
  @Column({ type: 'varchar' }) trigger!: (typeof AUTOMATION_TRIGGERS)[number];
  /** inactivity: { status?, waitHours } · status_changed: { toStatus? } · appointment_created: {} */
  @Column({ type: 'jsonb', default: {} }) conditions!: { status?: string; waitHours?: number; toStatus?: string };
  @Column({ type: 'jsonb', default: {} }) actions!: { sendText?: string; moveStatus?: string };
  @Column({ default: true }) active!: boolean;
  /** Nombre de plantilla de WhatsApp a enviar si no hay sendText (API v1: sendTemplate). */
  @Column({ default: '' }) templateName!: string;
  @Column({ type: 'int', default: 0 }) runs!: number;
  @Column({ type: 'timestamptz', nullable: true }) lastRunAt!: Date | null;
}

/** Evita ejecutar dos veces la misma regla para el mismo cliente y mensaje/evento. */
@Entity('automation_runs')
@Index(['ruleId', 'contactId', 'ref'], { unique: true })
export class AutomationRun {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column('uuid') ruleId!: string;
  @Column('uuid') contactId!: string;
  @Column() ref!: string;
  @CreateDateColumn() createdAt!: Date;
}

export const CRM_ENTITIES = [WhatsappAccount, Contact, Message, Appointment, Product, StockMovement, KnowledgeDoc, FunnelStep, Webhook, WaTemplate, AgentConfig, BusinessSettings, AutomationRule, AutomationRun];
