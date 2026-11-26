import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsDateString, IsEmail, IsIn, IsInt, IsNumber, IsObject, IsOptional, IsString, IsUUID, Length, Max, MaxLength, Min, ValidateIf, ValidateNested } from 'class-validator';
import { AUTOMATION_TRIGGERS, CONTACT_STATUSES } from './entities.js';


/** Solo estos campos se aceptan desde el cliente: el resto (userId, needsHuman, funnelStep…) lo controla el servidor. */
export class ContactDto {
  @IsString() @Length(1, 120) name!: string;
  @IsOptional() @IsString() @MaxLength(32) phone?: string;
  @IsOptional() @ValidateIf((_, v) => v !== '') @IsEmail() @MaxLength(160) email?: string;
  @IsOptional() @IsIn([...CONTACT_STATUSES]) status?: string;
  @IsOptional() @IsInt() @Min(0) @Max(100) score?: number;
  @IsOptional() @IsString() @MaxLength(40) source?: string;
  @IsOptional() @IsString() @MaxLength(4000) notes?: string;
  @IsOptional() @IsBoolean() needsHuman?: boolean;
  @IsOptional() @IsArray() @ArrayMaxSize(20) @IsString({ each: true }) @MaxLength(30, { each: true }) tags?: string[];
}

export class AppointmentDto {
  @IsString() @Length(1, 160) title!: string;
  @IsDateString() startsAt!: string;
  @IsOptional() @IsUUID() contactId?: string | null;
  @IsOptional() @IsIn(['pendiente', 'confirmada', 'completada', 'cancelada', 'no_asistio']) status?: string;
  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
}

export class ProductCreateDto {
  @IsString() @Length(1, 160) name!: string;
  @IsOptional() @IsString() @MaxLength(2000) description?: string;
  @IsOptional() @IsNumber() @Min(0) @Max(1e9) price?: number;
  @IsOptional() @IsNumber() @Min(0) @Max(1e9) cost?: number;
  @IsOptional() @IsString() @MaxLength(80) category?: string;
  @IsOptional() @IsBoolean() active?: boolean;
  @IsOptional() @IsString() @MaxLength(60) sku?: string;
  @IsOptional() @IsBoolean() trackStock?: boolean;
  @IsOptional() @IsInt() @Min(0) @Max(1e7) stock?: number;
  @IsOptional() @IsInt() @Min(0) @Max(1e7) minStock?: number;
}

/** El stock solo cambia mediante movimientos (queda historial), nunca editando el producto. */
export class ProductUpdateDto {
  @IsOptional() @IsString() @Length(1, 160) name?: string;
  @IsOptional() @IsString() @MaxLength(2000) description?: string;
  @IsOptional() @IsNumber() @Min(0) @Max(1e9) price?: number;
  @IsOptional() @IsNumber() @Min(0) @Max(1e9) cost?: number;
  @IsOptional() @IsString() @MaxLength(80) category?: string;
  @IsOptional() @IsBoolean() active?: boolean;
  @IsOptional() @IsString() @MaxLength(60) sku?: string;
  @IsOptional() @IsBoolean() trackStock?: boolean;
  @IsOptional() @IsInt() @Min(0) @Max(1e7) minStock?: number;
}

export class StockMovementDto {
  @IsIn(['in', 'out', 'adjust']) type!: 'in' | 'out' | 'adjust';
  @IsInt() @Min(0) @Max(1e7) quantity!: number;
  @IsOptional() @IsString() @MaxLength(200) reason?: string;
}

export class KnowledgeDto {
  @IsString() @Length(1, 200) title!: string;
  @IsString() @Length(1, 100_000) content!: string;
  @IsOptional() @IsString() @MaxLength(80) category?: string;
}

export class TemplateDto {
  @IsString() @Length(1, 120) name!: string;
  @IsOptional() @IsIn(['UTILITY', 'MARKETING', 'AUTHENTICATION']) category?: string;
  @IsOptional() @IsString() @MaxLength(10) language?: string;
  @IsString() @Length(1, 1024) body!: string;
  @IsOptional() @IsIn(['aprobada', 'pendiente', 'rechazada', 'desactivada']) status?: string;
}

