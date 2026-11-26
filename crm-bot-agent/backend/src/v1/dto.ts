import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsDateString, IsEmail, IsIn, IsInt, IsNumber, IsObject, IsOptional, IsString, IsUUID, Length, Matches, Max, MaxLength, Min, ValidateIf, ValidateNested } from 'class-validator';
import { CONTACT_STATUSES } from '../crm/entities.js';
import { APPOINTMENT_STATUS_INPUTS, RULE_TRIGGER_INPUTS, TEMPLATE_STATUS_INPUTS } from './mappers.js';

const STAGES = [...CONTACT_STATUSES];

export class ContactV1Dto {
  @IsString() @Length(1, 120) name!: string;
  @IsOptional() @IsString() @MaxLength(32) phone?: string;
  @IsOptional() @ValidateIf((_, v) => v !== '') @IsEmail() @MaxLength(160) email?: string;
  @IsOptional() @IsIn(STAGES) stage?: string;
  @IsOptional() @IsIn(STAGES) status?: string;
  @IsOptional() @IsInt() @Min(0) @Max(100) score?: number;
  @IsOptional() @IsString() @MaxLength(40) source?: string;
  @IsOptional() @IsString() @MaxLength(4000) notes?: string;
  @IsOptional() @IsBoolean() needsHuman?: boolean;
  @IsOptional() @IsArray() @ArrayMaxSize(20) @IsString({ each: true }) @MaxLength(30, { each: true }) tags?: string[];
}

export class StageDto { @IsIn(STAGES) stage!: string; }

export class ContactImportRow {
  @IsString() @Length(1, 120) name!: string;
  @IsOptional() @IsString() @MaxLength(32) phone?: string;
  @IsOptional() @IsString() @MaxLength(160) email?: string;
}
export class ContactImportDto { @IsArray() @ArrayMaxSize(5000) @ValidateNested({ each: true }) @Type(() => ContactImportRow) rows!: ContactImportRow[]; }

export class TextDto { @IsString() @Length(1, 4000) text!: string; }
export class AssignDto { @ValidateIf((_, v) => v !== null) @IsUUID() agentId!: string | null; }
export class ResolveDto { @IsBoolean() resolved!: boolean; }

