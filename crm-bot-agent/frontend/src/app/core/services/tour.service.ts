import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { driver, Driver, DriveStep } from 'driver.js';
import { environment } from '../../../environments/environment';
import { AuthService } from './auth.service';

interface TourStatus { tourStatus: 'completed' | 'skipped' | null; needsTour: boolean }

/**
 * Tour de bienvenida (driver.js). El estado vive en la base de datos (users.tourStatus / needsTour),
 * así que vale entre dispositivos. Se abre solo la primera vez; "Ver tour" lo repite.
 */
@Injectable({ providedIn: 'root' })
export class TourService {
  private http = inject(HttpClient);
  private auth = inject(AuthService);
  private active: Driver | null = null;

  private readonly steps: DriveStep[] = [
    { popover: { title: '¡Bienvenido a tu CRM!', description: 'En menos de un minuto te mostramos cómo funciona: tu agente de IA atiende por WhatsApp, y tú gestionas clientes, citas y ventas desde aquí.' } },
    { element: '[data-tour="nav-/dashboard"]', popover: { title: 'Dashboard', description: 'El resumen del día: mensajes atendidos por la IA, nuevos leads, citas y el estado de tu pipeline.', side: 'right' } },
    { element: '[data-tour="nav-/conversations"]', popover: { title: 'Conversaciones', description: 'Chats de WhatsApp en tiempo real. La IA responde sola; puedes tomar el control, pausarla o reanudarla cuando quieras.', side: 'right' } },
    { element: '[data-tour="nav-/crm"]', popover: { title: 'Clientes', description: 'Tu pipeline de ventas en tablero: arrastra cada cliente entre etapas, añade etiquetas e importa o exporta tu base en CSV.', side: 'right' } },
    { element: '[data-tour="nav-/agenda"]', popover: { title: 'Agenda', description: 'Las citas que agenda la IA o tu equipo, con recordatorios automáticos por WhatsApp 24 h y 2 h antes.', side: 'right' } },
    { element: '[data-tour="nav-/productos"]', popover: { title: 'Productos e inventario', description: 'Tu catálogo con precios en USD y Bs (tasa BCV), stock, movimientos y alertas de stock bajo. La IA no ofrece lo que está agotado.', side: 'right' } },
    { element: '[data-tour="nav-/configuracion/whatsapp"]', popover: { title: 'Conecta WhatsApp', description: 'Pega tu Phone Number ID y token de Meta, y registra la URL del webhook. Sin esto no llegan mensajes reales.', side: 'right' } },
    { element: '[data-tour="nav-/ai-config"]', popover: { title: 'Agente IA', description: 'Define su personalidad, preguntas frecuentes, restricciones, horario de atención y cuándo derivar a una persona. Puedes probarlo ahí mismo.', side: 'right' } },
    { element: '[data-tour="nav-/funnel"]', popover: { title: 'Funnel y automatizaciones', description: 'Los pasos que sigue el agente para vender y reglas automáticas: seguimientos por inactividad, mover de etapa al agendar, etc.', side: 'right' } },
    { element: '[data-tour="search"]', popover: { title: 'Búsqueda', description: 'Encuentra un cliente por nombre, teléfono o email desde cualquier pantalla.', side: 'bottom' } },
    { element: '[data-tour="notifications"]', popover: { title: 'Notificaciones', description: 'Te avisamos cuando un cliente pide hablar con una persona, se agenda una cita o un producto se queda sin stock.', side: 'bottom' } },
    { element: '[data-tour="tour-btn"]', popover: { title: '¿Quieres verlo otra vez?', description: 'Pulsa este botón cuando quieras repetir el tour. ¡Mucho éxito con tus ventas!', side: 'bottom' } },
  ];

  /** Consulta a la BD si esta cuenta aún debe ver el tour y, si es así, lo abre. */
  maybeStart(beforeStart?: () => void) {
    if (!this.auth.isAuthenticated() || this.active) return;
    this.http.get<TourStatus>(`${environment.apiUrl}/auth/me`).subscribe({
      next: me => {
        this.auth.patchUser({ tourStatus: me.tourStatus, needsTour: me.needsTour });
        if (me.needsTour) { beforeStart?.(); setTimeout(() => this.start(), 150); }
      },
      error: () => { /* sin red o sesión caducada: no molestar */ },
    });
  }

  /** Abre el tour. Los pasos cuyo elemento no está visible (p. ej. menú oculto) se omiten. */
  start() {
    this.stop();
    const visible = (sel: string) => { const el = document.querySelector<HTMLElement>(sel); return !!el && el.offsetParent !== null; };
    const steps = this.steps.filter(s => !s.element || visible(s.element as string));
    if (steps.length < 2) return;

    let finished = false;
    const d = driver({
      steps,
      showProgress: true,
      progressText: '{{current}} de {{total}}',
      nextBtnText: 'Siguiente →',
      prevBtnText: '← Anterior',
      doneBtnText: 'Finalizar',
      showButtons: ['next', 'previous', 'close'],
      allowClose: true,
      overlayColor: '#02040a',
      overlayOpacity: 0.78,
      stagePadding: 6,
      stageRadius: 10,
      popoverClass: 'relay-tour',
      onPopoverRender: (popover) => {
        if (d.isFirstStep()) popover.previousButton.style.display = 'none';
        // "Omitir" visible en todos los pasos menos el último (ahí ya está "Finalizar").
        if (d.isLastStep()) return;
        const skip = document.createElement('button');
        skip.type = 'button';
        skip.className = 'relay-tour-skip';
        skip.textContent = 'Omitir';
        skip.addEventListener('click', () => d.destroy());
        popover.footerButtons.prepend(skip);
      },
      onNextClick: () => { if (d.isLastStep()) { finished = true; d.destroy(); } else d.moveNext(); },
      onDestroyed: () => { this.active = null; this.save(finished ? 'completed' : 'skipped'); },
    });
    this.active = d;
    d.drive();
  }

  stop() {
    const d = this.active;
    this.active = null;
    if (d?.isActive()) d.destroy();
  }

  private save(status: 'completed' | 'skipped') {
    this.auth.patchUser({ tourStatus: status, needsTour: false });
    this.http.put<TourStatus>(`${environment.apiUrl}/v1/onboarding/tour`, { status }).subscribe({ error: () => {} });
  }
}
