import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';

interface ActivityBar {
  day: string;
  value: number;
  heightPct: number;
  active: boolean;
  aiMessages: number;
  clientMessages: number;
}

interface PendingItem {
  id: string;
  title: string;
  subtitle: string;
  count?: number;
  hasArrow?: boolean;
  theme: 'amber' | 'emerald' | 'blue' | 'violet';
  actionView: 'conversaciones' | 'clientes' | 'workflow' | 'backend';
  filterParam?: string;
}

interface PipelineStageRow {
  id: string;
  label: string;
  count: number;
  progressPct: number;
  dotColor: string;
  barColor: string;
  stageKey: LeadStage;
}

type LeadStage =
  | 'Nuevos'
  | 'Contactados'
  | 'Calificados'
  | 'Interesados'
  | 'Negociación'
  | 'Cerrados'
  | 'Perdidos';

interface CrmContact {
  id: string;
  name: string;
  phone: string;
  email: string;
  company: string;
  stage: LeadStage;
  score: number;
  lastActive: string;
  assignedTo: 'IA' | 'Humano';
  avatarInitials: string;
}

interface ChatMessage {
  id: string;
  sender: 'client' | 'ai' | 'human';
  text: string;
  time: string;
}

interface ConversationThread {
  id: string;
  contactId: string;
  contactName: string;
  phone: string;
  mode: 'IA' | 'Humano';
  unreadCount: number;
  lastMessage: string;
  lastTime: string;
  stage: LeadStage;
  messages: ChatMessage[];
}

interface BackendFile {
  id: string;
  filename: string;
  path: string;
  badge: string;
  code: string;
}