export class AppointmentV1Dto {
  @IsDateString() scheduledAt!: string;
  @IsOptional() @IsDateString() endsAt?: string;
  @IsOptional() @IsString() @MaxLength(160) service?: string;
  @IsOptional() @IsString() @MaxLength(160) title?: string;
  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
  @IsOptional() @ValidateIf((_, v) => v !== '') @Matches(/^https?:\/\//, { message: 'googleMeetLink debe ser una URL http(s)' }) @MaxLength(300) googleMeetLink?: string;
  @IsOptional() @IsUUID() contactId?: string;
  @IsOptional() @IsString() @MaxLength(120) contactName?: string;
  @IsOptional() @IsString() @MaxLength(32) contactPhone?: string;
  @IsOptional() @IsIn(APPOINTMENT_STATUS_INPUTS) status?: string;
}
export class AppointmentStatusDto { @IsIn(APPOINTMENT_STATUS_INPUTS) status!: string; }

export class ProductV1Dto {
  @IsString() @Length(1, 160) name!: string;
  @IsOptional() @IsString() @MaxLength(2000) description?: string;
  @IsOptional() @IsNumber() @Min(0) @Max(1e9) price?: number;
  @IsOptional() @IsNumber() @Min(0) @Max(1e9) cost?: number;
  @IsOptional() @IsString() @Length(3, 3) currency?: string;
  @IsOptional() @IsString() @MaxLength(60) sku?: string;
  @IsOptional() @IsString() @MaxLength(80) category?: string;
  @IsOptional() @IsBoolean() isAvailable?: boolean;
  @IsOptional() @IsBoolean() trackStock?: boolean;
  @IsOptional() @IsInt() @Min(0) @Max(1e7) stock?: number;
  @IsOptional() @IsInt() @Min(0) @Max(1e7) minStock?: number;
}

class ComponentDto {
  @IsString() @MaxLength(20) type!: string;
  @IsOptional() @IsString() @MaxLength(1024) text?: string;
}
export class TemplateV1Dto {
  @IsString() @Length(1, 120) name!: string;
  @IsOptional() @IsIn(['UTILITY', 'MARKETING', 'AUTHENTICATION']) category?: string;
  @IsOptional() @IsString() @MaxLength(10) language?: string;
  @IsOptional() @IsIn(TEMPLATE_STATUS_INPUTS) status?: string;
  @IsOptional() @IsString() @MaxLength(1024) body?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(10) @ValidateNested({ each: true }) @Type(() => ComponentDto) components?: ComponentDto[];
}

export class KnowledgeDocumentDto {
  @IsOptional() @IsString() @MaxLength(200) sourceFile?: string;
  @IsString() @Length(1, 200_000) text!: string;
}

class RuleConditions {
  @IsOptional() @IsIn(STAGES) stage?: string;
  @IsOptional() @IsIn(STAGES) stageFrom?: string;
  @IsOptional() @IsInt() @Min(1) @Max(24 * 30) waitHours?: number;
  @IsOptional() @IsIn(STAGES) toStage?: string;
  @IsOptional() @IsIn(STAGES) stageTo?: string;
  @IsOptional() @IsString() @MaxLength(80) event?: string;
  @IsOptional() @IsString() @MaxLength(80) tag?: string;
}
class RuleActions {
  @IsOptional() @IsIn(STAGES) moveStage?: string;
  @IsOptional() @IsString() @MaxLength(120) sendTemplate?: string;
  @IsOptional() @IsString() @MaxLength(1000) sendText?: string;
}
export class RuleV1Dto {
  @IsString() @Length(1, 120) name!: string;
  @IsIn(RULE_TRIGGER_INPUTS) trigger!: string;
  @IsOptional() @IsObject() @ValidateNested() @Type(() => RuleConditions) conditions?: RuleConditions;
  @IsOptional() @IsObject() @ValidateNested() @Type(() => RuleActions) actions?: RuleActions;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @IsBoolean() active?: boolean;
  @IsOptional() @IsIn(STAGES) stageFrom?: string;
  @IsOptional() @IsIn(STAGES) stageTo?: string;
  @IsOptional() @IsString() @MaxLength(120) templateName?: string;
}

export class WebhookV1Dto {
  @IsString() @Length(1, 120) name!: string;
  @IsString() @Length(8, 500) url!: string;
  @IsOptional() @IsArray() @ArrayMaxSize(20) @IsString({ each: true }) events?: string[];
  @IsOptional() @IsBoolean() isActive?: boolean;
}

class FaqItem {
  @IsString() @Length(1, 300) question!: string;
  @IsString() @Length(1, 1500) answer!: string;
}
class HoursV1 {
  @IsBoolean() enabled!: boolean;
  @IsArray() @ArrayMaxSize(7) @IsInt({ each: true }) @Min(0, { each: true }) @Max(6, { each: true }) days!: number[];
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/) start!: string;
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/) end!: string;
}
export class AiConfigV1Dto {
  @IsOptional() @IsString() @MaxLength(80) agentName?: string;
  @IsOptional() @IsString() @MaxLength(160) agentRole?: string;
  @IsOptional() @IsString() @MaxLength(120) businessName?: string;
  @IsOptional() @IsString() @MaxLength(120) businessType?: string;
  @IsOptional() @IsString() @MaxLength(40) language?: string;
  @IsOptional() @IsString() @MaxLength(160) tone?: string;
  @IsOptional() @IsString() @MaxLength(300) personality?: string;
  @IsOptional() @IsString() @MaxLength(80) model?: string;
  @IsOptional() @IsNumber() @Min(0) @Max(1) temperature?: number;
  @IsOptional() @IsString() @MaxLength(8000) systemPrompt?: string;
  @IsOptional() @IsString() @MaxLength(1000) greeting?: string;
  @IsOptional() @IsString() @MaxLength(4000) salesFlow?: string;
  @IsOptional() @IsString() @MaxLength(4000) restrictions?: string;
  @IsOptional() @IsString() @MaxLength(20_000) faq?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(50) @ValidateNested({ each: true }) @Type(() => FaqItem) faqItems?: FaqItem[];
  @IsOptional() @IsBoolean() isAiActive?: boolean;
  @IsOptional() @IsArray() @ArrayMaxSize(30) @IsString({ each: true }) @MaxLength(60, { each: true }) handoffKeywords?: string[];
  @IsOptional() @IsString() @MaxLength(1000) handoffMessage?: string;
  @IsOptional() @IsObject() @ValidateNested() @Type(() => HoursV1) hours?: HoursV1;
  @IsOptional() @IsString() @MaxLength(1000) outOfHoursMessage?: string;
}
export class AiTestDto { @IsString() @Length(1, 1000) message!: string; }

export class BcvV1Dto {
  @IsOptional() @IsNumber() @Min(0.0001) @Max(1e9) rate?: number;
  @IsOptional() @IsBoolean() auto?: boolean;
}

export class ConnectV1Dto {
  @IsString() @Length(3, 40) phoneNumberId!: string;
  @IsString() @Length(10, 1000) accessToken!: string;
  @IsOptional() @IsString() @MaxLength(40) wabaId?: string;
}
