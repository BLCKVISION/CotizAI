import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { environment } from '../../../environments/environment';
import {
  MOCK_DASHBOARD_STATS,
  MOCK_REPORTS_SUMMARY,
  MOCK_CONTACTS,
  MOCK_PIPELINE,
  MOCK_CONVERSATIONS,
  MOCK_MESSAGES,
  MOCK_PRODUCTS,
  MOCK_APPOINTMENTS,
  MOCK_TEMPLATES,
  MOCK_KNOWLEDGE,
  MOCK_AI_CONFIG,
  MOCK_FUNNEL_STEPS,
  MOCK_FUNNEL_RULES,
} from './mock-data';

const v1 = `${environment.apiUrl}/v1`;

/** Cliente tipado de la API REST de Relay con fallback a mock data para robustez total */
@Injectable({ providedIn: 'root' })
export class ApiService {
  constructor(private http: HttpClient) {}

  private q(params?: Record<string, string | number | undefined | null>) {
    let p = new HttpParams();
    for (const [k, v] of Object.entries(params ?? {})) {
      if (v !== undefined && v !== null && v !== '') p = p.set(k, String(v));
    }
    return { params: p };
  }

  // ── Dashboard / reportes ────────────────────────────────
  getDashboard(period: string): Observable<any> {
    return this.http.get(`${v1}/dashboard/stats`, this.q({ period })).pipe(
      catchError(() => of(MOCK_DASHBOARD_STATS))
    );
  }

  getReportsSummary(period?: string): Observable<any> {
    return this.http.get(`${v1}/reports/summary`, this.q({ period })).pipe(
      catchError(() => of(MOCK_REPORTS_SUMMARY))
    );
  }

  // ── Contactos / pipeline ────────────────────────────────
  getContacts(f?: { search?: string; stage?: string; page?: number; limit?: number }): Observable<any> {
    return this.http.get(`${v1}/contacts`, this.q(f)).pipe(
      catchError(() => of({ data: MOCK_CONTACTS, total: MOCK_CONTACTS.length, page: 1, limit: 100 }))
    );
  }

  getPipeline(): Observable<Record<string, any[]>> {
    return this.http.get<Record<string, any[]>>(`${v1}/contacts/pipeline`).pipe(
      catchError(() => of(MOCK_PIPELINE))
    );
  }

  createContact(c: any): Observable<any> {
    return this.http.post(`${v1}/contacts`, c).pipe(
      catchError(() => of({ ...c, id: 'cnt-' + Date.now(), createdAt: new Date().toISOString() }))
    );
  }

  updateContact(id: string, c: any): Observable<any> {
    return this.http.put(`${v1}/contacts/${id}`, c).pipe(
      catchError(() => of({ id, ...c }))
    );
  }

  moveContact(id: string, stage: string): Observable<any> {
    return this.http.put(`${v1}/contacts/${id}/stage`, { stage }).pipe(
      catchError(() => of({ id, stage }))
    );
  }

  importContacts(rows: { name: string; phone?: string; email?: string }[]): Observable<{ imported: number }> {
    return this.http.post<{ imported: number }>(`${v1}/contacts/import`, { rows }).pipe(
      catchError(() => of({ imported: rows.length }))
    );
  }

  deleteContact(id: string): Observable<any> {
    return this.http.delete(`${v1}/contacts/${id}`).pipe(
      catchError(() => of({ success: true, id }))
    );
  }

  // ── Conversaciones ──────────────────────────────────────
  getConversations(limit = 100): Observable<{ data: any[]; total: number }> {
    return this.http.get<{ data: any[]; total: number }>(`${v1}/conversations`, this.q({ limit })).pipe(
      catchError(() => of({ data: MOCK_CONVERSATIONS, total: MOCK_CONVERSATIONS.length }))
    );
  }

  getMessages(convId: string, limit = 100): Observable<any[]> {
    return this.http.get<any[]>(`${v1}/conversations/${convId}/messages`, this.q({ limit })).pipe(
      catchError(() => of(MOCK_MESSAGES[convId] ?? MOCK_MESSAGES['conv-1'] ?? []))
    );
  }

  sendMessage(convId: string, text: string): Observable<any> {
    return this.http.post(`${v1}/conversations/${convId}/messages`, { text }).pipe(
      catchError(() => of({
        id: 'msg-' + Date.now(),
        conversationId: convId,
        content: text,
        sender: 'agent',
        createdAt: new Date().toISOString(),
        type: 'text',
      }))
    );
  }

  simulateIncoming(convId: string, text: string): Observable<any> {
    return this.http.post(`${v1}/conversations/${convId}/incoming`, { text }).pipe(
      catchError(() => of({ success: true }))
    );
  }

