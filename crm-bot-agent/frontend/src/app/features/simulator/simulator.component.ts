import { Component, OnInit, inject, signal, computed, ElementRef, ViewChild, AfterViewChecked } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { ThemeService } from '../../core/services/theme.service';
import { SoundService } from '../../core/services/sound.service';

export interface SimulatorMessage {
  id: string;
  sender: 'client' | 'bot' | 'agent' | 'system';
  type: 'text' | 'voice_note' | 'payment_receipt' | 'catalog_card';
  text?: string;
  voiceNote?: {
    duration: string;
    transcription: string;
  };
  receipt?: {
    bank: string;
    reference: string;
    amount: string;
    currency: string;
    status: 'VALIDADO' | 'REVISION';
  };
  time: string;
  status: 'sent' | 'delivered' | 'read';
}

@Component({
  selector: 'app-simulator',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './simulator.component.html',
  styleUrls: ['./simulator.component.scss']
})
export class SimulatorComponent implements OnInit, AfterViewChecked {
  @ViewChild('chatScroll') private chatScrollContainer!: ElementRef;

  public themeService = inject(ThemeService);
  public sound = inject(SoundService);
  private route = inject(ActivatedRoute);

  companyName = signal<string>('Boutique Caracas');
  botName = signal<string>('Sofía IA');
  isHumanMode = signal<boolean>(false);
  inputText = '';
  isTyping = signal<boolean>(false);
  shareToastVisible = signal<boolean>(false);

  isLight = computed(() => this.themeService.currentTheme() === 'light');

  messages = signal<SimulatorMessage[]>([
    {
      id: 'm1',
      sender: 'bot',
      type: 'text',
      text: '¡Hola! 👋 Bienvenido a Boutique Caracas. Soy Sofía, tu asistente de compras en WhatsApp. ¿En qué podemos ayudarte hoy?',
      time: '10:00 AM',
      status: 'read'
    }
  ]);

  ngOnInit() {
    this.route.queryParams.subscribe(params => {
      if (params['empresa']) {
        this.companyName.set(params['empresa']);
      }
      if (params['bot']) {
        this.botName.set(params['bot']);
      }
    });
  }

  ngAfterViewChecked() {
    this.scrollToBottom();
  }

  private scrollToBottom(): void {
    try {
      if (this.chatScrollContainer) {
        this.chatScrollContainer.nativeElement.scrollTop = this.chatScrollContainer.nativeElement.scrollHeight;
      }
    } catch (_) { }
  }