@Component({
  selector: 'app-root',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="relay-viewport min-h-screen w-full text-white flex p-4 md:p-6 lg:p-7 gap-6 lg:gap-8 select-none overflow-x-hidden relative">
      
      <!-- Ambient Background Glows -->
      <div class="pointer-events-none fixed inset-0 z-0 overflow-hidden">
        <div class="ambient-glow-bottom-left"></div>
        <div class="ambient-glow-top-right"></div>
        <div class="ambient-glow-center"></div>
      </div>

      <!-- LEFT FLOATING SIDEBAR -->
      <aside class="relay-card sidebar-glass w-[235px] xl:w-[250px] shrink-0 flex flex-col justify-between py-7 px-4 z-10 min-h-[calc(100vh-3.5rem)]">
        <div>
          <!-- Brand Header -->
          <div class="px-4 pb-5 mb-5 border-b border-white/[0.12] flex items-center justify-between">
            <span class="text-[22px] font-normal tracking-tight text-white">Relay</span>
            <span class="text-[10px] font-light tracking-widest uppercase px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              CRM v22
            </span>
          </div>

          <!-- Primary Navigation -->
          <nav class="space-y-1.5">
            <!-- Dashboard -->
            <button
              type="button"
              (click)="activeView.set('dashboard')"
              [class]="activeView() === 'dashboard' ? 'nav-pill-active w-full' : 'nav-pill-inactive w-full'"
            >
              <span class="w-5 h-5 flex items-center justify-center">
                <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M18 3a3 3 0 0 0-3 3v12a3 3 0 0 0 3 3 3 3 0 0 0 3-3 3 3 0 0 0-3-3H6a3 3 0 0 0-3 3 3 3 0 0 0 3 3 3 3 0 0 0 3-3V6a3 3 0 0 0-3-3 3 3 0 0 0-3 3 3 3 0 0 0 3 3h12a3 3 0 0 0 3-3 3 3 0 0 0-3-3z"/>
                </svg>
              </span>
              <span class="text-[14px] font-normal">Dashboard</span>
            </button>

            <!-- Conversaciones (CRM Inbox - Image 3) -->
            <button
              type="button"
              (click)="activeView.set('conversaciones')"
              [class]="activeView() === 'conversaciones' ? 'nav-pill-active w-full' : 'nav-pill-inactive w-full'"
            >
              <span class="w-5 h-5 flex items-center justify-center">
                <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>
                </svg>
              </span>
              <div class="flex items-center justify-between flex-1">
                <span class="text-[14px] font-light">Conversaciones</span>
                @if (totalUnreadConversations() > 0 && !conversationsDisconnected()) {
                  <span class="px-1.5 py-0.5 text-[10px] font-semibold rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                    {{ totalUnreadConversations() }}
                  </span>
                }
              </div>
            </button>

            <!-- Clientes (CRM de Clientes - Image 4) -->
            <button
              type="button"
              (click)="activeView.set('clientes')"
              [class]="activeView() === 'clientes' ? 'nav-pill-active w-full' : 'nav-pill-inactive w-full'"
            >
              <span class="w-5 h-5 flex items-center justify-center">
                <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                  <circle cx="12" cy="7" r="4"/>
                </svg>
              </span>
              <div class="flex items-center justify-between flex-1">
                <span class="text-[14px] font-light">Clientes</span>
                <span class="text-[11px] font-light text-[#6e7772]">{{ contacts().length }}</span>
              </div>
            </button>

            <!-- Reportes / Workflow IA -->
            <button
              type="button"
              (click)="activeView.set('workflow')"
              [class]="activeView() === 'workflow' ? 'nav-pill-active w-full' : 'nav-pill-inactive w-full'"
            >
              <span class="w-5 h-5 flex items-center justify-center">
                <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M3 3v18h18"/>
                  <path stroke-linecap="round" stroke-linejoin="round" d="m19 9-5 5-4-4-3 3"/>
                </svg>
              </span>
              <span class="text-[14px] font-light">Reportes &amp; Flujo IA</span>
            </button>

            <!-- Agenda -->
            <button
              type="button"
              (click)="openPendingItem(pendingItems()[1])"
              class="nav-pill-inactive w-full"
            >
              <span class="w-5 h-5 flex items-center justify-center">
                <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6">
                  <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                  <line x1="16" y1="2" x2="16" y2="6"/>
                  <line x1="8" y1="2" x2="8" y2="6"/>
                  <line x1="3" y1="10" x2="21" y2="10"/>
                </svg>
              </span>
              <span class="text-[14px] font-light">Agenda</span>
            </button>

            <!-- Productos -->
            <button
              type="button"
              (click)="openPendingItem(pendingItems()[3])"
              class="nav-pill-inactive w-full"
            >
              <span class="w-5 h-5 flex items-center justify-center">
                <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/>
                  <path stroke-linecap="round" stroke-linejoin="round" d="M3 6h18"/>
                  <path stroke-linecap="round" stroke-linejoin="round" d="M16 10a4 4 0 0 1-8 0"/>
                </svg>
              </span>
              <span class="text-[14px] font-light">Productos</span>
            </button>

            <!-- Configuración (Backend NestJS 12 + PG 17) -->
            <div class="pt-6">
              <button
                type="button"
                (click)="activeView.set('backend')"
                [class]="activeView() === 'backend' ? 'nav-pill-active w-full' : 'nav-pill-inactive w-full'"
              >
                <span class="w-5 h-5 flex items-center justify-center">
                  <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6">
                    <circle cx="12" cy="12" r="3"/>
                    <path stroke-linecap="round" stroke-linejoin="round" d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
                  </svg>
                </span>
                <span class="text-[14px] font-light">Configuración</span>
              </button>
            </div>
          </nav>
        </div>

        <!-- Bottom Exit Action -->
        <div class="pt-4">
          <button
            type="button"
            (click)="resetDemo()"
            class="nav-pill-inactive w-full text-[#7a827d] hover:text-white transition-colors"
          >
            <span class="w-5 h-5 flex items-center justify-center">
              <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6">
                <path stroke-linecap="round" stroke-linejoin="round" d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
                <polyline points="16 17 21 12 16 7"/>
                <line x1="21" y1="12" x2="9" y2="12"/>
              </svg>
            </span>
            <span class="text-[14px] font-light">Salir</span>
          </button>
        </div>
      </aside>

      <!-- MAIN CONTENT AREA -->
      <main class="flex-1 flex flex-col justify-between z-10 max-w-[1380px] pt-1 pb-1 min-w-0">
        
        <!-- TOP BAR (Breadcrumb + Quick Switcher + Bell + Profile) -->
        <header class="flex flex-wrap items-center justify-between gap-4 mb-5">
          <!-- Breadcrumb -->
          <div class="flex items-center gap-3 text-[13.5px]">
            <span class="text-[#727a75] flex items-center gap-2 font-light">
              <svg class="w-3.5 h-3.5 text-[#727a75]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75">
                <path stroke-linecap="round" stroke-linejoin="round" d="M18 3a3 3 0 0 0-3 3v12a3 3 0 0 0 3 3 3 3 0 0 0 3-3 3 3 0 0 0-3-3H6a3 3 0 0 0-3 3 3 3 0 0 0 3 3 3 3 0 0 0 3-3V6a3 3 0 0 0-3-3 3 3 0 0 0-3 3 3 3 0 0 0 3 3h12a3 3 0 0 0 3-3 3 3 0 0 0-3-3z"/>
              </svg>
              Overview
            </span>
            <span class="text-[#49514d] font-light">/</span>
            <span class="text-white font-normal tracking-wide">
              @switch (activeView()) {
                @case ('dashboard') { Dashboard }
                @case ('conversaciones') { Conversaciones CRM }
                @case ('clientes') { CRM de Clientes }
                @case ('workflow') { Flujo del Agente IA }
                @default { NestJS 12 + PostgreSQL 17 }
              }
            </span>
          </div>

          <!-- Right Actions: Quick View Switcher + Bell + Avatar -->
          <div class="flex items-center gap-3">
            <div class="hidden md:flex items-center p-1 rounded-full bg-white/[0.03] border border-white/[0.09] backdrop-blur-md">
              <button
                type="button"
                (click)="activeView.set('dashboard')"
                class="px-3 py-1 rounded-full text-[12px] transition-all"
                [class]="activeView() === 'dashboard' ? 'bg-[#1a522d]/80 text-[#38ef7d] border border-[#22c55e]/40 font-normal' : 'text-[#8c948f] hover:text-white font-light'"
              >
                Dashboard
              </button>
              <button
                type="button"
                (click)="activeView.set('conversaciones')"
                class="px-3 py-1 rounded-full text-[12px] transition-all"
                [class]="activeView() === 'conversaciones' ? 'bg-[#1a522d]/80 text-[#38ef7d] border border-[#22c55e]/40 font-normal' : 'text-[#8c948f] hover:text-white font-light'"
              >
                Conversaciones
              </button>
              <button
                type="button"
                (click)="activeView.set('clientes')"
                class="px-3 py-1 rounded-full text-[12px] transition-all"
                [class]="activeView() === 'clientes' ? 'bg-[#1a522d]/80 text-[#38ef7d] border border-[#22c55e]/40 font-normal' : 'text-[#8c948f] hover:text-white font-light'"
              >
                Clientes
              </button>
              <button
                type="button"
                (click)="activeView.set('workflow')"
                class="px-3 py-1 rounded-full text-[12px] transition-all flex items-center gap-1.5"
                [class]="activeView() === 'workflow' ? 'bg-[#1a522d]/80 text-[#38ef7d] border border-[#22c55e]/40 font-normal' : 'text-[#8c948f] hover:text-white font-light'"
              >
                <span class="w-1.5 h-1.5 rounded-full bg-[#22c55e]"></span>
                Agente IA
              </button>
            </div>

            <!-- Notification Bell -->
            <button
              type="button"
              (click)="toggleRealtimePulse()"
              title="Simular evento en tiempo real"
              class="w-9 h-9 rounded-full flex items-center justify-center text-white/80 hover:text-white transition-colors relative"
            >
              <svg class="w-[18px] h-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7">
                <path stroke-linecap="round" stroke-linejoin="round" d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
                <path stroke-linecap="round" stroke-linejoin="round" d="M13.73 21a2 2 0 0 1-3.46 0"/>
              </svg>
              @if (unreadBell()) {
                <span class="w-1.5 h-1.5 rounded-full bg-[#22c55e] absolute top-2 right-2 shadow-[0_0_8px_#22c55e]"></span>
              }
            </button>

            <!-- Minimalist Glass Avatar Circle -->
            <button
              type="button"
              (click)="activeView.set('workflow')"
              title="Emanuel - Relay Admin"
              class="w-9 h-9 rounded-full bg-[#1a221d] border border-white/25 shadow-[inset_0_1px_2px_rgba(255,255,255,0.25)] hover:border-emerald-400/50 transition-all"
            ></button>
          </div>
        </header>

        <!-- ========================================================== -->
        <!-- VIEW 1: DASHBOARD PRINCIPAL CON NUEVOS WIDGETS             -->
        <!-- ========================================================== -->
        @if (activeView() === 'dashboard') {
          <div class="flex-1 flex flex-col justify-between space-y-5">
            
            <!-- Greeting Block -->
            <section class="space-y-1">
              <h1 class="text-[31px] md:text-[34px] font-normal tracking-[-0.01em] text-white leading-tight">
                Hola , <span class="font-semibold">{{ userName() }}</span>
              </h1>
              <p class="text-[13.5px] font-light text-[#6e7772] tracking-wide">
                Rendimiento de los ultimos 7 dias
              </p>
            </section>

            <!-- 4 KPI CARDS ROW -->
            <section class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-5">
              <!-- KPI 1: Mensajes IA -->
              <div
                (click)="incrementKpi('ai')"
                class="relay-card kpi-card px-7 py-5 cursor-pointer group transition-transform duration-200 hover:-translate-y-0.5"
              >
                <p class="text-[12.5px] font-light text-[#b5bdb8] mb-1.5 tracking-wide">
                  Mensajes IA
                </p>
                <div class="text-[35px] font-normal text-white leading-none tracking-tight">
                  {{ kpiAiMessages() }}
                </div>
              </div>

              <!-- KPI 2: Nuevos leads -->
              <div
                (click)="incrementKpi('leads')"
                class="relay-card kpi-card px-7 py-5 cursor-pointer group transition-transform duration-200 hover:-translate-y-0.5"
              >
                <p class="text-[12.5px] font-light text-[#b5bdb8] mb-1.5 tracking-wide">
                  Nuevos leads
                </p>
                <div class="text-[35px] font-normal text-white leading-none tracking-tight">
                  +{{ kpiNewLeads() }}
                </div>
              </div>

              <!-- KPI 3: Citas Agendadas -->
              <div
                (click)="incrementKpi('appointments')"
                class="relay-card kpi-card px-7 py-5 cursor-pointer group transition-transform duration-200 hover:-translate-y-0.5"
              >
                <p class="text-[12.5px] font-light text-[#b5bdb8] mb-1.5 tracking-wide">
                  Citas Agendadas
                </p>
                <div class="text-[35px] font-normal text-white leading-none tracking-tight">
                  {{ kpiAppointments() }}
                </div>
              </div>

              <!-- KPI 4: Tasa de Respuesta -->
              <div
                (click)="incrementKpi('rate')"
                class="relay-card kpi-card-emerald px-7 py-5 cursor-pointer group transition-transform duration-200 hover:-translate-y-0.5"
              >
                <p class="text-[12.5px] font-light text-[#7e8782] mb-1.5 tracking-wide">
                  Tasa de Respuesta
                </p>
                <div class="text-[35px] font-normal text-white leading-none tracking-tight">
                  {{ kpiResponseRate() }}%
                </div>
              </div>
            </section>

            <!-- MAIN ASYMMETRIC GRID: Left/Center (8 cols) + Right Pendientes (4 cols) -->
            <section class="grid grid-cols-1 xl:grid-cols-12 gap-6 items-stretch flex-1">
              
              <!-- Left/Center Column (8 of 12 cols on XL) -->
              <div class="xl:col-span-8 flex flex-col justify-between gap-6">
                
                <!-- Card: Actividad de Mensajes -->
                <div class="relay-card px-7 py-6 flex flex-col justify-between min-h-[255px]">
                  <div class="flex items-start justify-between">
                    <div>
                      <h2 class="text-[16px] font-normal text-white tracking-wide">
                        Actividad de Mensajes
                      </h2>
                      <p class="text-[12px] font-light text-[#5f6763] mt-0.5">
                        Mensajes IA vs de Clientes &nbsp;-&nbsp; 7 Dias
                      </p>
                    </div>
                    <div class="text-right hidden sm:block">
                      <span class="text-[11px] font-light text-[#7e8782]">
                        Día activo:
                        <strong class="text-emerald-400 font-semibold">{{ selectedBar().day }}</strong>
                        ({{ selectedBar().aiMessages }} IA / {{ selectedBar().clientMessages }} Clientes)
                      </span>
                    </div>
                  </div>

                  <!-- Bar Chart Container -->
                  <div class="mt-5 flex items-end gap-4 sm:gap-6 h-[148px] pt-3 pb-1 px-1">
                    <div class="flex flex-col justify-between h-[118px] pb-6 text-[9px] font-light text-[#555d58] select-none pr-1">
                      <span>20</span>
                      <span>10</span>
                      <span>0</span>
                    </div>

                    <div class="flex-1 grid grid-cols-9 gap-3 sm:gap-5 items-end h-full">
                      @for (bar of activityBars(); track $index) {
                        <button
                          type="button"
                          (click)="selectBar($index)"
                          class="flex flex-col items-center justify-end h-full group focus:outline-none"
                        >
                          <div class="w-full max-w-[26px] h-[118px] flex items-end justify-center">
                            <div
                              class="w-full rounded-t-[6px] rounded-b-[4px] transition-all duration-300"
                              [class]="bar.active ? 'bar-neon-green' : 'bar-muted-glass group-hover:bg-white/15'"
                              [style.height.%]="bar.heightPct"
                            ></div>
                          </div>
                          <span
                            class="mt-2.5 text-[11px] font-light transition-colors"
                            [class]="bar.active ? 'text-[#8c9690]' : 'text-[#6c7570]'"
                          >
                            {{ bar.day }}
                          </span>
                        </button>
                      }
                    </div>
                  </div>
                </div>

                <!-- Bottom Sub-Grid: Pipelines de Leads (Image 2) + Rendimiento del Bot Mejorado -->
                <div class="grid grid-cols-1 lg:grid-cols-12 gap-6 flex-1">
                  
                  <!-- Card: Pipelines de Leads (Exact Replica of Image 2 with Beveled Obsidian Pills) -->
                  <div class="relay-card lg:col-span-7 px-6 py-5 flex flex-col justify-between">
                    <div class="flex items-center justify-between mb-3.5">
                      <h3 class="text-[16px] font-normal text-white tracking-wide">
                        Pipelines de Leads
                      </h3>
                      <button
                        type="button"
                        (click)="activeView.set('clientes')"
                        class="text-[12px] font-light text-[#6d7570] hover:text-emerald-400 transition-colors"
                      >
                        Ver todo
                      </button>
                    </div>

                    <div class="space-y-2.5 my-auto">
                      @for (stage of pipelineRows(); track stage.id) {
                        <div
                          (click)="navigateToStage(stage.stageKey)"
                          class="glass-pill-row px-4 py-2.5 flex items-center justify-between gap-4 cursor-pointer group transition-all duration-200 hover:border-white/25"
                        >
                          <div class="flex items-center gap-3.5 flex-1 min-w-0">
                            <!-- Glowing Status Dot -->
                            <span
                              class="w-2.5 h-2.5 rounded-full shrink-0"
                              [style.background-color]="stage.dotColor"
                              [style.box-shadow]="'0 0 8px ' + stage.dotColor"
                            ></span>

                            <!-- Stage Label + Progress Bar -->
                            <div class="flex-1 min-w-0">
                              <div class="text-[13.5px] font-normal text-white/90 group-hover:text-white transition-colors leading-snug">
                                {{ stage.label }}
                              </div>
                              <div class="mt-1.5 w-full h-[3px] rounded-full bg-white/[0.07] overflow-hidden">
                                <div
                                  class="h-full rounded-full transition-all duration-500"
                                  [style.width.%]="stage.progressPct"
                                  [style.background-color]="stage.barColor"
                                ></div>
                              </div>
                            </div>
                          </div>

                          <!-- Right SemiBold Counter -->
                          <span class="text-[15px] font-semibold text-white tracking-tight pl-2">
                            {{ stage.count }}
                          </span>
                        </div>
                      }
                    </div>
                  </div>

                  <!-- Card: Rendimiento del Bot Mejorado -->
                  <div class="relay-card lg:col-span-5 px-6 py-5 flex flex-col justify-between">
                    <div class="flex items-center justify-between">
                      <div>
                        <h3 class="text-[16px] font-normal text-white tracking-wide">
                          Rendimiento del Bot
                        </h3>
                        <p class="text-[11px] font-light text-[#6e7772]">
                          Motor OpenAI <span class="text-emerald-400 font-normal">gpt-4o-mini</span>
                        </p>
                      </div>
                      <span class="px-2 py-0.5 rounded-full text-[10px] font-normal bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                        <span class="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                        Online
                      </span>
                    </div>

                    <!-- Glowing Ring Gauge + Telemetry Metrics -->
                    <div class="my-auto py-3 flex items-center justify-between gap-4">
                      <button
                        type="button"
                        (click)="cycleBotPerformance()"
                        title="Haz clic para conmutar métricas de carga IA"
                        class="relative w-[108px] h-[108px] shrink-0 flex items-center justify-center group focus:outline-none mx-auto"
                      >
                        <svg class="w-full h-full -rotate-90 transform" viewBox="0 0 100 100">
                          <circle
                            cx="50"
                            cy="50"
                            r="39"
                            fill="transparent"
                            stroke="rgba(34, 197, 94, 0.13)"
                            stroke-width="9"
                          />
                          <circle
                            cx="50"
                            cy="50"
                            r="39"
                            fill="transparent"
                            stroke="#24d658"
                            stroke-width="9"
                            stroke-linecap="round"
                            [attr.stroke-dasharray]="245"
                            [attr.stroke-dashoffset]="botRingOffset()"
                            class="transition-all duration-500 drop-shadow-[0_0_10px_rgba(36,214,88,0.55)]"
                          />
                        </svg>
                        <div class="absolute flex flex-col items-center">
                          <span class="text-[24px] font-semibold text-white tracking-tight leading-none">
                            {{ botPerformance() }}%
                          </span>
                          <span class="text-[9.5px] font-light text-[#7e8782] mt-0.5">
                            Carga IA
                          </span>
                        </div>
                      </button>

                      <!-- Real-time Bot Telemetry Pills -->
                      <div class="flex-1 space-y-2">
                        <div class="px-3 py-1.5 rounded-xl bg-white/[0.03] border border-white/[0.08] flex items-center justify-between">
                          <span class="text-[11px] font-light text-[#8b948e]">Tiempo resp.</span>
                          <span class="text-[12px] font-semibold text-white">1.2s</span>
                        </div>
                        <div class="px-3 py-1.5 rounded-xl bg-white/[0.03] border border-white/[0.08] flex items-center justify-between">
                          <span class="text-[11px] font-light text-[#8b948e]">Resolución IA</span>
                          <span class="text-[12px] font-semibold text-emerald-400">84%</span>
                        </div>
                        <div class="px-3 py-1.5 rounded-xl bg-white/[0.03] border border-white/[0.08] flex items-center justify-between">
                          <span class="text-[11px] font-light text-[#8b948e]">Precisión</span>
                          <span class="text-[12px] font-semibold text-white">96.4%</span>
                        </div>
                      </div>
                    </div>

                    <!-- Footer Action to Open Workflow Canvas -->
                    <button
                      type="button"
                      (click)="activeView.set('workflow')"
                      class="w-full py-2 px-3 rounded-xl bg-white/[0.03] hover:bg-emerald-500/10 border border-white/[0.09] hover:border-emerald-500/30 text-[11.5px] font-normal text-[#b5bdb8] hover:text-emerald-300 transition-all flex items-center justify-between"
                    >
                      <span>Abrir flujo del Agente IA</span>
                      <span>→</span>
                    </button>
                  </div>

                </div>
              </div>

              <!-- Right Column: Tall Card "Pendientes" (Exact Replica of Image 1 with 5 Beveled Cards) -->
              <div class="xl:col-span-4 flex">
                <div class="relay-card w-full px-6 py-6 flex flex-col justify-between">
                  <div>
                    <div class="flex items-center justify-between mb-5">
                      <h3 class="text-[17px] font-normal text-white tracking-wide">
                        Pendientes
                      </h3>
                      <span class="text-[11px] font-light text-[#6e7772]">
                        Tiempo real
                      </span>
                    </div>

                    <!-- 5 Beveled Glass Cards (Image 1) -->
                    <div class="space-y-3.5">
                      @for (item of pendingItems(); track item.id) {
                        <div
                          (click)="openPendingItem(item)"
                          class="pending-item-card px-4 py-3.5 flex items-center justify-between gap-3.5 cursor-pointer group transition-all duration-200 hover:-translate-y-0.5 hover:border-white/25"
                        >
                          <div class="flex items-center gap-3.5 min-w-0">
                            <!-- Colored Translucent Square Icon -->
                            <div
                              class="w-10 h-10 rounded-[12px] shrink-0 flex items-center justify-center border transition-transform group-hover:scale-105"
                              [class]="getPendingIconClasses(item.theme)"
                            >
                              @switch (item.id) {
                                @case ('human') {
                                  <!-- Droplet Icon (Amber) -->
                                  <svg class="w-[18px] h-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
                                    <path stroke-linecap="round" stroke-linejoin="round" d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"/>
                                  </svg>
                                }
                                @case ('today') {
                                  <!-- Calendar Icon (Emerald) -->
                                  <svg class="w-[18px] h-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
                                    <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                                    <line x1="16" y1="2" x2="16" y2="6"/>
                                    <line x1="8" y1="2" x2="8" y2="6"/>
                                    <line x1="3" y1="10" x2="21" y2="10"/>
                                  </svg>
                                }
                                @case ('week') {
                                  <!-- Clock Icon (Blue) -->
                                  <svg class="w-[18px] h-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
                                    <circle cx="12" cy="12" r="9"/>
                                    <polyline points="12 7 12 12 15 15"/>
                                  </svg>
                                }
                                @case ('stock') {
                                  <!-- Box/Archive Icon (Amber) -->
                                  <svg class="w-[18px] h-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
                                    <polyline points="21 8 21 21 3 21 3 8"/>
                                    <rect x="1" y="3" width="22" height="5" rx="1"/>
                                    <line x1="10" y1="12" x2="14" y2="12"/>
                                  </svg>
                                }
                                @case ('kb') {
                                  <!-- Open Book Icon (Violet) -->
                                  <svg class="w-[18px] h-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
                                    <path stroke-linecap="round" stroke-linejoin="round" d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/>
                                    <path stroke-linecap="round" stroke-linejoin="round" d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>
                                  </svg>
                                }
                              }
                            </div>

                            <!-- Title (SemiBold) & Subtitle (Light) -->
                            <div class="min-w-0">
                              <h4 class="text-[14px] font-semibold text-white/95 truncate leading-snug">
                                {{ item.title }}
                              </h4>
                              <p class="text-[12px] font-light text-[#6e7772] truncate mt-0.5">
                                {{ item.subtitle }}
                              </p>
                            </div>
                          </div>

                          <!-- Right Counter or Arrow -->
                          <div class="shrink-0 pl-2">
                            @if (item.hasArrow) {
                              <span class="text-[#727a75] group-hover:text-white group-hover:translate-x-0.5 transition-all inline-block text-lg">
                                →
                              </span>
                            } @else {
                              <span class="text-[16px] font-semibold text-white tracking-tight">
                                {{ item.count }}
                              </span>
                            }
                          </div>
                        </div>
                      }
                    </div>
                  </div>

                  <!-- Bottom Status Footer -->
                  <div class="pt-5 flex items-center justify-between text-[11px] font-light text-[#545c57]">
                    <span>Sincronizado con PostgreSQL 17</span>
                    <span class="w-1.5 h-1.5 rounded-full bg-emerald-500/70 shadow-[0_0_6px_#22c55e]"></span>
                  </div>
                </div>
              </div>

            </section>
          </div>
        }

        <!-- ========================================================== -->
        <!-- VIEW 2: CONVERSACIONES CRM (IMAGE 3 + OBSIDIAN GLASS)      -->
        <!-- ========================================================== -->
        @if (activeView() === 'conversaciones') {
          <div class="flex-1 flex flex-col gap-4 min-h-[640px]">
            
            <!-- Top Subtle Mode Bar -->
            <div class="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h1 class="text-[26px] font-semibold text-white tracking-tight leading-none">
                  Centro de Conversaciones
                </h1>
                <p class="text-[13px] font-light text-[#6e7772] mt-1">
                  Supervisa el diálogo en tiempo real entre clientes, el Agente IA y operadores humanos
                </p>
              </div>

              <!-- Toggle to inspect either Live CRM Data or Exact Empty/Offline State from Image 3 -->
              <div class="flex items-center gap-2 p-1 rounded-xl bg-white/[0.03] border border-white/[0.1]">
                <button
                  type="button"
                  (click)="conversationsDisconnected.set(false)"
                  class="px-3 py-1.5 rounded-lg text-[12px] transition-all"
                  [class]="!conversationsDisconnected() ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/35 font-semibold' : 'text-[#7e8782] hover:text-white font-light'"
                >
                  Con datos CRM ({{ conversations().length }})
                </button>
                <button
                  type="button"
                  (click)="enableEmptyConversationState()"
                  class="px-3 py-1.5 rounded-lg text-[12px] transition-all"
                  [class]="conversationsDisconnected() ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/35 font-semibold' : 'text-[#7e8782] hover:text-white font-light'"
                >
                  Estado vacío (Réplica Captura 3)
                </button>
              </div>
            </div>

            <!-- Main Split CRM Container -->
            <div class="relay-card flex-1 grid grid-cols-1 lg:grid-cols-12 overflow-hidden min-h-[560px]">
              
              <!-- LEFT PANEL: Lista de Mensajes -->
              <div class="lg:col-span-4 border-b lg:border-b-0 lg:border-r border-white/[0.1] flex flex-col justify-between p-5 bg-black/20">
                <div>
                  <!-- Header: Mensajes + Counter Pill -->
                  <div class="flex items-center justify-between mb-4">
                    <h2 class="text-[17px] font-semibold text-white tracking-wide">
                      Mensajes
                    </h2>
                    <span class="px-2.5 py-0.5 rounded-full text-[11.5px] font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                      {{ conversationsDisconnected() ? 0 : filteredConversations().length }}
                    </span>
                  </div>

                  <!-- Search Input -->
                  <div class="relative mb-3.5">
                    <svg class="w-4 h-4 text-[#6e7772] absolute left-3.5 top-1/2 -translate-y-1/2" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
                      <circle cx="11" cy="11" r="8"/>
                      <line x1="21" y1="21" x2="16.65" y2="16.65"/>
                    </svg>
                    <input
                      type="text"
                      [value]="conversationSearch()"
                      (input)="conversationSearch.set($any($event.target).value)"
                      placeholder="Buscar por cliente o teléfono..."
                      class="w-full pl-10 pr-4 py-2.5 rounded-xl bg-white/[0.03] border border-white/[0.11] text-[13px] font-light text-white placeholder-[#6e7772] focus:outline-none focus:border-emerald-400/50 transition-colors"
                    />
                  </div>

                  <!-- Filter Tabs: Todos | IA | Humano | No leídos -->
                  <div class="grid grid-cols-4 gap-1.5 p-1 rounded-xl bg-white/[0.02] border border-white/[0.08] mb-4">
                    <button
                      type="button"
                      (click)="conversationFilter.set('Todos')"
                      class="py-1.5 px-2 rounded-lg text-[11.5px] transition-all text-center"
                      [class]="conversationFilter() === 'Todos' ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/35 font-semibold' : 'text-[#7e8782] hover:text-white font-light'"
                    >
                      Todos
                    </button>
                    <button
                      type="button"
                      (click)="conversationFilter.set('IA')"
                      class="py-1.5 px-2 rounded-lg text-[11.5px] transition-all flex items-center justify-center gap-1"
                      [class]="conversationFilter() === 'IA' ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/35 font-semibold' : 'text-[#7e8782] hover:text-white font-light'"
                    >
                      <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
                        <rect x="3" y="11" width="18" height="10" rx="2"/>
                        <circle cx="12" cy="5" r="2"/>
                        <path d="M12 7v4"/>
                      </svg>
                      IA
                    </button>
                    <button
                      type="button"
                      (click)="conversationFilter.set('Humano')"
                      class="py-1.5 px-2 rounded-lg text-[11.5px] transition-all flex items-center justify-center gap-1"
                      [class]="conversationFilter() === 'Humano' ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/35 font-semibold' : 'text-[#7e8782] hover:text-white font-light'"
                    >
                      <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
                        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                        <circle cx="12" cy="7" r="4"/>
                      </svg>
                      Humano
                    </button>
                    <button
                      type="button"
                      (click)="conversationFilter.set('No leídos')"
                      class="py-1.5 px-2 rounded-lg text-[11.5px] transition-all text-center truncate"
                      [class]="conversationFilter() === 'No leídos' ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/35 font-semibold' : 'text-[#7e8782] hover:text-white font-light'"
                    >
                      No leídos
                    </button>
                  </div>
                </div>

                <!-- Thread List OR Disconnected State from Image 3 -->
                @if (conversationsDisconnected()) {
                  <div class="my-auto py-12 flex flex-col items-center justify-center text-center px-4">
                    <div class="w-11 h-11 rounded-full bg-white/[0.03] border border-white/[0.08] flex items-center justify-center text-[#6e7772] mb-3">
                      <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M22.61 16.95A5 5 0 0 0 18 10h-1.26a8 8 0 0 0-7.05-6M5 5a8 8 0 0 0 4 15h9a5 5 0 0 0 1.7-.3"/>
                        <line x1="1" y1="1" x2="23" y2="23"/>
                      </svg>
                    </div>
                    <p class="text-[13px] font-light text-[#6e7772] mb-4">
                      No se pudieron cargar las conversaciones
                    </p>
                    <button
                      type="button"
                      (click)="reconnectConversations()"
                      class="px-5 py-2 rounded-full bg-white/[0.04] hover:bg-emerald-500/15 border border-white/[0.14] hover:border-emerald-500/40 text-[12.5px] font-normal text-white transition-all"
                    >
                      Reintentar
                    </button>
                  </div>
                } @else {
                  <div class="space-y-2.5 overflow-y-auto max-h-[410px] pr-1 my-auto">
                    @for (thread of filteredConversations(); track thread.id) {
                      <div
                        (click)="selectConversation(thread.id)"
                        class="p-3.5 rounded-2xl cursor-pointer transition-all border"
                        [class]="selectedConversationId() === thread.id
                          ? 'bg-emerald-950/35 border-emerald-500/40 shadow-[inset_0_1px_1px_rgba(255,255,255,0.18)]'
                          : 'bg-white/[0.02] border-white/[0.08] hover:border-white/20'"
                      >
                        <div class="flex items-start justify-between gap-2">
                          <div class="flex items-center gap-3 min-w-0">
                            <div class="w-9 h-9 rounded-full bg-white/[0.06] border border-white/15 flex items-center justify-center text-[12px] font-semibold text-emerald-300 shrink-0">
                              {{ thread.contactName.slice(0, 2).toUpperCase() }}
                            </div>
                            <div class="min-w-0">
                              <div class="flex items-center gap-2">
                                <span class="text-[13.5px] font-semibold text-white truncate">
                                  {{ thread.contactName }}
                                </span>
                                <span
                                  class="text-[10px] px-2 py-0.5 rounded-full font-normal"
                                  [class]="thread.mode === 'IA'
                                    ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                                    : 'bg-amber-500/15 text-amber-300 border border-amber-500/30'"
                                >
                                  {{ thread.mode }}
                                </span>
                              </div>
                              <p class="text-[11.5px] font-light text-[#6e7772] truncate">
                                {{ thread.phone }}
                              </p>
                            </div>
                          </div>

                          <div class="flex flex-col items-end shrink-0">
                            <span class="text-[11px] font-light text-[#6e7772]">{{ thread.lastTime }}</span>
                            @if (thread.unreadCount > 0) {
                              <span class="mt-1 w-4 h-4 rounded-full bg-emerald-500 text-black text-[10px] font-semibold flex items-center justify-center">
                                {{ thread.unreadCount }}
                              </span>
                            }
                          </div>
                        </div>

                        <p class="mt-2 text-[12px] font-light text-[#9ca39f] truncate">
                          {{ thread.lastMessage }}
                        </p>
                      </div>
                    }
                  </div>
                }

                <div class="pt-3 border-t border-white/[0.08] flex items-center justify-between text-[11px] font-light text-[#6e7772]">
                  <span>WhatsApp Cloud API</span>
                  <span class="text-emerald-400">Latencia 42ms</span>
                </div>
              </div>

              <!-- RIGHT PANEL: Chat Activo o Estado Vacío "Selecciona una conversación" -->
              <div class="lg:col-span-8 flex flex-col justify-between p-6 relative">
                @if (!selectedConversation() || conversationsDisconnected()) {
                  <!-- Exact Replica of Right Empty State from Image 3 in Obsidian Style -->
                  <div class="m-auto flex flex-col items-center justify-center text-center max-w-[380px] py-16">
                    <div class="w-14 h-14 rounded-full bg-emerald-500/10 border border-emerald-500/30 shadow-[inset_0_1px_2px_rgba(255,255,255,0.2),0_0_25px_rgba(16,185,129,0.15)] flex items-center justify-center text-emerald-400 mb-4">
                      <svg class="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                      </svg>
                    </div>
                    <h3 class="text-[17px] font-semibold text-white tracking-wide">
                      Selecciona una conversación
                    </h3>
                    <p class="text-[13px] font-light text-[#6e7772] mt-1.5 leading-relaxed">
                      Elige un contacto de la lista lateral para ver el diálogo con la IA en tiempo real.
                    </p>
                    @if (conversationsDisconnected()) {
                      <button
                        type="button"
                        (click)="reconnectConversations()"
                        class="mt-5 px-4 py-2 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/35 text-[12.5px] font-normal text-emerald-300 transition-all"
                      >
                        Cargar conversaciones de demostración
                      </button>
                    }
                  </div>
                } @else {
                  <!-- Active Conversation Header -->
                  <div class="pb-4 border-b border-white/[0.1] flex flex-wrap items-center justify-between gap-3">
                    <div class="flex items-center gap-3">
                      <div class="w-10 h-10 rounded-full bg-emerald-500/15 border border-emerald-400/30 flex items-center justify-center text-[13px] font-semibold text-emerald-300">
                        {{ selectedConversation()!.contactName.slice(0, 2).toUpperCase() }}
                      </div>
                      <div>
                        <div class="flex items-center gap-2.5">
                          <h3 class="text-[15.5px] font-semibold text-white">
                            {{ selectedConversation()!.contactName }}
                          </h3>
                          <span class="text-[11px] px-2.5 py-0.5 rounded-full bg-white/[0.05] border border-white/10 text-[#b5bdb8] font-light">
                            Etapa: {{ selectedConversation()!.stage }}
                          </span>
                        </div>
                        <p class="text-[12px] font-light text-[#6e7772]">
                          {{ selectedConversation()!.phone }} &bull; Canal WhatsApp Oficial
                        </p>
                      </div>
                    </div>

                    <!-- Switch between IA and Human Mode -->
                    <div class="flex items-center gap-2">
                      <button
                        type="button"
                        (click)="toggleConversationMode(selectedConversation()!.id)"
                        class="px-3.5 py-1.5 rounded-xl text-[12px] font-semibold border transition-all flex items-center gap-2"
                        [class]="selectedConversation()!.mode === 'IA'
                          ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300'
                          : 'bg-amber-500/20 border-amber-500/40 text-amber-300'"
                      >
                        <span class="w-2 h-2 rounded-full" [class]="selectedConversation()!.mode === 'IA' ? 'bg-emerald-400' : 'bg-amber-400'"></span>
                        Modo actual: {{ selectedConversation()!.mode === 'IA' ? 'Agente IA (gpt-4o-mini)' : 'Intervención Humana' }}
                      </button>

                      <button
                        type="button"
                        (click)="selectedConversationId.set(null)"
                        class="px-2.5 py-1.5 rounded-xl bg-white/[0.03] hover:bg-white/[0.08] border border-white/10 text-[11.5px] font-light text-[#7e8782] hover:text-white"
                        title="Ver estado vacío"
                      >
                        Cerrar
                      </button>
                    </div>
                  </div>

                  <!-- Chat Messages Stream -->
                  <div class="flex-1 py-5 space-y-3.5 overflow-y-auto max-h-[360px] pr-2">
                    @for (msg of selectedConversation()!.messages; track msg.id) {
                      <div
                        class="flex flex-col"
                        [class]="msg.sender === 'client' ? 'items-start' : 'items-end'"
                      >
                        <div class="flex items-center gap-2 mb-1 px-1">
                          <span class="text-[10.5px] font-light text-[#6e7772]">
                            @if (msg.sender === 'client') {
                              {{ selectedConversation()!.contactName }}
                            } @else if (msg.sender === 'ai') {
                              Relay AI Agent &bull; gpt-4o-mini
                            } @else {
                              Emanuel (Operador)
                            }
                          </span>
                          <span class="text-[10px] font-light text-[#4f5753]">{{ msg.time }}</span>
                        </div>

                        <div
                          class="max-w-[78%] px-4 py-3 rounded-2xl text-[13px] font-light leading-relaxed"
                          [class]="msg.sender === 'client'
                            ? 'bg-white/[0.05] border border-white/[0.12] text-white/90 rounded-tl-sm'
                            : msg.sender === 'ai'
                              ? 'bg-gradient-to-br from-[#194d2b]/85 to-[#0f331c]/90 border border-emerald-400/35 text-white shadow-[0_8px_20px_rgba(0,0,0,0.45)] rounded-tr-sm'
                              : 'bg-amber-500/15 border border-amber-400/35 text-white rounded-tr-sm'"
                        >
                          {{ msg.text }}
                        </div>
                      </div>
                    }
                  </div>

                  <!-- Message Composer -->
                  <div class="pt-3 border-t border-white/[0.1] flex items-center gap-3">
                    <input
                      type="text"
                      [value]="draftMessage()"
                      (input)="draftMessage.set($any($event.target).value)"
                      (keydown.enter)="sendChatMessage()"
                      placeholder="Escribe un mensaje o respuesta asistida por IA..."
                      class="flex-1 px-4 py-2.5 rounded-xl bg-white/[0.03] border border-white/[0.12] text-[13px] font-light text-white placeholder-[#6e7772] focus:outline-none focus:border-emerald-400/50"
                    />
                    <button
                      type="button"
                      (click)="sendChatMessage()"
                      class="px-5 py-2.5 rounded-xl bg-gradient-to-b from-[#2be065] to-[#199e44] text-black font-semibold text-[13px] shadow-[0_0_20px_rgba(43,224,101,0.35)] hover:brightness-110 transition-all"
                    >
                      Enviar
                    </button>
                  </div>
                }
              </div>

            </div>
          </div>
        }

        <!-- ========================================================== -->
        <!-- VIEW 3: CRM DE CLIENTES (IMAGE 4 + OBSIDIAN GLASS)         -->
        <!-- ========================================================== -->
        @if (activeView() === 'clientes') {
          <div class="flex-1 flex flex-col gap-5">
            
            <!-- Top CRM Header (Exact structure of Image 4) -->
            <div class="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h1 class="text-[28px] md:text-[31px] font-semibold text-white tracking-tight leading-tight">
                  CRM de clientes
                </h1>
                <p class="text-[13.5px] font-light text-[#6e7772] mt-0.5">
                  Gestiona tu pipeline de ventas y contactos
                </p>
              </div>

              <!-- Right Search + Actions: Buscar contacto... | + Nuevo contacto | Importar | Exportar -->
              <div class="flex flex-wrap items-center gap-2.5">
                <div class="relative">
                  <svg class="w-4 h-4 text-[#6e7772] absolute left-3.5 top-1/2 -translate-y-1/2" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
                    <circle cx="11" cy="11" r="8"/>
                    <line x1="21" y1="21" x2="16.65" y2="16.65"/>
                  </svg>
                  <input
                    type="text"
                    [value]="crmSearch()"
                    (input)="crmSearch.set($any($event.target).value)"
                    placeholder="Buscar contacto..."
                    class="w-[210px] pl-10 pr-4 py-2 rounded-xl bg-white/[0.03] border border-white/[0.12] text-[13px] font-light text-white placeholder-[#6e7772] focus:outline-none focus:border-emerald-400/50"
                  />
                </div>

                <button
                  type="button"
                  (click)="showNewContactModal.set(true)"
                  class="px-4 py-2 rounded-xl bg-gradient-to-b from-[#2be065] to-[#179e43] text-[#041208] font-semibold text-[13px] shadow-[0_0_20px_rgba(43,224,101,0.35)] hover:brightness-110 transition-all flex items-center gap-1.5"
                >
                  <span class="text-base leading-none">+</span>
                  <span>Nuevo contacto</span>
                </button>

                <button
                  type="button"
                  (click)="simulateImportContacts()"
                  class="px-3.5 py-2 rounded-xl bg-white/[0.03] hover:bg-white/[0.07] border border-white/[0.12] text-[12.5px] font-normal text-white/90 flex items-center gap-1.5 transition-colors"
                >
                  <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                    <polyline points="17 8 12 3 7 8"/>
                    <line x1="12" y1="3" x2="12" y2="15"/>
                  </svg>
                  <span>Importar</span>
                </button>

                <button
                  type="button"
                  (click)="crmDisconnected.set(!crmDisconnected())"
                  class="px-3.5 py-2 rounded-xl bg-white/[0.03] hover:bg-white/[0.07] border border-white/[0.12] text-[12.5px] font-normal text-white/90 flex items-center gap-1.5 transition-colors"
                  title="Conmutar vista con datos o estado sin conexión de la captura 4"
                >
                  <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                    <polyline points="7 10 12 15 17 10"/>
                    <line x1="12" y1="15" x2="12" y2="3"/>
                  </svg>
                  <span>{{ crmDisconnected() ? 'Ver Datos' : 'Estado Vacío' }}</span>
                </button>
              </div>
            </div>

            <!-- Pipeline Stage Pills Row + Tabla / Kanban Switcher (Exact match to Image 4) -->
            <div class="flex flex-wrap items-center justify-between gap-3">
              <!-- Stage Filter Pills -->
              <div class="flex flex-wrap items-center gap-2">
                @for (pill of crmFilterPills(); track pill.key) {
                  <button
                    type="button"
                    (click)="selectedCrmStage.set(pill.key)"
                    class="px-3.5 py-1.5 rounded-full text-[12px] transition-all flex items-center gap-2 border"
                    [class]="selectedCrmStage() === pill.key
                      ? 'bg-[#0f3822] border-[#24d658]/60 text-[#38ef7d] font-semibold shadow-[0_0_15px_rgba(36,214,88,0.2)]'
                      : 'bg-white/[0.02] border-white/[0.1] text-[#8c948f] hover:text-white font-light'"
                  >
                    <span>{{ pill.label }}</span>
                    <span
                      class="px-1.5 py-0.2 rounded-full text-[10.5px]"
                      [class]="selectedCrmStage() === pill.key ? 'bg-[#24d658] text-black font-semibold' : 'bg-white/[0.07] text-[#8c948f]'"
                    >
                      {{ crmDisconnected() ? 0 : pill.count }}
                    </span>
                  </button>
                }
              </div>

              <!-- View Mode Toggle: Tabla | Kanban -->
              <div class="flex items-center p-1 rounded-xl bg-white/[0.03] border border-white/[0.1]">
                <button
                  type="button"
                  (click)="crmViewMode.set('tabla')"
                  class="px-3 py-1.5 rounded-lg text-[12px] transition-all flex items-center gap-1.5"
                  [class]="crmViewMode() === 'tabla' ? 'bg-white/[0.1] text-white font-semibold border border-white/15' : 'text-[#7e8782] hover:text-white font-light'"
                >
                  <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
                    <rect x="3" y="3" width="18" height="18" rx="2"/>
                    <line x1="3" y1="9" x2="21" y2="9"/>
                    <line x1="3" y1="15" x2="21" y2="15"/>
                  </svg>
                  Tabla
                </button>
                <button
                  type="button"
                  (click)="crmViewMode.set('kanban')"
                  class="px-3 py-1.5 rounded-lg text-[12px] transition-all flex items-center gap-1.5"
                  [class]="crmViewMode() === 'kanban' ? 'bg-white/[0.1] text-white font-semibold border border-white/15' : 'text-[#7e8782] hover:text-white font-light'"
                >
                  <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
                    <rect x="3" y="3" width="7" height="18" rx="1"/>
                    <rect x="14" y="3" width="7" height="11" rx="1"/>
                  </svg>
                  Kanban
                </button>
              </div>
            </div>

            <!-- CRM MAIN CONTAINER (Table or Kanban or Empty/Offline Replica of Image 4) -->
            @if (crmViewMode() === 'tabla') {
              <div class="relay-card overflow-hidden flex-1 flex flex-col justify-between min-h-[430px]">
                <!-- Table Header: CLIENTE | ESTADO | SCORE | ACCIONES -->
                <div class="grid grid-cols-12 px-6 py-4 border-b border-white/[0.09] text-[11px] font-semibold tracking-wider uppercase text-[#6e7772]">
                  <div class="col-span-5">CLIENTE</div>
                  <div class="col-span-3">ESTADO</div>
                  <div class="col-span-2">SCORE</div>
                  <div class="col-span-2 text-right">ACCIONES</div>
                </div>

                @if (crmDisconnected() || filteredContacts().length === 0) {
                  <!-- Exact Replica of Image 4 Empty/Disconnected State -->
                  <div class="my-auto py-16 flex flex-col items-center justify-center text-center px-4">
                    <div class="w-12 h-12 rounded-full bg-white/[0.03] border border-white/[0.09] flex items-center justify-center text-[#6e7772] mb-3.5">
                      <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M22.61 16.95A5 5 0 0 0 18 10h-1.26a8 8 0 0 0-7.05-6M5 5a8 8 0 0 0 4 15h9a5 5 0 0 0 1.7-.3"/>
                        <line x1="1" y1="1" x2="23" y2="23"/>
                      </svg>
                    </div>
                    <h3 class="text-[15px] font-semibold text-white">
                      No se pudieron cargar los contactos
                    </h3>
                    <button
                      type="button"
                      (click)="crmDisconnected.set(false); selectedCrmStage.set('Todos'); crmSearch.set('')"
                      class="mt-3.5 px-5 py-2 rounded-xl bg-white/[0.04] hover:bg-emerald-500/15 border border-white/[0.14] hover:border-emerald-500/40 text-[12.5px] font-normal text-white transition-all"
                    >
                      Reintentar
                    </button>
                  </div>
                } @else {
                  <!-- Table Rows -->
                  <div class="divide-y divide-white/[0.06] mb-auto">
                    @for (contact of filteredContacts(); track contact.id) {
                      <div class="grid grid-cols-12 items-center px-6 py-3.5 hover:bg-white/[0.02] transition-colors">
                        <!-- CLIENTE -->
                        <div class="col-span-5 flex items-center gap-3.5 min-w-0 pr-3">
                          <div class="w-9 h-9 rounded-full bg-emerald-500/15 border border-emerald-400/30 flex items-center justify-center text-[12px] font-semibold text-emerald-300 shrink-0">
                            {{ contact.avatarInitials }}
                          </div>
                          <div class="min-w-0">
                            <div class="text-[14px] font-semibold text-white truncate">
                              {{ contact.name }}
                            </div>
                            <div class="text-[12px] font-light text-[#6e7772] truncate">
                              {{ contact.company }} &bull; {{ contact.phone }}
                            </div>
                          </div>
                        </div>

                        <!-- ESTADO -->
                        <div class="col-span-3">
                          <span
                            class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11.5px] font-normal border"
                            [class]="getStageBadgeClasses(contact.stage)"
                          >
                            <span class="w-1.5 h-1.5 rounded-full currentColor"></span>
                            {{ contact.stage }}
                          </span>
                        </div>

                        <!-- SCORE -->
                        <div class="col-span-2 pr-4">
                          <div class="flex items-center gap-2.5">
                            <div class="flex-1 h-1.5 rounded-full bg-white/[0.08] overflow-hidden">
                              <div
                                class="h-full rounded-full bg-gradient-to-r from-emerald-500 to-[#38ef7d]"
                                [style.width.%]="contact.score"
                              ></div>
                            </div>
                            <span class="text-[12.5px] font-semibold text-white w-7 text-right">
                              {{ contact.score }}
                            </span>
                          </div>
                        </div>

                        <!-- ACCIONES -->
                        <div class="col-span-2 flex items-center justify-end gap-2">
                          <button
                            type="button"
                            (click)="openContactChat(contact)"
                            class="px-3 py-1.5 rounded-lg bg-white/[0.04] hover:bg-emerald-500/20 border border-white/10 hover:border-emerald-500/40 text-[11.5px] font-normal text-white/90 hover:text-emerald-300 transition-all"
                          >
                            Abrir Chat
                          </button>
                          <button
                            type="button"
                            (click)="advanceContactStage(contact.id)"
                            title="Avanzar etapa en pipeline"
                            class="w-7 h-7 rounded-lg bg-white/[0.03] hover:bg-white/[0.1] border border-white/10 flex items-center justify-center text-white/70 hover:text-white"
                          >
                            →
                          </button>
                        </div>
                      </div>
                    }
                  </div>
                }

                <div class="px-6 py-3 border-t border-white/[0.08] flex items-center justify-between text-[11.5px] font-light text-[#6e7772]">
                  <span>Mostrando {{ crmDisconnected() ? 0 : filteredContacts().length }} de {{ contacts().length }} contactos en PostgreSQL 17</span>
                  <span>Calificación automática por IA activa</span>
                </div>
              </div>
            } @else {
              <!-- KANBAN VIEW -->
              <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 flex-1">
                @for (colStage of kanbanColumns; track colStage) {
                  <div class="relay-card p-4 flex flex-col justify-between min-h-[410px]">
                    <div>
                      <div class="flex items-center justify-between pb-3 mb-3 border-b border-white/[0.09]">
                        <span class="text-[13.5px] font-semibold text-white">{{ colStage }}</span>
                        <span class="px-2 py-0.5 rounded-full text-[11px] bg-white/[0.06] text-emerald-300">
                          {{ getContactsByStage(colStage).length }}
                        </span>
                      </div>

                      <div class="space-y-3">
                        @for (c of getContactsByStage(colStage); track c.id) {
                          <div class="pending-item-card p-3.5 space-y-2">
                            <div class="flex items-center justify-between">
                              <span class="text-[13.5px] font-semibold text-white">{{ c.name }}</span>
                              <span class="text-[11px] font-semibold text-emerald-400">{{ c.score }} pts</span>
                            </div>
                            <p class="text-[11.5px] font-light text-[#6e7772]">{{ c.company }} &bull; {{ c.phone }}</p>
                            <div class="pt-1 flex items-center justify-between">
                              <span class="text-[10.5px] font-light text-[#8b948e]">Atendido por {{ c.assignedTo }}</span>
                              <button
                                type="button"
                                (click)="openContactChat(c)"
                                class="text-[11px] text-emerald-400 hover:underline font-normal"
                              >
                                Ver chat →
                              </button>
                            </div>
                          </div>
                        }
                      </div>
                    </div>
                  </div>
                }
              </div>
            }

            <!-- Modal: + Nuevo Contacto -->
            @if (showNewContactModal()) {
              <div class="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
                <div class="relay-card w-full max-w-[440px] p-6 space-y-4 border border-emerald-500/35">
                  <div class="flex items-center justify-between">
                    <h3 class="text-[18px] font-semibold text-white">Nuevo contacto CRM</h3>
                    <button
                      type="button"
                      (click)="showNewContactModal.set(false)"
                      class="text-[#6e7772] hover:text-white"
                    >
                      ✕
                    </button>
                  </div>

                  <div class="space-y-3">
                    <div>
                      <label class="block text-[11.5px] font-light text-[#8b948e] mb-1">Nombre completo</label>
                      <input
                        type="text"
                        [value]="newContactName()"
                        (input)="newContactName.set($any($event.target).value)"
                        placeholder="Ej. Valeria Mendoza"
                        class="w-full px-3.5 py-2 rounded-xl bg-black/40 border border-white/15 text-[13px] text-white focus:outline-none focus:border-emerald-400"
                      />
                    </div>
                    <div>
                      <label class="block text-[11.5px] font-light text-[#8b948e] mb-1">Empresa</label>
                      <input
                        type="text"
                        [value]="newContactCompany()"
                        (input)="newContactCompany.set($any($event.target).value)"
                        placeholder="Ej. Inmobiliaria Nova"
                        class="w-full px-3.5 py-2 rounded-xl bg-black/40 border border-white/15 text-[13px] text-white focus:outline-none focus:border-emerald-400"
                      />
                    </div>
                    <div>
                      <label class="block text-[11.5px] font-light text-[#8b948e] mb-1">Teléfono WhatsApp</label>
                      <input
                        type="text"
                        [value]="newContactPhone()"
                        (input)="newContactPhone.set($any($event.target).value)"
                        placeholder="+52 55 8421 9012"
                        class="w-full px-3.5 py-2 rounded-xl bg-black/40 border border-white/15 text-[13px] text-white focus:outline-none focus:border-emerald-400"
                      />
                    </div>
                  </div>

                  <div class="pt-2 flex items-center justify-end gap-2.5">
                    <button
                      type="button"
                      (click)="showNewContactModal.set(false)"
                      class="px-4 py-2 rounded-xl bg-white/[0.04] border border-white/10 text-[12.5px] font-light text-white/80"
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      (click)="createNewContact()"
                      class="px-5 py-2 rounded-xl bg-gradient-to-b from-[#2be065] to-[#179e43] text-black font-semibold text-[12.5px]"
                    >
                      Guardar contacto
                    </button>
                  </div>
                </div>
              </div>
            }
          </div>
        }

        <!-- ========================================================== -->
        <!-- VIEW 4: AI AGENT WORKFLOW CANVAS                           -->
        <!-- ========================================================== -->
        @if (activeView() === 'workflow') {
          <div class="flex-1 flex flex-col justify-between gap-5">
            <div class="relay-card workflow-canvas relative flex-1 min-h-[600px] p-6 md:p-8 flex flex-col justify-between overflow-hidden">
              
              <!-- Top Floating Controls Bar -->
              <div class="flex flex-wrap items-center justify-between gap-4 z-10">
                <div class="flex items-center gap-2.5">
                  <button
                    type="button"
                    (click)="activeView.set('dashboard')"
                    class="workflow-icon-btn"
                    title="Volver al Dashboard"
                  >
                    <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
                      <line x1="19" y1="12" x2="5" y2="12"/>
                      <polyline points="12 19 5 12 12 5"/>
                    </svg>
                  </button>
                  <button type="button" (click)="zoomCanvas(0.05)" class="workflow-icon-btn" title="Acercar">
                    <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
                      <circle cx="11" cy="11" r="8"/>
                      <line x1="21" y1="21" x2="16.65" y2="16.65"/>
                      <line x1="11" y1="8" x2="11" y2="14"/>
                      <line x1="8" y1="11" x2="14" y2="11"/>
                    </svg>
                  </button>
                  <button type="button" (click)="zoomCanvas(-0.05)" class="workflow-icon-btn" title="Alejar">
                    <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
                      <circle cx="11" cy="11" r="8"/>
                      <line x1="21" y1="21" x2="16.65" y2="16.65"/>
                      <line x1="8" y1="11" x2="14" y2="11"/>
                    </svg>
                  </button>
                  <button type="button" (click)="canvasScale.set(1)" class="workflow-icon-btn" title="Restablecer vista">
                    <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
                      <polyline points="1 4 1 10 7 10"/>
                      <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/>
                    </svg>
                  </button>
                </div>

                <div class="flex items-center gap-3">
                  <div class="flex items-center gap-2 p-1.5 rounded-2xl bg-black/50 border border-white/10">
                    <button
                      type="button"
                      (click)="agentActive.set(!agentActive())"
                      class="px-4 py-1.5 rounded-xl text-[13px] font-semibold transition-all"
                      [class]="agentActive() ? 'bg-gradient-to-b from-[#2fd65b] to-[#1aa340] text-white shadow-[0_0_20px_rgba(47,214,91,0.5)]' : 'bg-white/10 text-white/60'"
                    >
                      {{ agentActive() ? 'Active' : 'Paused' }}
                    </button>
                    <div class="w-8 h-8 rounded-xl bg-gradient-to-tr from-emerald-900 to-stone-700 border border-white/20 flex items-center justify-center text-xs font-semibold">
                      EM
                    </div>
                  </div>

                  <div class="flex items-center gap-2 px-4 py-2 rounded-2xl bg-[#141a16]/90 border border-white/10 text-[13px] font-normal text-white/90">
                    <span>Editor</span>
                    <svg class="w-4 h-4 text-white/60" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6">
                      <rect x="3" y="3" width="18" height="18" rx="2"/>
                      <line x1="12" y1="3" x2="12" y2="21"/>
                    </svg>
                  </div>
                </div>
              </div>

              <!-- Interactive Nodes & Glowing Green Bezier Cables -->
              <div
                class="relative my-auto py-8 flex flex-col items-center justify-center transition-transform duration-200"
                [style.transform]="'scale(' + canvasScale() + ')'"
              >
                <div class="relative w-full max-w-[780px] min-h-[430px]">
                  <svg class="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 780 430" fill="none">
                    <defs>
                      <linearGradient id="relayWireGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stop-color="#25d366" stop-opacity="0.95" />
                        <stop offset="100%" stop-color="#199e48" stop-opacity="0.7" />
                      </linearGradient>
                    </defs>

                    <path
                      d="M 210 95 C 310 95, 360 125, 455 125"
                      stroke="url(#relayWireGrad)"
                      stroke-width="2.2"
                      class="drop-shadow-[0_0_8px_rgba(37,211,102,0.7)]"
                    />
                    <rect x="305" y="98" width="46" height="20" rx="6" fill="#0b120e" stroke="rgba(37,211,102,0.35)" />
                    <text x="328" y="112" text-anchor="middle" fill="#a7f3d0" font-size="10" font-weight="400">1 item</text>

                    <path
                      d="M 520 180 C 510 225, 395 215, 385 255"
                      stroke="url(#relayWireGrad)"
                      stroke-width="2.2"
                      class="drop-shadow-[0_0_8px_rgba(37,211,102,0.7)]"
                    />
                    <rect x="425" y="206" width="46" height="20" rx="6" fill="#0b120e" stroke="rgba(37,211,102,0.35)" />
                    <text x="448" y="220" text-anchor="middle" fill="#a7f3d0" font-size="10" font-weight="400">1 item</text>
                  </svg>

                  <!-- NODE 1: When chat message received -->
                  <div class="absolute left-[45px] top-[30px] flex flex-col items-center">
                    <div class="w-[162px] h-[130px] rounded-[24px] bg-[#121915]/90 border border-emerald-400/30 shadow-[inset_0_1px_1px_rgba(255,255,255,0.2),0_0_30px_rgba(34,197,94,0.15)] flex items-center justify-center relative">
                      <span class="absolute top-3 right-3.5 text-emerald-400 text-xs">✓</span>
                      <div class="w-11 h-11 rounded-2xl bg-white/10 flex items-center justify-center text-white">
                        <svg class="w-6 h-6" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-7 9h-2V9h2v2zm4 0h-2V9h2v2zm-8 0H7V9h2v2z"/>
                        </svg>
                      </div>
                      <span class="w-3 h-3 rounded-full bg-[#25d366] shadow-[0_0_10px_#25d366] absolute -right-1.5 top-1/2 -translate-y-1/2"></span>
                    </div>
                    <p class="mt-2.5 text-center text-[13px] font-normal text-white/90 leading-snug">
                      When chat<br/>message received
                    </p>
                  </div>

                  <!-- NODE 2: AI Agent (Tools) -->
                  <div class="absolute left-[455px] top-[62px] flex flex-col items-center">
                    <div class="w-[215px] h-[118px] rounded-[24px] bg-[#121915]/95 border border-emerald-400/35 shadow-[inset_0_1px_1px_rgba(255,255,255,0.2),0_0_30px_rgba(34,197,94,0.18)] px-5 flex items-center gap-4 relative">
                      <span class="w-3 h-3 rounded-full bg-[#25d366] shadow-[0_0_10px_#25d366] absolute -left-1.5 top-1/2 -translate-y-1/2"></span>
                      <div class="w-11 h-11 rounded-2xl bg-emerald-500/15 border border-emerald-400/30 flex items-center justify-center text-emerald-300">
                        <svg class="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
                          <rect x="3" y="11" width="18" height="10" rx="2"/>
                          <circle cx="12" cy="5" r="2"/>
                          <path d="M12 7v4"/>
                        </svg>
                      </div>
                      <div>
                        <div class="text-[15px] font-semibold text-white">AI Agent</div>
                        <div class="text-[12px] font-light text-[#8b948e]">Tools</div>
                      </div>
                      <span class="w-2.5 h-2.5 rotate-45 bg-[#25d366] shadow-[0_0_10px_#25d366] absolute bottom-[-5px] left-[62px]"></span>
                    </div>
                    <div class="w-full flex justify-between px-6 mt-1.5 text-[10.5px] font-light text-[#8b948e]">
                      <span>Chat model</span>
                      <span>Memory</span>
                    </div>
                  </div>

                  <!-- NODE 3: OpenAI Chat Model -->
                  <div class="absolute left-[245px] top-[248px] w-[285px] rounded-[26px] p-5 bg-gradient-to-b from-[#1e5932]/90 to-[#11381f]/95 border border-[#38ef7d]/45 shadow-[inset_0_1px_2px_rgba(255,255,255,0.35),0_18px_40px_rgba(0,0,0,0.75),0_0_35px_rgba(34,197,94,0.25)]">
                    <span class="w-2.5 h-2.5 rotate-45 bg-[#25d366] shadow-[0_0_10px_#25d366] absolute -top-1.5 left-1/2 -translate-x-1/2"></span>

                    <div class="flex items-center justify-between mb-4">
                      <div class="flex items-center gap-3">
                        <div class="w-9 h-9 rounded-full bg-white/10 border border-white/20 flex items-center justify-center">
                          <svg class="w-5 h-5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7">
                            <path d="M12 2a4.5 4.5 0 0 0-3.89 2.25L4.1 11.2a4.5 4.5 0 0 0 0 4.5l4.01 6.95a4.5 4.5 0 0 0 7.78 0l4.01-6.95a4.5 4.5 0 0 0 0-4.5L15.89 4.25A4.5 4.5 0 0 0 12 2Z"/>
                            <circle cx="12" cy="12" r="3"/>
                          </svg>
                        </div>
                        <div>
                          <div class="text-[14px] font-semibold text-white leading-tight">OpenAI Chat</div>
                          <div class="text-[13px] font-normal text-white/85 leading-tight">Model</div>
                        </div>
                      </div>
                      <span class="text-emerald-300 text-xs">✓</span>
                    </div>

                    <div class="space-y-3">
                      <div>
                        <label class="block text-[11px] font-light text-emerald-100/70 mb-1">
                          Credential to connect with
                        </label>
                        <select
                          [value]="selectedCredential()"
                          (change)="selectedCredential.set($any($event.target).value)"
                          class="w-full px-3.5 py-2 rounded-xl bg-black/30 border border-white/15 text-[12.5px] font-normal text-white focus:outline-none focus:border-emerald-300"
                        >
                          <option value="Open AI account 4" class="bg-[#0d1410]">Open AI account 4</option>
                          <option value="Relay Production Key" class="bg-[#0d1410]">Relay Production Key</option>
                        </select>
                      </div>

                      <div>
                        <label class="block text-[11px] font-light text-emerald-100/70 mb-1">
                          Model
                        </label>
                        <select
                          [value]="selectedAiModel()"
                          (change)="selectedAiModel.set($any($event.target).value)"
                          class="w-full px-3.5 py-2 rounded-xl bg-black/30 border border-white/15 text-[12.5px] font-normal text-white focus:outline-none focus:border-emerald-300"
                        >
                          <option value="gpt-4o-mini" class="bg-[#0d1410]">gpt-4o-mini</option>
                          <option value="gpt-4o" class="bg-[#0d1410]">gpt-4o</option>
                          <option value="o3-mini" class="bg-[#0d1410]">o3-mini</option>
                        </select>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <!-- Bottom Floating Dock -->
              <div class="flex items-center justify-between max-w-[460px] mx-auto w-full px-3 py-2 rounded-2xl bg-[#101612]/95 border border-white/12 shadow-[0_12px_30px_rgba(0,0,0,0.8)] z-10">
                <button
                  type="button"
                  (click)="runWorkflowTest()"
                  class="px-3.5 py-1.5 rounded-xl text-[13px] font-normal text-white hover:bg-white/5 transition-colors"
                >
                  Test
                </button>
                <button
                  type="button"
                  (click)="activeView.set('conversaciones')"
                  class="px-3.5 py-1.5 rounded-xl bg-white/[0.06] border border-white/10 text-[13px] font-normal text-white/90"
                >
                  Open CRM Chat
                </button>
                <div class="px-3 py-1.5 rounded-xl bg-[#143d23] border border-emerald-500/30 flex items-center gap-2 text-[12.5px] text-emerald-300">
                  <span>{{ workflowTime() }}</span>
                  <span class="w-4 h-4 rounded-full border border-emerald-400/60 flex items-center justify-center text-[9px]">⏸</span>
                </div>
                <button
                  type="button"
                  (click)="incrementKpi('ai')"
                  class="w-8 h-8 rounded-xl flex items-center justify-center text-white/80 hover:bg-white/10"
                >
                  +
                </button>
              </div>

            </div>
          </div>
        }

        <!-- ========================================================== -->
        <!-- VIEW 5: BACKEND ARCHITECTURE (NestJS 12 + TypeORM + PG 17) -->
        <!-- ========================================================== -->
        @if (activeView() === 'backend') {
          <div class="flex-1 flex flex-col gap-5">
            <div class="relay-card p-6 md:p-8 flex-1 flex flex-col justify-between">
              <div>
                <div class="flex flex-wrap items-center justify-between gap-4 pb-5 border-b border-white/10">
                  <div>
                    <h2 class="text-[22px] font-semibold text-white">
                      Arquitectura Full-Stack Relay CRM
                    </h2>
                    <p class="text-[13px] font-light text-[#8b948e] mt-0.5">
                      Angular 22 (Node &gt;= 22.22) &bull; <code class="text-emerald-400">backend/</code> NestJS 12 + TypeORM &bull; PostgreSQL 17
                    </p>
                  </div>

                  <button
                    type="button"
                    (click)="copyCurrentBackendFile()"
                    class="px-4 py-2 rounded-xl bg-[#1a522d]/80 hover:bg-[#1a522d] border border-emerald-400/40 text-[12.5px] font-normal text-emerald-300 transition-all"
                  >
                    {{ copiedToast() ? '✓ Copiado al portapapeles' : 'Copiar archivo actual' }}
                  </button>
                </div>

                <!-- File Tabs -->
                <div class="flex flex-wrap gap-2 my-5">
                  @for (file of backendFiles; track file.id) {
                    <button
                      type="button"
                      (click)="selectedBackendFileId.set(file.id)"
                      class="px-3.5 py-2 rounded-xl text-[12.5px] transition-all flex items-center gap-2 border"
                      [class]="selectedBackendFileId() === file.id
                        ? 'bg-emerald-950/70 border-emerald-500/40 text-white font-normal'
                        : 'bg-black/30 border-white/10 text-[#8b948e] hover:text-white font-light'"
                    >
                      <span>{{ file.filename }}</span>
                      <span class="text-[10px] px-1.5 py-0.5 rounded bg-white/5 text-emerald-400">{{ file.badge }}</span>
                    </button>
                  }
                </div>

                <!-- Code Block Viewer -->
                <div class="rounded-2xl bg-[#050806] border border-white/10 p-5 overflow-x-auto max-h-[420px]">
                  <div class="text-[11px] font-light text-[#6e7772] mb-2 font-mono">
                    // {{ activeBackendFile().path }}
                  </div>
                  <pre class="text-[12.5px] leading-relaxed font-mono text-emerald-100/90 select-text"><code>{{ activeBackendFile().code }}</code></pre>
                </div>
              </div>

              <div class="pt-5 flex flex-wrap items-center justify-between gap-4 text-[12px] font-light text-[#7e8782]">
                <span>Tipografía activa: <strong class="text-white font-normal">Urbanist</strong> (Light 300, Regular 400, SemiBold 600)</span>
                <button
                  type="button"
                  (click)="activeView.set('dashboard')"
                  class="text-emerald-400 hover:underline font-normal"
                >
                  ← Volver al Dashboard de Emanuel
                </button>
              </div>
            </div>
          </div>
        }

      </main>
    </div>
  `,
  styles: [`
    @import url('https://fonts.googleapis.com/css2?family=Urbanist:wght@300;400;600&display=swap');

    :host {
      display: block;
      font-family: 'Urbanist', -apple-system, BlinkMacSystemFont, sans-serif;
      background-color: #050806;
      color: #ffffff;
      -webkit-font-smoothing: antialiased;
    }

    /* Deep Obsidian Background with Subtle Emerald Atmosphere */
    .relay-viewport {
      background:
        radial-gradient(circle at 12% 88%, rgba(20, 88, 42, 0.24) 0%, rgba(5, 8, 6, 0) 48%),
        radial-gradient(circle at 82% 14%, rgba(22, 90, 44, 0.16) 0%, rgba(5, 8, 6, 0) 42%),
        linear-gradient(180deg, #070b08 0%, #050706 100%);
    }

    .ambient-glow-bottom-left {
      position: absolute;
      bottom: -140px;
      left: -100px;
      width: 520px;
      height: 520px;
      border-radius: 9999px;
      background: radial-gradient(circle, rgba(28, 201, 84, 0.14) 0%, rgba(0, 0, 0, 0) 70%);
      filter: blur(45px);
    }

    .ambient-glow-top-right {
      position: absolute;
      top: -120px;
      right: 10%;
      width: 440px;
      height: 440px;
      border-radius: 9999px;
      background: radial-gradient(circle, rgba(28, 201, 84, 0.09) 0%, rgba(0, 0, 0, 0) 70%);
      filter: blur(50px);
    }

    .ambient-glow-center {
      position: absolute;
      top: 42%;
      left: 38%;
      width: 600px;
      height: 320px;
      border-radius: 9999px;
      background: radial-gradient(circle, rgba(25, 135, 62, 0.06) 0%, rgba(0, 0, 0, 0) 70%);
      filter: blur(60px);
    }

    /* Signature Beveled Dark Glass Card */
    .relay-card {
      background: linear-gradient(165deg, rgba(22, 27, 24, 0.78) 0%, rgba(11, 15, 13, 0.88) 100%);
      backdrop-filter: blur(18px);
      -webkit-backdrop-filter: blur(18px);
      border-radius: 26px;
      border: 1px solid rgba(255, 255, 255, 0.13);
      box-shadow:
        inset 0 1px 1.5px rgba(255, 255, 255, 0.22),
        inset 0 -12px 28px rgba(255, 255, 255, 0.03),
        0 18px 40px -12px rgba(0, 0, 0, 0.78);
    }

    .sidebar-glass {
      border-radius: 28px;
      background:
        radial-gradient(circle at 90% 82%, rgba(28, 168, 75, 0.15) 0%, transparent 55%),
        linear-gradient(180deg, rgba(22, 27, 24, 0.84) 0%, rgba(11, 15, 13, 0.92) 100%);
      box-shadow:
        inset 0 1px 1.5px rgba(255, 255, 255, 0.24),
        inset -1px -10px 25px rgba(34, 197, 94, 0.08),
        0 20px 50px rgba(0, 0, 0, 0.85);
    }

    .kpi-card {
      border-radius: 24px;
      box-shadow:
        inset 0 1px 1.5px rgba(255, 255, 255, 0.22),
        inset 0 -10px 22px rgba(255, 255, 255, 0.045),
        0 14px 30px -10px rgba(0, 0, 0, 0.75);
    }

    .kpi-card-emerald {
      border-radius: 24px;
      background:
        radial-gradient(circle at 85% 85%, rgba(34, 197, 94, 0.16) 0%, transparent 65%),
        linear-gradient(165deg, rgba(22, 28, 24, 0.8) 0%, rgba(11, 16, 13, 0.9) 100%);
      box-shadow:
        inset 0 1px 1.5px rgba(255, 255, 255, 0.22),
        inset 0 -10px 24px rgba(34, 197, 94, 0.09),
        0 14px 30px -10px rgba(0, 0, 0, 0.75);
    }

    /* Sidebar Navigation Pills */
    .nav-pill-active {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      padding: 0.7rem 1rem;
      border-radius: 13px;
      background: linear-gradient(90deg, rgba(22, 72, 39, 0.72) 0%, rgba(27, 88, 48, 0.45) 100%);
      border: 1px solid rgba(52, 211, 102, 0.28);
      color: #36e270;
      box-shadow: inset 0 1px 1px rgba(255, 255, 255, 0.14);
      transition: all 0.2s ease;
    }

    .nav-pill-inactive {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      padding: 0.7rem 1rem;
      border-radius: 13px;
      border: 1px solid transparent;
      color: #7b837e;
      transition: all 0.2s ease;
    }

    .nav-pill-inactive:hover {
      color: #d6dcd8;
      background: rgba(255, 255, 255, 0.03);
    }

    /* Bar Chart Pillars */
    .bar-neon-green {
      background: linear-gradient(180deg, #32eb6b 0%, #17993e 100%);
      box-shadow:
        0 0 22px rgba(42, 224, 100, 0.45),
        inset 0 1px 1px rgba(255, 255, 255, 0.45);
    }

    .bar-muted-glass {
      background: linear-gradient(180deg, rgba(255, 255, 255, 0.16) 0%, rgba(255, 255, 255, 0.02) 100%);
      box-shadow: inset 0 1px 1px rgba(255, 255, 255, 0.14);
    }

    /* Pipelines de Leads Beveled Capsule Rows (Image 2) */
    .glass-pill-row {
      border-radius: 16px;
      background: linear-gradient(180deg, rgba(20, 26, 23, 0.78) 0%, rgba(14, 19, 17, 0.9) 100%);
      border: 1px solid rgba(255, 255, 255, 0.11);
      box-shadow:
        inset 0 1px 1px rgba(255, 255, 255, 0.16),
        0 4px 12px rgba(0, 0, 0, 0.4);
    }

    /* Pendientes Cards (Image 1) */
    .pending-item-card {
      border-radius: 18px;
      background: linear-gradient(180deg, rgba(21, 27, 24, 0.75) 0%, rgba(14, 18, 16, 0.88) 100%);
      border: 1px solid rgba(255, 255, 255, 0.11);
      box-shadow:
        inset 0 1px 1.2px rgba(255, 255, 255, 0.18),
        inset 0 -6px 14px rgba(255, 255, 255, 0.025),
        0 6px 16px rgba(0, 0, 0, 0.45);
    }

    /* Workflow Canvas Dotted Grid */
    .workflow-canvas {
      background-color: #070b08;
      background-image: radial-gradient(rgba(255, 255, 255, 0.12) 1px, transparent 1px);
      background-size: 20px 20px;
    }

    .workflow-icon-btn {
      width: 38px;
      height: 38px;
      border-radius: 12px;
      background: rgba(20, 26, 22, 0.9);
      border: 1px solid rgba(255, 255, 255, 0.1);
      color: rgba(255, 255, 255, 0.8);
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.15s ease;
    }

    .workflow-icon-btn:hover {
      border-color: rgba(52, 211, 102, 0.45);
      color: #ffffff;
    }
  `]
})
export class App {
  // Active View State
  readonly activeView = signal<'dashboard' | 'conversaciones' | 'clientes' | 'workflow' | 'backend'>('dashboard');

  // Header & User State
  readonly userName = signal<string>('Emanuel');
  readonly unreadBell = signal<boolean>(true);

  // 4 Primary KPI Signals
  readonly kpiAiMessages = signal<number>(240);
  readonly kpiNewLeads = signal<number>(130);
  readonly kpiAppointments = signal<number>(13);
  readonly kpiResponseRate = signal<number>(45);

  // Bot Performance Gauge Signal
  readonly botPerformance = signal<number>(25);
  readonly botRingOffset = computed(() => {
    const circumference = 245;
    return circumference - (circumference * this.botPerformance()) / 100;
  });

  // Activity Chart Bars
  readonly activityBars = signal<ActivityBar[]>([
    { day: 'L', value: 19, heightPct: 92, active: true, aiMessages: 148, clientMessages: 92 },
    { day: 'M', value: 11, heightPct: 54, active: false, aiMessages: 86, clientMessages: 54 },
    { day: 'M', value: 13, heightPct: 65, active: false, aiMessages: 104, clientMessages: 61 },
    { day: 'J', value: 15, heightPct: 76, active: false, aiMessages: 118, clientMessages: 70 },
    { day: 'V', value: 20, heightPct: 97, active: false, aiMessages: 162, clientMessages: 88 },
    { day: 'S', value: 10, heightPct: 51, active: false, aiMessages: 74, clientMessages: 42 },
    { day: 'D', value: 8, heightPct: 38, active: false, aiMessages: 52, clientMessages: 31 },
    { day: 'L', value: 14, heightPct: 70, active: false, aiMessages: 110, clientMessages: 64 },
    { day: 'M', value: 19, heightPct: 92, active: false, aiMessages: 144, clientMessages: 89 },
  ]);

  readonly selectedBar = computed(() => {
    return this.activityBars().find((b) => b.active) ?? this.activityBars()[0];
  });

  // IMAGE 1: 5 Pending Items in Right Column
  readonly pendingItems = signal<PendingItem[]>([
    {
      id: 'human',
      title: 'Intervenciones humanas',
      subtitle: 'Clientes esperando atención',
      count: 2,
      theme: 'amber',
      actionView: 'conversaciones',
      filterParam: 'Humano',
    },
    {
      id: 'today',
      title: 'Citas hoy',
      subtitle: 'Pendientes o confirmadas',
      count: 0,
      theme: 'emerald',
      actionView: 'clientes',
    },
    {
      id: 'week',
      title: 'Citas esta semana',
      subtitle: 'Confirmadas y pendientes',
      count: 3,
      theme: 'blue',
      actionView: 'clientes',
    },
    {
      id: 'stock',
      title: 'Stock bajo o agotado',
      subtitle: 'Productos en o bajo su mínimo',
      count: 4,
      theme: 'amber',
      actionView: 'clientes',
    },
    {
      id: 'kb',
      title: 'Base de conocimiento',
      subtitle: 'Añade docs para mejorar IA',
      hasArrow: true,
      theme: 'violet',
      actionView: 'workflow',
    },
  ]);

  // IMAGE 2: 4 Pipelines de Leads Rows
  readonly pipelineRows = signal<PipelineStageRow[]>([
    {
      id: 'nuevos',
      label: 'Nuevos leads',
      count: 48,
      progressPct: 68,
      dotColor: '#3b82f6',
      barColor: '#3b82f6',
      stageKey: 'Nuevos',
    },
    {
      id: 'calificados',
      label: 'Calificados',
      count: 35,
      progressPct: 52,
      dotColor: '#10b981',
      barColor: '#10b981',
      stageKey: 'Calificados',
    },
    {
      id: 'interesados',
      label: 'Interesados',
      count: 28,
      progressPct: 40,
      dotColor: '#f59e0b',
      barColor: '#f59e0b',
      stageKey: 'Interesados',
    },
    {
      id: 'cerrados',
      label: 'Ventas cerradas',
      count: 19,
      progressPct: 28,
      dotColor: '#22c55e',
      barColor: '#22c55e',
      stageKey: 'Cerrados',
    },
  ]);

  // IMAGE 3: Conversaciones CRM State
  readonly conversationsDisconnected = signal<boolean>(false);
  readonly conversationSearch = signal<string>('');
  readonly conversationFilter = signal<'Todos' | 'IA' | 'Humano' | 'No leídos'>('Todos');
  readonly selectedConversationId = signal<string | null>('conv-1');
  readonly draftMessage = signal<string>('');

  readonly conversations = signal<ConversationThread[]>([
    {
      id: 'conv-1',
      contactId: 'c-1',
      contactName: 'Roberto Garza',
      phone: '+52 81 2390 1140',
      mode: 'Humano',
      unreadCount: 2,
      lastMessage: '¿Podemos agendar la demostración técnica hoy a las 4 PM?',
      lastTime: '11:42',
      stage: 'Interesados',
      messages: [
        {
          id: 'm-1',
          sender: 'client',
          text: 'Hola, vi su plataforma Relay para automatizar WhatsApp con IA.',
          time: '11:38',
        },
        {
          id: 'm-2',
          sender: 'ai',
          text: '¡Hola Roberto! Soy el asistente IA de Relay. Calificamos leads en tiempo real y agendamos directo en tu CRM. ¿Cuántos mensajes reciben al día?',
          time: '11:39',
        },
        {
          id: 'm-3',
          sender: 'client',
          text: 'Recibimos unos 350 diarios. ¿Podemos agendar la demostración técnica hoy a las 4 PM?',
          time: '11:42',
        },
      ],
    },
    {
      id: 'conv-2',
      contactId: 'c-2',
      contactName: 'Sofía Villalobos',
      phone: '+52 55 9102 4418',
      mode: 'IA',
      unreadCount: 1,
      lastMessage: 'Perfecto, ya quedó confirmada tu cita para el jueves.',
      lastTime: '10:55',
      stage: 'Calificados',
      messages: [
        {
          id: 'm-21',
          sender: 'client',
          text: 'Me interesa integrar el bot con nuestro PostgreSQL.',
          time: '10:52',
        },
        {
          id: 'm-22',
          sender: 'ai',
          text: 'Perfecto, ya quedó confirmada tu cita para el jueves a las 11:00 AM con el equipo de ingeniería.',
          time: '10:55',
        },
      ],
    },
    {
      id: 'conv-3',
      contactId: 'c-3',
      contactName: 'Andrés Domínguez',
      phone: '+57 310 489 2201',
      mode: 'Humano',
      unreadCount: 0,
      lastMessage: 'Solicito factura corporativa para el plan anual.',
      lastTime: 'Ayer',
      stage: 'Negociación',
      messages: [
        {
          id: 'm-31',
          sender: 'client',
          text: 'Solicito factura corporativa para el plan anual.',
          time: 'Ayer',
        },
        {
          id: 'm-32',
          sender: 'human',
          text: 'Claro Andrés, te envío los datos fiscales por este medio.',
          time: 'Ayer',
        },
      ],
    },
    {
      id: 'conv-4',
      contactId: 'c-4',
      contactName: 'Mariana Costa',
      phone: '+54 9 11 5021 8834',
      mode: 'IA',
      unreadCount: 0,
      lastMessage: 'Catálogo PDF enviado automáticamente por el Agente.',
      lastTime: 'Ayer',
      stage: 'Nuevos',
      messages: [
        {
          id: 'm-41',
          sender: 'client',
          text: 'Hola, ¿me compartes precios de los paquetes?',
          time: 'Ayer',
        },
        {
          id: 'm-42',
          sender: 'ai',
          text: 'Catálogo PDF enviado automáticamente por el Agente.',
          time: 'Ayer',
        },
      ],
    },
  ]);

  readonly totalUnreadConversations = computed(() =>
    this.conversations().reduce((acc, c) => acc + c.unreadCount, 0)
  );

  readonly filteredConversations = computed(() => {
    const q = this.conversationSearch().toLowerCase().trim();
    const filter = this.conversationFilter();

    return this.conversations().filter((c) => {
      const matchesQuery =
        !q || c.contactName.toLowerCase().includes(q) || c.phone.toLowerCase().includes(q);
      if (!matchesQuery) return false;

      if (filter === 'IA') return c.mode === 'IA';
      if (filter === 'Humano') return c.mode === 'Humano';
      if (filter === 'No leídos') return c.unreadCount > 0;
      return true;
    });
  });

  readonly selectedConversation = computed(() => {
    const id = this.selectedConversationId();
    if (!id) return null;
    return this.conversations().find((c) => c.id === id) ?? null;
  });

  // IMAGE 4: CRM de Clientes State
  readonly crmDisconnected = signal<boolean>(false);
  readonly crmSearch = signal<string>('');
  readonly selectedCrmStage = signal<'Todos' | LeadStage>('Todos');
  readonly crmViewMode = signal<'tabla' | 'kanban'>('tabla');
  readonly showNewContactModal = signal<boolean>(false);
  readonly newContactName = signal<string>('');
  readonly newContactCompany = signal<string>('');
  readonly newContactPhone = signal<string>('');

  readonly kanbanColumns: LeadStage[] = ['Nuevos', 'Calificados', 'Interesados', 'Cerrados'];

  readonly contacts = signal<CrmContact[]>([
    {
      id: 'c-1',
      name: 'Roberto Garza',
      phone: '+52 81 2390 1140',
      email: 'rgarza@grupoaltamira.mx',
      company: 'Grupo Altamira',
      stage: 'Interesados',
      score: 92,
      lastActive: 'Hace 4 min',
      assignedTo: 'Humano',
      avatarInitials: 'RG',
    },
    {
      id: 'c-2',
      name: 'Sofía Villalobos',
      phone: '+52 55 9102 4418',
      email: 'sofia@fintechlatam.io',
      company: 'Fintech Latam',
      stage: 'Calificados',
      score: 86,
      lastActive: 'Hace 32 min',
      assignedTo: 'IA',
      avatarInitials: 'SV',
    },
    {
      id: 'c-3',
      name: 'Andrés Domínguez',
      phone: '+57 310 489 2201',
      email: 'andres@logisticaandina.co',
      company: 'Logística Andina',
      stage: 'Negociación',
      score: 95,
      lastActive: 'Hace 2 h',
      assignedTo: 'Humano',
      avatarInitials: 'AD',
    },
    {
      id: 'c-4',
      name: 'Mariana Costa',
      phone: '+54 9 11 5021 8834',
      email: 'mcosta@studiocosta.ar',
      company: 'Studio Costa',
      stage: 'Nuevos',
      score: 68,
      lastActive: 'Hace 5 h',
      assignedTo: 'IA',
      avatarInitials: 'MC',
    },
    {
      id: 'c-5',
      name: 'Diego Salvatierra',
      phone: '+56 9 7412 8900',
      email: 'dsalvatierra@acmecorp.cl',
      company: 'Acme Corp Chile',
      stage: 'Cerrados',
      score: 99,
      lastActive: 'Ayer',
      assignedTo: 'IA',
      avatarInitials: 'DS',
    },
    {
      id: 'c-6',
      name: 'Lucía Fernández',
      phone: '+34 612 889 104',
      email: 'lucia@iberiaventures.es',
      company: 'Iberia Ventures',
      stage: 'Contactados',
      score: 74,
      lastActive: 'Ayer',
      assignedTo: 'IA',
      avatarInitials: 'LF',
    },
  ]);

  readonly crmFilterPills = computed(() => {
    const all = this.contacts();
    const countBy = (stage: LeadStage) => all.filter((c) => c.stage === stage).length;
    return [
      { key: 'Todos' as const, label: 'Todos', count: all.length },
      { key: 'Nuevos' as const, label: 'Nuevos', count: countBy('Nuevos') },
      { key: 'Contactados' as const, label: 'Contactados', count: countBy('Contactados') },
      { key: 'Calificados' as const, label: 'Calificados', count: countBy('Calificados') },
      { key: 'Interesados' as const, label: 'Interesados', count: countBy('Interesados') },
      { key: 'Negociación' as const, label: 'Negociación', count: countBy('Negociación') },
      { key: 'Cerrados' as const, label: 'Cerrados', count: countBy('Cerrados') },
      { key: 'Perdidos' as const, label: 'Perdidos', count: countBy('Perdidos') },
    ];
  });

  readonly filteredContacts = computed(() => {
    const q = this.crmSearch().toLowerCase().trim();
    const stage = this.selectedCrmStage();

    return this.contacts().filter((c) => {
      const matchesStage = stage === 'Todos' || c.stage === stage;
      const matchesQuery =
        !q ||
        c.name.toLowerCase().includes(q) ||
        c.company.toLowerCase().includes(q) ||
        c.phone.toLowerCase().includes(q);
      return matchesStage && matchesQuery;
    });
  });

  // Workflow Editor State
  readonly agentActive = signal<boolean>(true);
  readonly canvasScale = signal<number>(1);
  readonly selectedCredential = signal<string>('Open AI account 4');
  readonly selectedAiModel = signal<string>('gpt-4o-mini');
  readonly workflowTime = signal<string>('11:44');

  // Backend Code Viewer State
  readonly selectedBackendFileId = signal<string>('crm-entity');
  readonly copiedToast = signal<boolean>(false);

  readonly backendFiles: BackendFile[] = [
    {
      id: 'crm-entity',
      filename: 'crm-lead.entity.ts',
      path: 'backend/src/crm/entities/crm-lead.entity.ts',
      badge: 'TypeORM + PG 17',
      code: `import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, OneToMany } from 'typeorm';
import { ConversationMessageEntity } from './conversation-message.entity';

export type LeadStage =
  | 'Nuevos'
  | 'Contactados'
  | 'Calificados'
  | 'Interesados'
  | 'Negociación'
  | 'Cerrados'
  | 'Perdidos';

@Entity({ name: 'crm_leads' })
export class CrmLeadEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 120 })
  name!: string;

  @Column({ type: 'varchar', length: 40, unique: true })
  phone!: string;

  @Column({ type: 'varchar', length: 120, nullable: true })
  company!: string;

  @Column({ type: 'varchar', length: 32, default: 'Nuevos' })
  stage!: LeadStage;

  @Column({ type: 'int', default: 50 })
  score!: number;

  @Column({ type: 'varchar', length: 16, default: 'IA' })
  assignedMode!: 'IA' | 'Humano';

  @OneToMany(() => ConversationMessageEntity, (msg) => msg.lead, { cascade: true })
  messages!: ConversationMessageEntity[];

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;
}`
    },
    {
      id: 'package',
      filename: 'package.json',
      path: 'relay-monorepo/package.json',
      badge: 'Node >= 22.22',
      code: `{
  "name": "relay-saas-platform",
  "version": "22.0.0",
  "private": true,
  "engines": {
    "node": ">=22.22.0",
    "npm": ">=10.9.0"
  },
  "workspaces": [
    "frontend",
    "backend"
  ],
  "dependencies": {
    "@angular/common": "^22.0.0",
    "@angular/core": "^22.0.0",
    "@angular/platform-browser": "^22.0.0",
    "@angular/router": "^22.0.0",
    "@nestjs/common": "^12.0.0",
    "@nestjs/core": "^12.0.0",
    "@nestjs/platform-express": "^12.0.0",
    "@nestjs/typeorm": "^11.0.0",
    "pg": "^8.14.0",
    "typeorm": "^0.3.21",
    "rxjs": "~7.8.2"
  }
}`
    },
    {
      id: 'docker',
      filename: 'docker-compose.yml',
      path: 'relay-monorepo/docker-compose.yml',
      badge: 'PostgreSQL 17',
      code: `services:
  postgres17:
    image: postgres:17-alpine
    container_name: relay_postgres_17
    restart: unless-stopped
    environment:
      POSTGRES_USER: relay_admin
      POSTGRES_PASSWORD: relay_secret_2026
      POSTGRES_DB: relay_saas_db
    ports:
      - "5432:5432"
    volumes:
      - pg17_data:/var/lib/postgresql/data