export class FunnelStepDto {
  @IsString() @Length(1, 120) name!: string;
  @IsOptional() @IsInt() @Min(0) @Max(100) position?: number;
  @IsOptional() @IsString() @MaxLength(4000) prompt?: string;
  @IsOptional() @IsString() @MaxLength(2000) objectives?: string;
  @IsOptional() @IsString() @MaxLength(2000) criteria?: string;
}

class ConditionsDto {
  @IsOptional() @IsIn([...CONTACT_STATUSES]) status?: string;
  @IsOptional() @IsInt() @Min(1) @Max(24 * 30) waitHours?: number;
  @IsOptional() @IsIn([...CONTACT_STATUSES]) toStatus?: string;
}
class ActionsDto {
  @IsOptional() @IsString() @MaxLength(1000) sendText?: string;
  @IsOptional() @IsIn([...CONTACT_STATUSES]) moveStatus?: string;
}

export class AutomationDto {
  @IsString() @Length(1, 120) name!: string;
  @IsIn([...AUTOMATION_TRIGGERS]) trigger!: (typeof AUTOMATION_TRIGGERS)[number];
  @IsOptional() @IsObject() @ValidateNested() @Type(() => ConditionsDto) conditions?: ConditionsDto;
  @IsOptional() @IsObject() @ValidateNested() @Type(() => ActionsDto) actions?: ActionsDto;
  @IsOptional() @IsBoolean() active?: boolean;
}

export class WebhookDto {
  @IsString() @Length(8, 500) url!: string;
  @IsOptional() @IsString() @MaxLength(120) name?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) events?: string[];
  @IsOptional() @IsBoolean() active?: boolean;
}

class FaqDto {
  @IsString() @Length(1, 300) question!: string;
  @IsString() @Length(1, 1500) answer!: string;
}
class HoursDto {
  @IsBoolean() enabled!: boolean;
  @IsArray() @ArrayMaxSize(7) @IsInt({ each: true }) @Min(0, { each: true }) @Max(6, { each: true }) days!: number[];
  @IsString() @Length(5, 5) start!: string;
  @IsString() @Length(5, 5) end!: string;
}

export class AgentConfigDto {
  @IsOptional() @IsString() @MaxLength(80) name?: string;
  @IsOptional() @IsIn(['cercano', 'formal', 'neutro']) tone?: string;
  @IsOptional() @IsString() @MaxLength(120) businessName?: string;
  @IsOptional() @IsString() @MaxLength(120) industry?: string;
  @IsOptional() @IsString() @MaxLength(8000) instructions?: string;
  @IsOptional() @IsString() @MaxLength(1000) greeting?: string;
  @IsOptional() @IsBoolean() enabled?: boolean;
  @IsOptional() @IsString() @MaxLength(2000) restrictions?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(50) @ValidateNested({ each: true }) @Type(() => FaqDto) faq?: FaqDto[];
  @IsOptional() @IsArray() @ArrayMaxSize(30) @IsString({ each: true }) @MaxLength(60, { each: true }) handoffKeywords?: string[];
  @IsOptional() @IsString() @MaxLength(1000) handoffMessage?: string;
  @IsOptional() @IsObject() @ValidateNested() @Type(() => HoursDto) hours?: HoursDto;
  @IsOptional() @IsString() @MaxLength(1000) outOfHoursMessage?: string;
}

export class BcvDto {
  @IsOptional() @IsNumber() @Min(0.0001) @Max(1e9) rate?: number;
  @IsOptional() @IsBoolean() auto?: boolean;
}

export class ImportRowsDto {
  @IsArray() @ArrayMaxSize(5000) @ValidateNested({ each: true }) @Type(() => ImportRow) rows!: ImportRow[];
}
class ImportRow {
  @IsString() @Length(1, 120) name!: string;
  @IsOptional() @IsString() @MaxLength(32) phone?: string;
  @IsOptional() @IsString() @MaxLength(160) email?: string;
}

export class SendMessageDto {
  @IsString() @Length(1, 4000) body!: string;
  @IsOptional() @IsIn(['client', 'human']) sender?: 'client' | 'human';
}

export class ConnectWhatsappDto {
  @IsString() @Length(3, 40) phoneNumberId!: string;
  @IsString() @Length(10, 1000) accessToken!: string;
}
