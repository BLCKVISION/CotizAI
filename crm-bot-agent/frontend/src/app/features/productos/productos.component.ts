import { Component, HostListener, OnDestroy, OnInit, AfterViewInit, ElementRef, computed, inject, signal } from '@angular/core';
import { gsap } from 'gsap';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpEventType } from '@angular/common/http';
import { Subscription, debounceTime, firstValueFrom } from 'rxjs';
import { ApiService } from '../../core/services/api.service';
import { RealtimeService } from '../../core/services/realtime.service';
import { UiService } from '../../core/ui/ui.service';
import { errMsg } from '../../core/ui/errors';
import { IMAGE_MAX_BYTES, IMAGE_TYPES, mediaUrl, readAsDataUrl, sniffImage } from '../../core/media';

type StockFilter = 'all' | 'low' | 'out' | 'untracked';
type SortKey = 'sold' | 'profit' | 'demand' | 'name' | 'stock';
type ViewMode = 'grid' | 'list';
const VIEW_KEY = 'relay_products_view';
const DEMAND_LABEL: Record<string, string> = { high: 'Alta', medium: 'Media', low: 'Baja', none: 'Sin movimiento' };
interface ProductForm { id?: string; name: string; sku: string; category: string; description: string; price: number | null; cost: number | null; trackStock: boolean; stock: number; minStock: number; isAvailable: boolean }
interface MoveForm { product: any; type: 'in' | 'out' | 'adjust'; quantity: number | null; reason: string }
const blank = (): ProductForm => ({ name: '', sku: '', category: '', description: '', price: null, cost: null, trackStock: true, stock: 0, minStock: 0, isAvailable: true });
const TYPE_LABEL = { in: 'Entrada', out: 'Salida', adjust: 'Ajuste' } as const;

@Component({
  selector: 'app-productos',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './productos.component.html',
  styleUrls: ['./productos.component.scss'],
})
export class ProductosComponent implements OnInit, AfterViewInit, OnDestroy {
  private el = inject(ElementRef);
  private ctx?: gsap.Context;
  private api = inject(ApiService);
  private ui = inject(UiService);
  private realtime = inject(RealtimeService);
  private sub?: Subscription;

  products = signal<any[]>([]);
  summary = signal<any | null>(null);
  loading = signal(true);
  loadError = signal(false);
  bcv = signal<{ rate: number | null; auto: boolean; updatedAt: string | null }>({ rate: null, auto: false, updatedAt: null });
  bcvRate = computed(() => this.bcv().rate);
  searchTerm = signal('');
  stockFilter = signal<StockFilter>('all');

  view = signal<ViewMode>(this.loadView());
  sortBy = signal<SortKey>('sold');
  /** URLs de imagen que fallaron al cargar (se muestra el placeholder) y las ya cargadas (quita el esqueleto). */
  imgFailed = signal<Set<string>>(new Set());
  imgLoaded = signal<Set<string>>(new Set());
  lightbox = signal<{ p: any } | null>(null);
  private lastFocus: HTMLElement | null = null;
  img = mediaUrl;
  demandLabel = DEMAND_LABEL;

  // Imagen en el modal de producto (se aplica al guardar, una vez guardado el producto)
  imageFile = signal<File | null>(null);
  previewDataUrl = signal<string | null>(null);
  existingUrl = signal('');
  removeImage = signal(false);
  imageError = signal('');
  dragOver = signal(false);
  uploadPct = signal<number | null>(null);
  previewSrc = computed(() => this.previewDataUrl() ?? (this.removeImage() ? '' : mediaUrl(this.existingUrl())));
  imageHint = IMAGE_MAX_BYTES / (1024 * 1024);

  showModal = signal(false);
  saving = signal(false);
  formError = signal('');
  form: ProductForm = blank();

  move = signal<MoveForm | null>(null);
  moveError = signal('');
  moving = signal(false);
  typeLabel: Record<string, string> = TYPE_LABEL;

  history = signal<{ product: any; rows: any[] } | null>(null);

  showBcv = signal(false);
  bcvDraft: number | null = null;
  bcvBusy = signal(false);
  bcvError = signal('');

  counts = computed(() => {
    const l = this.products();
    return { all: l.length, low: l.filter((p) => p.stockStatus === 'low').length, out: l.filter((p) => p.stockStatus === 'out').length, untracked: l.filter((p) => p.stockStatus === 'untracked').length };
  });

