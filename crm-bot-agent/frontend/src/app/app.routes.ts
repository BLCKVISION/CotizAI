import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';

export const routes: Routes = [
  {
    path: 'login', redirectTo: 'auth/login', pathMatch: 'full' },
  {
    path: 'simulador',
    loadComponent: () =>
      import('./features/simulator/simulator.component').then((m) => m.SimulatorComponent),
  },
  {
    path: 'auth',
    loadChildren: () =>
      import('./features/auth/auth.routes').then((m) => m.AUTH_ROUTES),
  },
  {
    path: '',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./layout/shell/shell.component').then((m) => m.ShellComponent),
    children: [
      { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
      {
        path: 'dashboard',
        loadComponent: () =>
          import('./features/dashboard/dashboard.component').then((m) => m.DashboardComponent),
      },
      {
        path: 'conversations',
        loadComponent: () =>
          import('./features/conversations/conversations.component').then((m) => m.ConversationsComponent),
      },
      {
        path: 'crm',
        loadComponent: () =>
          import('./features/crm/crm.component').then((m) => m.CrmComponent),
      },
      {
        path: 'ai-config',
        loadComponent: () =>
          import('./features/ai-config/ai-config.component').then((m) => m.AiConfigComponent),
      },
      {
        path: 'agenda',
        loadComponent: () =>
          import('./features/agenda/agenda.component').then((m) => m.AgendaComponent),
      },
      {
        path: 'plantillas',
        loadComponent: () =>
          import('./features/plantillas/plantillas.component').then((m) => m.PlantillasComponent),
      },
      {
        path: 'equipo',
        loadComponent: () =>
          import('./features/team/team.component').then((m) => m.TeamComponent),
      },
      { path: 'agentes', redirectTo: 'equipo', pathMatch: 'full' },
      {
        path: 'productos',
        loadComponent: () =>
          import('./features/productos/productos.component').then((m) => m.ProductosComponent),
      },
      {
        path: 'reportes',
        loadComponent: () =>
          import('./features/reportes/reportes.component').then((m) => m.ReportesComponent),
      },
      {
        path: 'conocimiento',
        loadComponent: () =>
          import('./features/conocimiento/conocimiento.component').then((m) => m.ConocimientoComponent),
      },
      {
        path: 'funnel',
        loadComponent: () =>
          import('./features/funnel/funnel.component').then((m) => m.FunnelComponent),
      },
      {
        path: 'webhooks',
        loadComponent: () =>
          import('./features/webhooks/webhooks.component').then((m) => m.WebhooksComponent),
      },
      {
        path: 'configuracion/whatsapp',
        loadComponent: () =>
          import('./features/whatsapp-config/whatsapp-config.component').then((m) => m.WhatsappConfigComponent),
      },
      { path: 'clientes', redirectTo: 'crm', pathMatch: 'full' },
      { path: 'whatsapp', redirectTo: 'configuracion/whatsapp', pathMatch: 'full' },
    ],
  },
  { path: '**', redirectTo: 'dashboard' },
];