volumes:
  pg17_data:`
    }
  ];

  readonly activeBackendFile = computed(() => {
    return this.backendFiles.find((f) => f.id === this.selectedBackendFileId()) ?? this.backendFiles[0];
  });

  // Helper for Pendientes square icon colors (Image 1)
  getPendingIconClasses(theme: PendingItem['theme']): string {
    switch (theme) {
      case 'amber':
        return 'bg-amber-500/[0.12] border-amber-500/35 text-amber-400 shadow-[inset_0_1px_1px_rgba(251,191,36,0.25)]';
      case 'emerald':
        return 'bg-emerald-500/[0.12] border-emerald-500/35 text-emerald-400 shadow-[inset_0_1px_1px_rgba(16,185,129,0.25)]';
      case 'blue':
        return 'bg-blue-500/[0.12] border-blue-500/35 text-blue-400 shadow-[inset_0_1px_1px_rgba(59,130,246,0.25)]';
      case 'violet':
        return 'bg-violet-500/[0.12] border-violet-500/35 text-violet-400 shadow-[inset_0_1px_1px_rgba(139,92,246,0.25)]';
    }
  }

  getStageBadgeClasses(stage: LeadStage): string {
    switch (stage) {
      case 'Nuevos':
        return 'bg-blue-500/15 border-blue-500/35 text-blue-300';
      case 'Calificados':
        return 'bg-emerald-500/15 border-emerald-500/35 text-emerald-300';
      case 'Interesados':
        return 'bg-amber-500/15 border-amber-500/35 text-amber-300';
      case 'Cerrados':
        return 'bg-[#22c55e]/20 border-[#22c55e]/45 text-[#38ef7d]';
      case 'Negociación':
        return 'bg-violet-500/15 border-violet-500/35 text-violet-300';
      default:
        return 'bg-white/10 border-white/20 text-white/80';
    }
  }

  openPendingItem(item: PendingItem): void {
    this.activeView.set(item.actionView);
    if (item.actionView === 'conversaciones' && item.filterParam === 'Humano') {
      this.conversationsDisconnected.set(false);
      this.conversationFilter.set('Humano');
    }
  }

  navigateToStage(stage: LeadStage): void {
    this.crmDisconnected.set(false);
    this.selectedCrmStage.set(stage);
    this.activeView.set('clientes');
  }

  selectBar(index: number): void {
    this.activityBars.update((bars) =>
      bars.map((bar, i) => ({
        ...bar,
        active: i === index,
      }))
    );
  }

  incrementKpi(type: 'ai' | 'leads' | 'appointments' | 'rate'): void {
    if (type === 'ai') {
      this.kpiAiMessages.update((v) => v + 1);
    } else if (type === 'leads') {
      this.kpiNewLeads.update((v) => v + 1);
    } else if (type === 'appointments') {
      this.kpiAppointments.update((v) => v + 1);
    } else if (type === 'rate') {
      this.kpiResponseRate.update((v) => (v >= 95 ? 45 : v + 5));
    }
  }

  cycleBotPerformance(): void {
    const steps = [25, 48, 72, 90];
    const currentIdx = steps.indexOf(this.botPerformance());
    const nextIdx = (currentIdx + 1) % steps.length;
    this.botPerformance.set(steps[nextIdx]);
  }

  // Conversaciones CRM Methods
  enableEmptyConversationState(): void {
    this.conversationsDisconnected.set(true);
    this.selectedConversationId.set(null);
  }

  reconnectConversations(): void {
    this.conversationsDisconnected.set(false);
    this.selectedConversationId.set('conv-1');
  }

  selectConversation(id: string): void {
    this.selectedConversationId.set(id);
    this.conversations.update((list) =>
      list.map((c) => (c.id === id ? { ...c, unreadCount: 0 } : c))
    );
  }

  toggleConversationMode(id: string): void {
    this.conversations.update((list) =>
      list.map((c) =>
        c.id === id ? { ...c, mode: c.mode === 'IA' ? 'Humano' : 'IA' } : c
      )
    );
  }

  sendChatMessage(): void {
    const text = this.draftMessage().trim();
    const current = this.selectedConversation();
    if (!text || !current) return;

    const senderType: ChatMessage['sender'] = current.mode === 'IA' ? 'ai' : 'human';
    const newMsg: ChatMessage = {
      id: 'msg-' + Date.now(),
      sender: senderType,
      text,
      time: 'Ahora',
    };

    this.conversations.update((list) =>
      list.map((c) =>
        c.id === current.id
          ? {
              ...c,
              lastMessage: text,
              lastTime: 'Ahora',
              messages: [...c.messages, newMsg],
            }
          : c
      )
    );

    this.draftMessage.set('');
    this.kpiAiMessages.update((v) => v + 1);
  }

  // Clientes CRM Methods
  getContactsByStage(stage: LeadStage): CrmContact[] {
    return this.filteredContacts().filter((c) => c.stage === stage);
  }

  openContactChat(contact: CrmContact): void {
    const existing = this.conversations().find((c) => c.contactId === contact.id);
    this.conversationsDisconnected.set(false);
    if (existing) {
      this.selectedConversationId.set(existing.id);
    } else {
      const newConvId = 'conv-' + Date.now();
      const created: ConversationThread = {
        id: newConvId,
        contactId: contact.id,
        contactName: contact.name,
        phone: contact.phone,
        mode: contact.assignedTo,
        unreadCount: 0,
        lastMessage: 'Conversación iniciada desde CRM de clientes',
        lastTime: 'Ahora',
        stage: contact.stage,
        messages: [
          {
            id: 'm-init',
            sender: 'ai',
            text: `Hola ${contact.name}, te escribimos de Relay respecto a ${contact.company}.`,
            time: 'Ahora',
          },
        ],
      };
      this.conversations.update((list) => [created, ...list]);
      this.selectedConversationId.set(newConvId);
    }
    this.activeView.set('conversaciones');
  }

  advanceContactStage(id: string): void {
    const order: LeadStage[] = [
      'Nuevos',
      'Contactados',
      'Calificados',
      'Interesados',
      'Negociación',
      'Cerrados',
    ];
    this.contacts.update((list) =>
      list.map((c) => {
        if (c.id !== id) return c;
        const idx = order.indexOf(c.stage);
        const nextStage = order[(idx + 1) % order.length];
        return { ...c, stage: nextStage, score: Math.min(100, c.score + 4) };
      })
    );
  }

  createNewContact(): void {
    const name = this.newContactName().trim();
    if (!name) return;
    const company = this.newContactCompany().trim() || 'Empresa CRM';
    const phone = this.newContactPhone().trim() || '+52 55 1029 3847';
    const initials = name
      .split(' ')
      .map((p) => p[0])
      .join('')
      .slice(0, 2)
      .toUpperCase();

    const created: CrmContact = {
      id: 'c-' + Date.now(),
      name,
      company,
      phone,
      email: `${name.toLowerCase().replace(/\s+/g, '.')}@empresa.com`,
      stage: 'Nuevos',
      score: 78,
      lastActive: 'Ahora',
      assignedTo: 'IA',
      avatarInitials: initials,
    };

    this.contacts.update((list) => [created, ...list]);
    this.crmDisconnected.set(false);
    this.showNewContactModal.set(false);
    this.newContactName.set('');
    this.newContactCompany.set('');
    this.newContactPhone.set('');
  }

  simulateImportContacts(): void {
    this.crmDisconnected.set(false);
    this.kpiNewLeads.update((v) => v + 5);
  }

  toggleRealtimePulse(): void {
    this.unreadBell.set(false);
    this.kpiAiMessages.update((v) => v + 4);
    this.kpiNewLeads.update((v) => v + 2);
  }

  zoomCanvas(delta: number): void {
    this.canvasScale.update((s) => Math.min(1.15, Math.max(0.85, +(s + delta).toFixed(2))));
  }

  runWorkflowTest(): void {
    this.kpiAiMessages.update((v) => v + 1);
    this.workflowTime.set('11:45');
  }

  copyCurrentBackendFile(): void {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(this.activeBackendFile().code);
    }
    this.copiedToast.set(true);
    setTimeout(() => this.copiedToast.set(false), 2000);
  }

  resetDemo(): void {
    this.activeView.set('dashboard');
    this.kpiAiMessages.set(240);
    this.kpiNewLeads.set(130);
    this.kpiAppointments.set(13);
    this.kpiResponseRate.set(45);
    this.botPerformance.set(25);
    this.conversationsDisconnected.set(false);
    this.crmDisconnected.set(false);
    this.selectBar(0);
  }
}