  filteredProducts = computed(() => {
    const q = this.searchTerm().toLowerCase().trim(), f = this.stockFilter(), key = this.sortBy();
    const n = (v: unknown) => (typeof v === 'number' && isFinite(v) ? v : 0);
    const by: Record<SortKey, (a: any, b: any) => number> = {
      sold: (a, b) => n(b.stats?.unitsSold) - n(a.stats?.unitsSold),
      profit: (a, b) => n(b.stats?.profit) - n(a.stats?.profit),
      demand: (a, b) => n(b.stats?.requests30d) - n(a.stats?.requests30d) || n(b.stats?.demandScore) - n(a.stats?.demandScore),
      name: () => 0,
      // menor stock primero (lo que toca reponer); los productos sin control de inventario van al final
      stock: (a, b) => (a.trackStock ? a.stock : Infinity) - (b.trackStock ? b.stock : Infinity),
    };
    return this.products()
      .filter((p) => {
        if (f !== 'all' && p.stockStatus !== f) return false;
        return !q || p.name.toLowerCase().includes(q) || (p.sku ?? '').toLowerCase().includes(q) || (p.category ?? '').toLowerCase().includes(q);
      })
      .sort((a, b) => by[key](a, b) || a.name.localeCompare(b.name, 'es'));
  });

  ngOnInit() {
    this.loadAll();
    this.sub = this.realtime.events$.pipe(debounceTime(700)).subscribe((e) => { if (e.event === 'stock_alert' || e.event === 'crm') this.loadAll(false); });
  }

  ngAfterViewInit() {
    this.ctx = gsap.context(() => {
      this.animateEntrance();
    }, this.el.nativeElement);
  }

  animateEntrance() {
    const tl = gsap.timeline({ defaults: { ease: 'power2.out' } });

    tl.from('.page-header', {
      y: 16,
      autoAlpha: 0,
      duration: 0.45,
      clearProps: 'all',
    }, 0);

    tl.from('.highlights .hl-tile', {
      y: 18,
      autoAlpha: 0,
      duration: 0.45,
      stagger: 0.06,
      clearProps: 'all',
    }, 0.08);

    tl.from('.inv-summary .inv-card', {
      y: 18,
      autoAlpha: 0,
      duration: 0.45,
      stagger: 0.04,
      ease: 'power3.out',
      clearProps: 'all',
    }, 0.12);

    tl.from('.products-toolbar', {
      y: 16,
      autoAlpha: 0,
      duration: 0.45,
      clearProps: 'all',
    }, 0.18);

    tl.from('.p-grid .p-card', {
      y: 18,
      autoAlpha: 0,
      duration: 0.4,
      stagger: 0.035,
      ease: 'power2.out',
      clearProps: 'all',
    }, 0.24);

    tl.from('.data-table tbody tr', {
      y: 12,
      autoAlpha: 0,
      duration: 0.35,
      stagger: 0.03,
      ease: 'power2.out',
      clearProps: 'all',
    }, 0.24);
  }

  animateProducts() {
    setTimeout(() => {
      this.ctx?.add(() => {
        gsap.from('.p-grid .p-card, .data-table tbody tr', {
          y: 12,
          autoAlpha: 0,
          duration: 0.35,
          stagger: 0.03,
          ease: 'power2.out',
          clearProps: 'all',
        });
      });
    }, 40);
  }

  ngOnDestroy() {
    this.sub?.unsubscribe();
    this.ctx?.revert();
  }

  loadAll(spinner = true) {
    if (spinner) this.loading.set(true);
    this.api.getProducts().subscribe({
      next: (list) => { this.products.set(list); this.loading.set(false); this.loadError.set(false); },
      error: () => { this.loading.set(false); this.loadError.set(true); },
    });
    this.api.getInventorySummary().subscribe({ next: (s) => this.summary.set(s), error: () => {} });
    this.api.getBcvRate().subscribe({ next: (r) => this.bcv.set({ rate: r.rate, auto: !!r.auto, updatedAt: r.updatedAt }), error: () => {} });
  }

  private loadView(): ViewMode {
    try { return localStorage.getItem(VIEW_KEY) === 'list' ? 'list' : 'grid'; } catch { return 'grid'; }
  }
  setView(v: ViewMode) {
    this.view.set(v);
    try { localStorage.setItem(VIEW_KEY, v); } catch { /* sin almacenamiento: solo no se recuerda */ }
    this.animateProducts();
  }