  getCurrentTime(): string {
    const now = new Date();
    return now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  // 1. Enviar mensaje de texto libre
  sendTextMessage() {
    const text = this.inputText.trim();
    if (!text) return;

    this.inputText = '';
    const userMsg: SimulatorMessage = {
      id: `u_${Date.now()}`,
      sender: 'client',
      type: 'text',
      text,
      time: this.getCurrentTime(),
      status: 'read'
    };

    this.messages.update(msgs => [...msgs, userMsg]);
    this.processBotResponse(text);
  }

  // 2. Simular envío de Nota de Voz
  sendSimulatedVoiceNote() {
    const userMsg: SimulatorMessage = {
      id: `u_${Date.now()}`,
      sender: 'client',
      type: 'voice_note',
      voiceNote: {
        duration: '0:07',
        transcription: 'Hola buenas tardes, quisiera saber el precio de los zapatos deportivos y si tienen talla 41 disponible para entrega en Caracas.'
      },
      time: this.getCurrentTime(),
      status: 'read'
    };

    this.messages.update(msgs => [...msgs, userMsg]);

    this.isTyping.set(true);
    setTimeout(() => {
      this.isTyping.set(false);
      const botReply: SimulatorMessage = {
        id: `b_${Date.now()}`,
        sender: 'bot',
        type: 'text',
        text: '¡Hola! He escuchado tu nota de voz 🎧. Sí, disponemos de las Zapatillas Deportivas en talla 41 para entrega hoy mismo en Caracas. El precio es de $45. ¿Deseas apartarlas con Pago Móvil o Zelle?',
        time: this.getCurrentTime(),
        status: 'read'
      };
      this.messages.update(msgs => [...msgs, botReply]);
      this.sound.playNewMessage();
    }, 1500);
  }

  // 3. Simular envío de Comprobante de Pago
  sendSimulatedPaymentReceipt() {
    const userMsg: SimulatorMessage = {
      id: `u_${Date.now()}`,
      sender: 'client',
      type: 'payment_receipt',
      text: 'Listo amigo, ya te transferí por Pago Móvil los 45$',
      receipt: {
        bank: 'Banesco Banco Universal',
        reference: '04918234',
        amount: '1,890.00',
        currency: 'VES ($45.00)',
        status: 'VALIDADO'
      },
      time: this.getCurrentTime(),
      status: 'read'
    };

    this.messages.update(msgs => [...msgs, userMsg]);

    this.isTyping.set(true);
    setTimeout(() => {
      this.isTyping.set(false);
      this.sound.playPaymentVerified(); // Tono de cobro exitoso
      const botReply: SimulatorMessage = {
        id: `b_${Date.now()}`,
        sender: 'bot',
        type: 'text',
        text: '✅ ¡Comprobante de Pago Verificado! Hemos validado con éxito la referencia Banesco 04918234 por $45. Tu pedido #8821 ha sido confirmado y está en preparación para entrega inmediata. ¡Muchas gracias por tu compra!',
        time: this.getCurrentTime(),
        status: 'read'
      };
      this.messages.update(msgs => [...msgs, botReply]);
    }, 1600);
  }

  // 4. Simular solicitud de Asesor Humano
  requestHumanAgent() {
    const userMsg: SimulatorMessage = {
      id: `u_${Date.now()}`,
      sender: 'client',
      type: 'text',
      text: 'Hola, me gustaría hablar con un asesor humano para acordar un descuento especial por 3 pares.',
      time: this.getCurrentTime(),
      status: 'read'
    };

    this.messages.update(msgs => [...msgs, userMsg]);
    this.sound.playHumanAlert(); // Alerta urgente sonora

    this.isTyping.set(true);
    setTimeout(() => {
      this.isTyping.set(false);
      this.isHumanMode.set(true);

      const noticeMsg: SimulatorMessage = {
        id: `sys_${Date.now()}`,
        sender: 'system',
        type: 'text',
        text: '🔔 Solicitud de intervención humana recibida. Notificando al equipo de ventas de guardia...',
        time: this.getCurrentTime(),
        status: 'read'
      };

      const agentReply: SimulatorMessage = {
        id: `ag_${Date.now()}`,
        sender: 'agent',
        type: 'text',
        text: '¡Hola! Te atiende Albert del equipo de ventas. Por llevar los 3 pares te podemos obsequiar un 15% de descuento adicional en el total. ¿A qué zona de Caracas sería el envío?',
        time: this.getCurrentTime(),
        status: 'read'
      };

      this.messages.update(msgs => [...msgs, noticeMsg, agentReply]);
      this.sound.playNewMessage();
    }, 1600);
  }

  // Respuesta inteligente del bot a textos libres
  private processBotResponse(text: string) {
    this.isTyping.set(true);
    const lower = text.toLowerCase();

    setTimeout(() => {
      this.isTyping.set(false);
      let replyText = '';

      if (lower.includes('catalogo') || lower.includes('precio') || lower.includes('zapatos') || lower.includes('productos')) {
        replyText = 'Te comparto nuestros modelos más vendidos hoy:\n1. 👟 Runner Pro Carbon ($45)\n2. 👟 Air Flex Classic ($38)\n3. 👟 Street Urban ($50)\n\n¿Cuál de ellos te gustaría apartar?';
      } else if (lower.includes('pago') || lower.includes('cuenta') || lower.includes('datos')) {
        replyText = 'Aceptamos Pago Móvil (Banesco / BDV a tasa BCV), Zelle, Binance Pay y Efectivo contra entrega en Caracas. ¿Cuál método prefieres para enviarte los datos?';
      } else if (lower.includes('humano') || lower.includes('persona')) {
        this.requestHumanAgent();
        return;
      } else {
        replyText = `Entendido. Con gusto te ayudamos con tu solicitud en ${this.companyName()}. ¿Deseas ver el catálogo o prefieres que un asesor te asista directamente?`;
      }

      const botReply: SimulatorMessage = {
        id: `b_${Date.now()}`,
        sender: this.isHumanMode() ? 'agent' : 'bot',
        type: 'text',
        text: replyText,
        time: this.getCurrentTime(),
        status: 'read'
      };

      this.messages.update(msgs => [...msgs, botReply]);
      this.sound.playNewMessage();
    }, 1200);
  }

  // Compartir simulación interactiva
  copyShareableLink() {
    const url = window.location.href;
    if (navigator.clipboard) {
      navigator.clipboard.writeText(url).then(() => {
        this.shareToastVisible.set(true);
        setTimeout(() => this.shareToastVisible.set(false), 3000);
      });
    }
  }

  resetChat() {
    this.isHumanMode.set(false);
    this.messages.set([
      {
        id: 'm1',
        sender: 'bot',
        type: 'text',
        text: `¡Hola! 👋 Bienvenido a ${this.companyName()}. Soy ${this.botName()}, tu asistente de ventas en WhatsApp. ¿En qué podemos ayudarte hoy?`,
        time: this.getCurrentTime(),
        status: 'read'
      }
    ]);
  }
}

