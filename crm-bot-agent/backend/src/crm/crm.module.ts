import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  AgentController, AppointmentsController, AutomationsController, ContactsController, ConversationsController, FunnelController,
  KnowledgeController, ProductsController, SettingsController, StatsController, TemplatesController, WebhooksController,
} from './controllers.js';
import { CRM_ENTITIES } from './entities.js';
import { AgentEngine } from '../agent/agent.engine.js';
import { InboxService } from '../agent/inbox.service.js';
import { LlmService } from '../agent/llm.service.js';
import { OnboardingModule } from '../onboarding/onboarding.module.js';
import { WhatsappController } from '../whatsapp/whatsapp.controller.js';
import { WhatsappService } from '../whatsapp/whatsapp.service.js';
import { MediaController } from '../media/media.controller.js';
import { ProductStatsService } from './product-stats.service.js';
import { AutomationsService } from './automations.service.js';
import { EventsService } from './events.service.js';
import { LegacyRealtimeGateway, RealtimeGateway } from './realtime.gateway.js';
import { InventoryService } from './inventory.service.js';
import { AppointmentsV1Controller, ContactsV1Controller, ConversationsV1Controller } from '../v1/people.controllers.js';
import { ProductsV1Controller, KnowledgeV1Controller, TemplatesV1Controller } from '../v1/catalog.controllers.js';
import { AiConfigV1Controller, FunnelRulesV1Controller, FunnelStepsV1Controller, WebhooksV1Controller } from '../v1/automation.controllers.js';
import { DashboardV1Controller, ReportsV1Controller } from '../v1/insights.controllers.js';
import { SettingsService } from './settings.service.js';

@Module({
  imports: [TypeOrmModule.forFeature(CRM_ENTITIES), OnboardingModule],
  controllers: [
    ContactsController, AppointmentsController, ProductsController, KnowledgeController, TemplatesController,
    FunnelController, WebhooksController, AgentController, ConversationsController, StatsController, WhatsappController,
    AutomationsController, SettingsController, MediaController,
    ContactsV1Controller, ConversationsV1Controller, AppointmentsV1Controller, ProductsV1Controller, TemplatesV1Controller, KnowledgeV1Controller,
    FunnelRulesV1Controller, FunnelStepsV1Controller, WebhooksV1Controller, AiConfigV1Controller, DashboardV1Controller, ReportsV1Controller,
  ],
  providers: [ProductStatsService, EventsService, LlmService, AgentEngine, InboxService, WhatsappService, SettingsService, InventoryService, AutomationsService, RealtimeGateway, LegacyRealtimeGateway],
})
export class CrmModule {}
