import { Injectable, signal } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class SoundService {
  private ctx: AudioContext | null = null;
  public isMuted = signal<boolean>(false);

  constructor() {
    if (typeof window !== 'undefined') {
      try {
        const stored = localStorage.getItem('relay_sound_muted');
        this.isMuted.set(stored === 'true');
      } catch (_) { }
    }
  }

  public toggleMute(): boolean {
    const next = !this.isMuted();
    this.isMuted.set(next);
    try {
      localStorage.setItem('relay_sound_muted', String(next));
    } catch (_) { }
    return next;
  }

  private getAudioContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => { });
    }
    return this.ctx;
  }

  /**
   * Dispara un sonido por nombre ('pop', 'success', 'alert')
   */
  public play(kind: 'pop' | 'success' | 'alert' = 'pop') {
    if (kind === 'success') {
      this.playPaymentVerified();
    } else if (kind === 'alert') {
      this.playHumanAlert();
    } else {
      this.playNewMessage();
    }
  }

  /**
   * Chime suave doble para mensaje nuevo entrante
   */
  public playNewMessage() {
    if (this.isMuted()) return;
    const ctx = this.getAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    this.playTone(ctx, 587.33, now, 0.08, 0.15); // D5
    this.playTone(ctx, 880.00, now + 0.09, 0.12, 0.18); // A5
  }

  /**
   * Alerta de atención urgente cuando un cliente pide asesor o negociación
   */
  public playHumanAlert() {
    if (this.isMuted()) return;
    const ctx = this.getAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    this.playTone(ctx, 440.00, now, 0.10, 0.22); // A4
    this.playTone(ctx, 659.25, now + 0.11, 0.10, 0.22); // E5
    this.playTone(ctx, 880.00, now + 0.22, 0.18, 0.25); // A5
  }

  /**
   * Tono triunfal de cobro / comprobante de pago validado
   */
  public playPaymentVerified() {
    if (this.isMuted()) return;
    const ctx = this.getAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    this.playTone(ctx, 523.25, now, 0.08, 0.18); // C5
    this.playTone(ctx, 659.25, now + 0.09, 0.08, 0.20); // E5
    this.playTone(ctx, 783.99, now + 0.18, 0.08, 0.22); // G5
    this.playTone(ctx, 1046.50, now + 0.27, 0.24, 0.25); // C6
  }

  private playTone(ctx: AudioContext, freq: number, startTime: number, duration: number, volume: number) {
    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, startTime);

      gain.gain.setValueAtTime(0.001, startTime);
      gain.gain.exponentialRampToValueAtTime(volume, startTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(startTime);
      osc.stop(startTime + duration + 0.05);
    } catch (_) { }
  }
}