  // ── Imágenes en tarjetas y lista ──────────────────────────
  hasImg(p: any): boolean { return !!mediaUrl(p.thumbUrl || p.imageUrl) && !this.imgFailed().has(p.id); }
  thumb(p: any): string { return mediaUrl(p.thumbUrl || p.imageUrl); }
  srcset(p: any): string | null { const t = mediaUrl(p.thumbUrl), f = mediaUrl(p.imageUrl); return t && f ? `${t} 400w, ${f} 1200w` : null; }
  imgError(p: any) { this.imgFailed.update((s) => new Set(s).add(p.id)); }
  imgDone(p: any) { this.imgLoaded.update((s) => new Set(s).add(p.id)); }
  initial(p: any): string { return (p.name ?? '?').trim().charAt(0).toUpperCase() || '?'; }

  openLightbox(p: any) {
    if (!mediaUrl(p.imageUrl) || this.imgFailed().has(p.id)) return;
    this.lastFocus = document.activeElement as HTMLElement | null;
    this.lightbox.set({ p });
    setTimeout(() => document.getElementById('lb-close')?.focus());
  }
  closeLightbox() { this.lightbox.set(null); this.lastFocus?.focus?.(); this.lastFocus = null; }
  @HostListener('document:keydown.escape') onEscape() { if (this.lightbox()) this.closeLightbox(); }

  // ── Destacados (cliente: a partir de stats de GET /v1/products) ──
  hasStats = computed(() => this.products().some((p) => !!p.stats));
  highlights = computed(() => {
    const n = (v: unknown) => (typeof v === 'number' && isFinite(v) ? v : 0);
    const list = this.products().filter((p) => p.stats);
    const sold = [...list].filter((p) => n(p.stats.unitsSold30d) > 0).sort((a, b) => n(b.stats.unitsSold30d) - n(a.stats.unitsSold30d) || n(b.stats.unitsSold) - n(a.stats.unitsSold))[0];
    const asked = [...list].filter((p) => n(p.stats.requests30d) > 0).sort((a, b) => n(b.stats.requests30d) - n(a.stats.requests30d) || n(b.stats.unitsSold30d) - n(a.stats.unitsSold30d))[0];
    if (!sold && !asked) return null;
    const soldTag = { icon: 'emoji_events', label: 'Más vendido', cls: 'sold' }, askedTag = { icon: 'forum', label: 'Más preguntado por WhatsApp', cls: 'asked' };
    const soldFact = (p: any) => `${p.stats.unitsSold30d} unidades vendidas en 30 días${n(p.stats.profit) > 0 ? ` · ganancia +$${this.money(p.stats.profit)}` : ''}`;
    const askedFact = (p: any) => `${p.stats.requests30d} clientes lo han preguntado en 30 días`;
    if (sold && asked && sold.id === asked.id) return [{ kind: 'both', title: 'Más vendido y más preguntado', p: sold, tags: [soldTag, askedTag], facts: [soldFact(sold), askedFact(sold)] }];
    const out: { kind: string; title: string; p: any; tags: { icon: string; label: string; cls: string }[]; facts: string[] }[] = [];
    if (sold) out.push({ kind: 'sold', title: 'Más vendido', p: sold, tags: [soldTag], facts: [soldFact(sold)] });
    if (asked) out.push({ kind: 'asked', title: 'Más preguntado por WhatsApp', p: asked, tags: [askedTag], facts: [askedFact(asked)] });
    return out;
  });
  /** Con imagen abre la vista ampliada; sin imagen, la edición del producto. */
  openHighlight(p: any) { if (this.hasImg(p)) this.openLightbox(p); else this.openEditModal(p); }

  // ── Métricas de venta y demanda ───────────────────────────
  money(n: number): string { return Math.round(n).toLocaleString('es-VE'); }
  vefOf(usd: number): number | null { return this.bcvRate() ? Math.round(usd * this.bcvRate()!) : null; }

  vef(p: any): number | null { return p.priceVef ?? (this.bcvRate() ? +(p.price * this.bcvRate()!).toFixed(2) : null); }
  margin(p: any): number | null { return p.price > 0 && p.cost > 0 ? Math.round(((p.price - p.cost) / p.price) * 100) : null; }
  badge(p: any): { text: string; cls: string } {
    switch (p.stockStatus) {
      case 'out': return { text: 'Agotado', cls: 'out' };
      case 'low': return { text: `Stock bajo · ${p.stock}`, cls: 'low' };
      case 'untracked': return { text: 'Sin control', cls: 'none' };
      default: return { text: `${p.stock} en stock`, cls: 'ok' };
    }
  }