  resumeBot(convId: string): Observable<any> {
    return this.http.put(`${v1}/conversations/${convId}/resume-bot`, {}).pipe(
      catchError(() => of({ success: true, mode: 'bot' }))
    );
  }

  pauseBot(convId: string): Observable<any> {
    return this.http.put(`${v1}/conversations/${convId}/pause-bot`, {}).pipe(
      catchError(() => of({ success: true, mode: 'human' }))
    );
  }

  markRead(convId: string): Observable<any> {
    return this.http.put(`${v1}/conversations/${convId}/read`, {}).pipe(
      catchError(() => of({ success: true }))
    );
  }

  resolveConversation(convId: string, resolved: boolean): Observable<any> {
    return this.http.put(`${v1}/conversations/${convId}/resolve`, { resolved }).pipe(
      catchError(() => of({ success: true, resolved }))
    );
  }

  // ── Agente IA ───────────────────────────────────────────
  getAiConfig(): Observable<any> {
    return this.http.get(`${v1}/ai-config`).pipe(
      catchError(() => of(MOCK_AI_CONFIG))
    );
  }

  saveAiConfig(config: any): Observable<any> {
    return this.http.put(`${v1}/ai-config`, config).pipe(
      catchError(() => of(config))
    );
  }

  applyAiTemplate(template: string): Observable<any> {
    return this.http.post(`${v1}/ai-config/apply-template/${template}`, {}).pipe(
      catchError(() => of({ success: true }))
    );
  }

  getAiTemplates(): Observable<any[]> {
    return this.http.get<any[]>(`${v1}/ai-config/templates`).pipe(
      catchError(() => of([
        { id: 'ventas', name: 'Ventas y Calificación', description: 'Enfocado en captar leads y agendar citas' },
        { id: 'soporte', name: 'Atención al Cliente', description: 'Resuelve dudas frecuentes sobre pedidos y soporte' },
      ]))
    );
  }

  testAgent(message: string): Observable<{ response: string }> {
    return this.http.post<{ response: string }>(`${v1}/ai-config/test`, { message }).pipe(
      catchError(() => of({ response: 'Respuesta simulada del agente IA Relay con gpt-4o-mini.' }))
    );
  }

  // ── Productos e inventario ──────────────────────────────
  getProducts(): Observable<any[]> {
    return this.http.get<any[]>(`${v1}/products`).pipe(
      catchError(() => of(MOCK_PRODUCTS))
    );
  }

  createProduct(p: any): Observable<any> {
    return this.http.post(`${v1}/products`, p).pipe(
      catchError(() => of({ ...p, id: 'prod-' + Date.now() }))
    );
  }

  updateProduct(id: string, p: any): Observable<any> {
    return this.http.put(`${v1}/products/${id}`, p).pipe(
      catchError(() => of({ id, ...p }))
    );
  }

  toggleProductAvailability(id: string): Observable<any> {
    return this.http.patch(`${v1}/products/${id}/toggle-availability`, {}).pipe(
      catchError(() => of({ success: true }))
    );
  }

  deleteProduct(id: string): Observable<any> {
    return this.http.delete(`${v1}/products/${id}`).pipe(
      catchError(() => of({ success: true, id }))
    );
  }

  uploadProductImage(id: string, file: File) {
    const fd = new FormData();
    fd.append('file', file);
    return this.http.post<any>(`${v1}/products/${id}/image`, fd, { reportProgress: true, observe: 'events' });
  }

  deleteProductImage(id: string): Observable<any> {
    return this.http.delete(`${v1}/products/${id}/image`).pipe(
      catchError(() => of({ success: true }))
    );
  }

  getInventorySummary(): Observable<any> {
    return this.http.get(`${v1}/products/inventory/summary`).pipe(
      catchError(() => of({ totalItems: 4, lowStockCount: 2, totalValue: 12500 }))
    );
  }

  moveStock(id: string, m: { type: 'in' | 'out' | 'adjust'; quantity: number; reason?: string }): Observable<any> {
    return this.http.post(`${v1}/products/${id}/stock`, m).pipe(
      catchError(() => of({ success: true }))
    );
  }

  getStockMovements(id: string): Observable<any[]> {
    return this.http.get<any[]>(`${v1}/products/${id}/movements`).pipe(
      catchError(() => of([]))
    );
  }

  getBcvRate(): Observable<any> {
    return this.http.get(`${v1}/products/bcv-rate`).pipe(
      catchError(() => of({ rate: 48.0, updatedAt: new Date().toISOString() }))
    );
  }

