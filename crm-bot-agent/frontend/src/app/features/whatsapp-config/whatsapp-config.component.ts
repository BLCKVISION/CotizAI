import { Component, OnInit, AfterViewInit, OnDestroy, ElementRef, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { gsap } from 'gsap';
import { ApiService } from '../../core/services/api.service';
import { UiService } from '../../core/ui/ui.service';
import { errMsg } from '../../core/ui/errors';

interface WaStatus {
  connected: boolean;
  displayPhone: string | null;
  phoneNumber?: string | null;
  phoneNumberId: string | null;
  wabaId?: string | null;
  webhookUrl: string;
  verifyToken: string | null;
  qualityRating?: string | null;
}

@Component({
  selector: 'app-whatsapp-config',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './whatsapp-config.component.html',
  styleUrls: ['./whatsapp-config.component.scss'],
})
export class WhatsappConfigComponent implements OnInit, AfterViewInit, OnDestroy {
  private el = inject(ElementRef);
  private ctx?: gsap.Context;
  private api = inject(ApiService);
  private ui = inject(UiService);

  status = signal<WaStatus | null>(null);
  loadError = signal(false);
  busy = signal(false);
  error = signal('');
  showForm = signal(false);
  copied = signal('');

  // El token solo vive en este formulario mientras se envía: nunca se guarda ni se vuelve a mostrar.
  phoneNumberId = '';
  wabaId = '';
  accessToken = '';

  ngOnInit() {
    this.load();
  }

  ngAfterViewInit() {
    this.ctx = gsap.context(() => {
      this.animateEntrance();
    }, this.el.nativeElement);
  }

  animateEntrance() {
    const tl = gsap.timeline({ defaults: { ease: 'power2.out' } });

    tl.from('.onboarding-header', {
      y: 16,
      autoAlpha: 0,
      duration: 0.45,
      clearProps: 'all',
    }, 0);

    tl.from('.main-cta-card', {
      y: 22,
      autoAlpha: 0,
      duration: 0.5,
      clearProps: 'all',
    }, 0.08);

    tl.from('.step-guide-card', {
      y: 20,
      autoAlpha: 0,
      duration: 0.5,
      stagger: 0.08,
      clearProps: 'all',
    }, 0.14);

    tl.from('.guide-step', {
      x: 16,
      autoAlpha: 0,
      duration: 0.4,
      stagger: 0.05,
      ease: 'power2.out',
      clearProps: 'all',
    }, 0.24);

    tl.from('.trust-badge', {
      scale: 0.92,
      autoAlpha: 0,
      duration: 0.35,
      stagger: 0.04,
      clearProps: 'all',
    }, 0.3);
  }

  ngOnDestroy() {
    this.ctx?.revert();
  }

  load() {
    this.api.getWhatsappStatus().subscribe({
      next: (s) => {
        this.status.set(s);
        this.loadError.set(false);
        this.showForm.set(!s.connected);
        setTimeout(() => {
          this.ctx?.add(() => {
            gsap.from('.conn-details > div, .manual-form .form-group', {
              y: 8,
              autoAlpha: 0,
              duration: 0.3,
              stagger: 0.04,
              ease: 'power2.out',
              clearProps: 'all',
            });
          });
        }, 40);
      },
      error: () => this.loadError.set(true),
    });
  }

  connect() {
    const id = this.phoneNumberId.trim(), token = this.accessToken.trim();
    if (!/^\d{5,30}$/.test(id)) {
      this.error.set('El Phone Number ID es numérico (lo ves en Meta → WhatsApp → Configuración de la API).');
      return;
    }
    if (token.length < 20) {
      this.error.set('El token de acceso parece incompleto. Pega el token permanente completo.');
      return;
    }
    if (this.wabaId.trim() && !/^\d{5,30}$/.test(this.wabaId.trim())) {
      this.error.set('El WABA ID es numérico.');
      return;
    }
    this.busy.set(true);
    this.error.set('');
    this.api.connectWhatsapp(id, token, this.wabaId.trim() || undefined).subscribe({
      next: () => {
        this.busy.set(false);
        this.accessToken = '';
        this.phoneNumberId = '';
        this.wabaId = '';
        this.ui.success('Credenciales verificadas con Meta. WhatsApp conectado.');
        this.load();
      },
      error: (e) => {
        this.busy.set(false);
        this.accessToken = '';
        this.error.set(errMsg(e, 'No se pudo conectar con Meta'));
      },
    });
  }

  async disconnect() {
    if (!(await this.ui.confirm('El agente dejará de recibir y enviar mensajes por WhatsApp hasta que vuelvas a conectar.', { title: 'Desconectar WhatsApp', confirmLabel: 'Desconectar' }))) return;
    this.api.disconnectWhatsapp().subscribe({
      next: () => {
        this.ui.success('WhatsApp desconectado');
        this.load();
      },
      error: (e) => this.ui.error(errMsg(e))
    });
  }

  async rotate() {
    if (!(await this.ui.confirm('Se generará un token de verificación nuevo. Debes actualizarlo también en el panel de Meta o dejarás de recibir mensajes.', { title: 'Rotar token de verificación', confirmLabel: 'Rotar token' }))) return;
    this.api.rotateWhatsappToken().subscribe({
      next: (r) => {
        this.status.update((s) => (s ? { ...s, verifyToken: r.verifyToken, webhookUrl: r.webhookUrl ?? s.webhookUrl } : s));
        this.ui.success('Token rotado. Actualízalo en Meta.');
      },
      error: (e) => this.ui.error(errMsg(e)),
    });
  }

  copy(text: string | null, key: string) {
    if (!text) return;
    navigator.clipboard?.writeText(text).then(() => {
      this.copied.set(key);
      setTimeout(() => this.copied.set(''), 1800);
    }, () => this.ui.error('No se pudo copiar'));
  }
}