  // ── Alta / edición ────────────────────────────────────────
  private resetImageState(existing = '') {
    this.imageFile.set(null); this.previewDataUrl.set(null); this.existingUrl.set(existing); this.removeImage.set(false);
    this.imageError.set(''); this.dragOver.set(false); this.uploadPct.set(null);
  }
  openCreateModal() { this.form = blank(); this.resetImageState(); this.formError.set(''); this.showModal.set(true); }
  openEditModal(p: any) {
    this.form = { id: p.id, name: p.name, sku: p.sku ?? '', category: p.category ?? '', description: p.description ?? '', price: p.price, cost: p.cost ?? 0, trackStock: !!p.trackStock, stock: p.stock ?? 0, minStock: p.minStock ?? 0, isAvailable: !!p.isAvailable };
    this.resetImageState(p.imageUrl ?? ''); this.formError.set(''); this.showModal.set(true);
  }

  // ── Imagen del producto (drag & drop o selector) ─────────
  async onFilePicked(ev: Event) {
    const input = ev.target as HTMLInputElement;
    await this.takeFile(input.files?.[0]);
    input.value = '';
  }
  onDragOver(ev: DragEvent) { ev.preventDefault(); this.dragOver.set(true); }
  onDrop(ev: DragEvent) { ev.preventDefault(); this.dragOver.set(false); void this.takeFile(ev.dataTransfer?.files?.[0]); }
  async takeFile(file?: File) {
    this.imageError.set('');
    if (!file) return;
    if (!(IMAGE_TYPES as readonly string[]).includes(file.type)) { this.imageError.set('Formato no válido. Usa una imagen JPG, PNG o WebP.'); return; }
    if (file.size > IMAGE_MAX_BYTES) { this.imageError.set(`La imagen pesa ${(file.size / 1048576).toFixed(1)} MB y el máximo es ${this.imageHint} MB.`); return; }
    if (!(await sniffImage(file))) { this.imageError.set('El archivo no parece una imagen válida.'); return; }
    try { this.previewDataUrl.set(await readAsDataUrl(file)); } catch { this.imageError.set('No se pudo leer el archivo.'); return; }
    this.imageFile.set(file); this.removeImage.set(false);
  }
  clearImage() {
    this.imageError.set('');
    if (this.imageFile()) { this.imageFile.set(null); this.previewDataUrl.set(null); }
    else if (this.existingUrl()) this.removeImage.set(true);
  }

  /** Sube, reemplaza o quita la imagen del producto ya guardado. Devuelve un mensaje de error o null. */
  private async applyImage(id: string): Promise<string | null> {
    try {
      const file = this.imageFile();
      if (file) {
        this.uploadPct.set(0);
        await new Promise<void>((resolve, reject) => this.api.uploadProductImage(id, file).subscribe({
          next: (ev) => {
            if (ev.type === HttpEventType.UploadProgress && ev.total) this.uploadPct.set(Math.round((100 * ev.loaded) / ev.total));
            if (ev.type === HttpEventType.Response) resolve();
          },
          error: reject,
        }));
      } else if (this.removeImage()) {
        await firstValueFrom(this.api.deleteProductImage(id));
      }
      return null;
    } catch (e: any) {
      return e?.status === 413 ? `La imagen es demasiado grande (máx. ${this.imageHint} MB).` : errMsg(e, 'No se pudo procesar la imagen.');
    } finally { this.uploadPct.set(null); }
  }

  saveProduct() {
    const f = this.form;
    if (!f.name.trim()) { this.formError.set('El nombre es obligatorio.'); return; }
    if (f.price === null || f.price < 0 || isNaN(+f.price)) { this.formError.set('Indica un precio válido en USD (0 o más).'); return; }
    if (f.cost !== null && f.cost < 0) { this.formError.set('El costo no puede ser negativo.'); return; }
    if (f.trackStock && (f.stock < 0 || f.minStock < 0 || !Number.isInteger(+f.stock) || !Number.isInteger(+f.minStock))) { this.formError.set('Stock y stock mínimo deben ser enteros de 0 o más.'); return; }
    const body: any = { name: f.name.trim(), sku: f.sku.trim(), category: f.category.trim(), description: f.description, price: +f.price, cost: +(f.cost ?? 0), trackStock: f.trackStock, minStock: f.trackStock ? +f.minStock : 0, isAvailable: f.isAvailable };
    if (!f.id && f.trackStock) body.stock = +f.stock; // el stock solo se fija al crear; luego cambia con movimientos
    this.saving.set(true); this.formError.set('');
    (f.id ? this.api.updateProduct(f.id, body) : this.api.createProduct(body)).subscribe({
      next: async (res: any) => {
        const id = f.id ?? res?.id;
        if (id && (this.imageFile() || (this.removeImage() && this.existingUrl()))) {
          const err = await this.applyImage(id);
          if (err) {
            // El producto ya está guardado: el modal pasa a modo edición para poder reintentar solo la imagen.
            this.saving.set(false); this.form.id = id; this.loadAll(false);
            this.formError.set(`El producto se guardó, pero la imagen no se pudo procesar: ${err}`);
            return;
          }
        }
        this.saving.set(false); this.showModal.set(false); this.ui.success(f.id ? 'Producto actualizado' : 'Producto creado'); this.loadAll(false);
      },
      error: (e) => { this.saving.set(false); this.formError.set(errMsg(e, 'No se pudo guardar el producto')); },
    });
  }