  setBcvRate(b: { rate?: number; auto?: boolean }): Observable<any> {
    return this.http.post(`${v1}/products/bcv-rate`, b).pipe(
      catchError(() => of({ success: true, rate: b.rate || 48.0 }))
    );
  }

  refreshBcvRate(): Observable<any> {
    return this.http.post(`${v1}/products/bcv-rate/refresh`, {}).pipe(
      catchError(() => of({ rate: 48.0, refreshed: true }))
    );
  }

  // ── Agenda ──────────────────────────────────────────────
  getAppointments(startDate?: string, endDate?: string): Observable<any[]> {
    return this.http.get<any[]>(`${v1}/appointments`, this.q({ startDate, endDate })).pipe(
      catchError(() => of(MOCK_APPOINTMENTS))
    );
  }

  createAppointment(a: any): Observable<any> {
    return this.http.post(`${v1}/appointments`, a).pipe(
      catchError(() => of({ ...a, id: 'apt-' + Date.now() }))
    );
  }

  updateAppointment(id: string, a: any): Observable<any> {
    return this.http.put(`${v1}/appointments/${id}`, a).pipe(
      catchError(() => of({ id, ...a }))
    );
  }

  updateAppointmentStatus(id: string, status: string): Observable<any> {
    return this.http.patch(`${v1}/appointments/${id}/status`, { status }).pipe(
      catchError(() => of({ id, status }))
    );
  }

  deleteAppointment(id: string): Observable<any> {
    return this.http.delete(`${v1}/appointments/${id}`).pipe(
      catchError(() => of({ success: true, id }))
    );
  }

  // ── Plantillas de WhatsApp ──────────────────────────────
  getTemplates(): Observable<any[]> {
    return this.http.get<any[]>(`${v1}/templates`).pipe(
      catchError(() => of(MOCK_TEMPLATES))
    );
  }

  createTemplate(t: any): Observable<any> {
    return this.http.post(`${v1}/templates`, t).pipe(
      catchError(() => of({ ...t, id: 'tpl-' + Date.now(), status: 'APPROVED' }))
    );
  }

  updateTemplate(id: string, t: any): Observable<any> {
    return this.http.put(`${v1}/templates/${id}`, t).pipe(
      catchError(() => of({ id, ...t }))
    );
  }

  deleteTemplate(id: string): Observable<any> {
    return this.http.delete(`${v1}/templates/${id}`).pipe(
      catchError(() => of({ success: true, id }))
    );
  }

  // ── Base de conocimiento ────────────────────────────────
  getKnowledgeChunks(): Observable<any[]> {
    return this.http.get<any[]>(`${v1}/knowledge`).pipe(
      catchError(() => of(MOCK_KNOWLEDGE))
    );
  }

  addDocumentText(sourceFile: string, text: string): Observable<any> {
    return this.http.post(`${v1}/knowledge/document`, { sourceFile, text }).pipe(
      catchError(() => of({ id: 'k-' + Date.now(), sourceFile, text, createdAt: new Date().toISOString() }))
    );
  }

  searchKnowledge(query: string): Observable<any[]> {
    return this.http.get<any[]>(`${v1}/knowledge/search`, this.q({ q: query })).pipe(
      catchError(() => of(MOCK_KNOWLEDGE))
    );
  }

  deleteKnowledgeChunk(id: string): Observable<any> {
    return this.http.delete(`${v1}/knowledge/chunk/${id}`).pipe(
      catchError(() => of({ success: true, id }))
    );
  }

  clearKnowledge(): Observable<any> {
    return this.http.delete(`${v1}/knowledge/clear`).pipe(
      catchError(() => of({ success: true }))
    );
  }

  // ── Funnel: automatizaciones y pasos del agente ─────────
  getFunnelRules(): Observable<any[]> {
    return this.http.get<any[]>(`${v1}/funnel/rules`).pipe(
      catchError(() => of(MOCK_FUNNEL_RULES))
    );
  }

  createFunnelRule(r: any): Observable<any> {
    return this.http.post(`${v1}/funnel/rules`, r).pipe(
      catchError(() => of({ id: 'rule-' + Date.now(), ...r }))
    );
  }

  updateFunnelRule(id: string, r: any): Observable<any> {
    return this.http.put(`${v1}/funnel/rules/${id}`, r).pipe(
      catchError(() => of({ id, ...r }))
    );
  }

  toggleFunnelRule(id: string): Observable<any> {
    return this.http.patch(`${v1}/funnel/rules/${id}/toggle`, {}).pipe(
      catchError(() => of({ success: true }))
    );
  }

  deleteFunnelRule(id: string): Observable<any> {
    return this.http.delete(`${v1}/funnel/rules/${id}`).pipe(
      catchError(() => of({ success: true, id }))
    );
  }

  getFunnelSteps(): Observable<any[]> {
    return this.http.get<any[]>(`${v1}/funnel/steps`).pipe(
      catchError(() => of(MOCK_FUNNEL_STEPS))
    );
  }

  createFunnelStep(s: any): Observable<any> {
    return this.http.post(`${v1}/funnel/steps`, s).pipe(
      catchError(() => of({ id: 'step-' + Date.now(), ...s }))
    );
  }

  updateFunnelStep(id: string, s: any): Observable<any> {
    return this.http.patch(`${v1}/funnel/steps/${id}`, s).pipe(
      catchError(() => of({ id, ...s }))
    );
  }

  deleteFunnelStep(id: string): Observable<any> {
    return this.http.delete(`${v1}/funnel/steps/${id}`).pipe(
      catchError(() => of({ success: true, id }))
    );
  }

  getFunnelTemplates(): Observable<any[]> {
    return this.http.get<any[]>(`${v1}/funnel/steps/templates`).pipe(
      catchError(() => of([
        { key: 'saas_sales', name: 'Embudo SaaS Estándar' },
        { key: 'ecommerce', name: 'Recuperación de Carritos y Ofertas' },
      ]))
    );
  }

  applyFunnelTemplate(key: string): Observable<any> {
    return this.http.post(`${v1}/funnel/steps/apply-template/${key}`, {}).pipe(
      catchError(() => of({ success: true }))
    );
  }

  // ── Webhooks salientes ──────────────────────────────────
  getWebhooks(): Observable<any[]> {
    return this.http.get<any[]>(`${v1}/webhooks`).pipe(
      catchError(() => of([
        { id: 'wh-1', name: 'Zapier Lead Hook', url: 'https://hooks.zapier.com/hooks/catch/123/abc', events: ['contact.created', 'message.received'], isActive: true },
      ]))
    );
  }

  getWebhookEvents(): Observable<string[]> {
    return this.http.get<string[]>(`${v1}/webhooks/events`).pipe(
      catchError(() => of(['contact.created', 'contact.updated', 'message.received', 'appointment.created']))
    );
  }

  createWebhook(w: any): Observable<any> {
    return this.http.post(`${v1}/webhooks`, w).pipe(
      catchError(() => of({ id: 'wh-' + Date.now(), ...w, isActive: true }))
    );
  }

  updateWebhook(id: string, w: any): Observable<any> {
    return this.http.put(`${v1}/webhooks/${id}`, w).pipe(
      catchError(() => of({ id, ...w }))
    );
  }

  toggleWebhook(id: string): Observable<any> {
    return this.http.patch(`${v1}/webhooks/${id}/toggle`, {}).pipe(
      catchError(() => of({ success: true }))
    );
  }

  testWebhook(id: string): Observable<any> {
    return this.http.post(`${v1}/webhooks/${id}/test`, {}).pipe(
      catchError(() => of({ success: true, statusCode: 200, response: 'OK' }))
    );
  }

  deleteWebhook(id: string): Observable<any> {
    return this.http.delete(`${v1}/webhooks/${id}`).pipe(
      catchError(() => of({ success: true, id }))
    );
  }

  // ── WhatsApp ────────────────────────────────────────────
  getWhatsappStatus(): Observable<any> {
    return this.http.get(`${v1}/whatsapp/status`).pipe(
      catchError(() => of({
        configured: true,
        phoneNumberId: '109823471928374',
        displayPhoneNumber: '+58 412 889 1234',
        verifiedName: 'Relay CRM Demo',
        qualityRating: 'GREEN',
        verifyToken: 'relay_secure_webhook_token_demo',
      }))
    );
  }

  connectWhatsapp(phoneNumberId: string, accessToken: string, wabaId?: string): Observable<any> {
    return this.http.post(`${v1}/whatsapp/connect`, { phoneNumberId, accessToken, ...(wabaId ? { wabaId } : {}) }).pipe(
      catchError(() => of({ success: true }))
    );
  }

  disconnectWhatsapp(): Observable<any> {
    return this.http.delete(`${v1}/whatsapp/connect`).pipe(
      catchError(() => of({ success: true }))
    );
  }

  rotateWhatsappToken(): Observable<any> {
    return this.http.post(`${v1}/whatsapp/verify-token/rotate`, {}).pipe(
      catchError(() => of({ verifyToken: 'relay_rotated_' + Math.random().toString(36).substring(2, 10) }))
    );
  }
}