  toggleAvailability(p: any) {
    this.api.toggleProductAvailability(p.id).subscribe({
      next: () => this.products.update((l) => l.map((x) => (x.id === p.id ? { ...x, isAvailable: !x.isAvailable } : x))),
      error: (e) => this.ui.error(errMsg(e)),
    });
  }

  async deleteProduct(p: any) {
    if (!(await this.ui.confirm(`Se eliminará "${p.name}" del catálogo junto con su historial de inventario.`, { title: 'Eliminar producto', confirmLabel: 'Eliminar' }))) return;
    this.api.deleteProduct(p.id).subscribe({ next: () => { this.ui.success('Producto eliminado'); this.loadAll(false); }, error: (e) => this.ui.error(errMsg(e)) });
  }

  // ── Movimientos de stock ──────────────────────────────────
  openMove(p: any) { this.move.set({ product: p, type: 'in', quantity: null, reason: '' }); this.moveError.set(''); }
  saveMove() {
    const m = this.move();
    if (!m) return;
    const q = Number(m.quantity);
    if (m.quantity === null || !Number.isInteger(q) || q < 0 || (m.type !== 'adjust' && q < 1)) { this.moveError.set(m?.type === 'adjust' ? 'Indica el nuevo stock (entero de 0 o más).' : 'La cantidad debe ser un entero de 1 o más.'); return; }
    this.moving.set(true); this.moveError.set('');
    this.api.moveStock(m.product.id, { type: m.type, quantity: q, reason: m.reason.trim() || undefined }).subscribe({
      next: () => { this.moving.set(false); this.move.set(null); this.ui.success('Movimiento registrado'); this.loadAll(false); },
      error: (e) => { this.moving.set(false); this.moveError.set(errMsg(e, 'No se pudo registrar el movimiento')); },
    });
  }

  openHistory(p: any) {
    this.history.set({ product: p, rows: [] });
    this.api.getStockMovements(p.id).subscribe({ next: (rows) => this.history.set({ product: p, rows }), error: (e) => { this.history.set(null); this.ui.error(errMsg(e)); } });
  }

  // ── Tasa BCV ──────────────────────────────────────────────
  openBcv() { this.bcvDraft = this.bcv().rate; this.bcvError.set(''); this.showBcv.set(true); }
  saveBcv() {
    if (this.bcvDraft === null || !(+this.bcvDraft > 0)) { this.bcvError.set('Indica una tasa mayor que 0.'); return; }
    this.bcvBusy.set(true);
    this.api.setBcvRate({ rate: +this.bcvDraft }).subscribe({
      next: (r) => { this.bcvBusy.set(false); this.bcv.set({ rate: r.rate, auto: !!r.auto, updatedAt: r.updatedAt }); this.showBcv.set(false); this.ui.success('Tasa actualizada'); this.loadAll(false); },
      error: (e) => { this.bcvBusy.set(false); this.bcvError.set(errMsg(e)); },
    });
  }
  refreshBcv() {
    this.bcvBusy.set(true); this.bcvError.set('');
    this.api.refreshBcvRate().subscribe({
      next: (r) => { this.bcvBusy.set(false); this.bcv.set({ rate: r.rate, auto: !!r.auto, updatedAt: r.updatedAt }); this.bcvDraft = r.rate; this.ui.success('Tasa oficial actualizada'); this.loadAll(false); },
      error: (e) => { this.bcvBusy.set(false); this.bcvError.set(errMsg(e, 'No se pudo consultar la tasa oficial')); },
    });
  }
  toggleBcvAuto(auto: boolean) {
    this.api.setBcvRate({ auto }).subscribe({ next: (r) => this.bcv.set({ rate: r.rate, auto: !!r.auto, updatedAt: r.updatedAt }), error: (e) => this.ui.error(errMsg(e)) });
  }
}
