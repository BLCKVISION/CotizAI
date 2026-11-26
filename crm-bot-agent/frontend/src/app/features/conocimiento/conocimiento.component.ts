import { Component, OnInit, AfterViewInit, OnDestroy, ElementRef, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { gsap } from 'gsap';
import { ApiService } from '../../core/services/api.service';
import { UiService } from '../../core/ui/ui.service';
import { errMsg } from '../../core/ui/errors';

@Component({
  selector: 'app-conocimiento',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './conocimiento.component.html',
  styleUrls: ['./conocimiento.component.scss'],
})
export class ConocimientoComponent implements OnInit, AfterViewInit, OnDestroy {
  private el = inject(ElementRef);
  private ctx?: gsap.Context;
  private api = inject(ApiService);
  private ui = inject(UiService);

  chunks = signal<any[]>([]);
  loading = signal(true);
  searchQuery = signal('');
  searchResults = signal<any[]>([]);
  isSearching = signal(false);
  searched = signal(false);

  sourceFileName = '';
  newDocumentText = '';
  isUploading = signal(false);
  readonly maxChars = 200_000;

  ngOnInit() {
    this.loadChunks();
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

    tl.from('.index-panel', {
      y: 22,
      autoAlpha: 0,
      duration: 0.5,
      clearProps: 'all',
    }, 0.08);

    tl.from('.test-panel', {
      y: 22,
      autoAlpha: 0,
      duration: 0.5,
      clearProps: 'all',
    }, 0.14);

    tl.from('.chunks-section', {
      y: 20,
      autoAlpha: 0,
      duration: 0.5,
      clearProps: 'all',
    }, 0.2);

    tl.from('.chunk-card', {
      y: 14,
      autoAlpha: 0,
      duration: 0.4,
      stagger: 0.05,
      ease: 'power2.out',
      clearProps: 'all',
    }, 0.28);
  }

  ngOnDestroy() {
    this.ctx?.revert();
  }

  loadChunks() {
    this.api.getKnowledgeChunks().subscribe({
      next: (data) => {
        this.chunks.set(data ?? []);
        this.loading.set(false);
        // Stagger in any loaded chunk cards
        setTimeout(() => {
          this.ctx?.add(() => {
            gsap.from('.chunk-card', {
              y: 12,
              autoAlpha: 0,
              duration: 0.35,
              stagger: 0.04,
              ease: 'power2.out',
              clearProps: 'all',
            });
          });
        }, 50);
      },
      error: (e) => {
        this.loading.set(false);
        this.ui.error(errMsg(e, 'No se pudo cargar la base de conocimiento'));
      },
    });
  }

  addDocument() {
    const text = this.newDocumentText.trim();
    if (!text) { this.ui.error('Pega el contenido que quieres indexar.'); return; }
    if (text.length > this.maxChars) { this.ui.error(`El texto supera los ${this.maxChars.toLocaleString('es')} caracteres.`); return; }
    this.isUploading.set(true);
    this.api.addDocumentText(this.sourceFileName.trim() || 'Documento sin título', text).subscribe({
      next: (saved) => {
        this.isUploading.set(false);
        this.newDocumentText = '';
        this.ui.success(`Documento indexado en ${saved?.length ?? 0} fragmentos`);
        this.loadChunks();
      },
      error: (e) => {
        this.isUploading.set(false);
        this.ui.error(errMsg(e, 'No se pudo indexar el documento'));
      },
    });
  }

  testSearch() {
    const q = this.searchQuery().trim();
    if (!q) return;
    this.isSearching.set(true);
    this.searched.set(true);
    this.api.searchKnowledge(q).subscribe({
      next: (results) => {
        this.isSearching.set(false);
        this.searchResults.set(results ?? []);
        setTimeout(() => {
          this.ctx?.add(() => {
            gsap.from('.result-card', {
              y: 10,
              autoAlpha: 0,
              duration: 0.3,
              stagger: 0.05,
              ease: 'power2.out',
              clearProps: 'all',
            });
          });
        }, 50);
      },
      error: (e) => {
        this.isSearching.set(false);
        this.searchResults.set([]);
        this.ui.error(errMsg(e, 'La búsqueda falló'));
      },
    });
  }

  async deleteChunk(c: any) {
    if (!(await this.ui.confirm('Se eliminará este fragmento de la base de conocimiento.', { title: 'Eliminar fragmento', confirmLabel: 'Eliminar' }))) return;
    this.api.deleteKnowledgeChunk(c.id).subscribe({
      next: () => {
        this.chunks.update((l) => l.filter((x) => x.id !== c.id));
        this.searchResults.update((l) => l.filter((x) => x.id !== c.id));
      },
      error: (e) => this.ui.error(errMsg(e)),
    });
  }

  async clearAll() {
    if (!(await this.ui.confirm('Se eliminarán TODOS los fragmentos. El agente dejará de consultarlos.', { title: 'Vaciar base de conocimiento', confirmLabel: 'Vaciar todo' }))) return;
    this.api.clearKnowledge().subscribe({
      next: (r) => {
        this.chunks.set([]);
        this.searchResults.set([]);
        this.ui.success(`${r?.deleted ?? 0} fragmentos eliminados`);
      },
      error: (e) => this.ui.error(errMsg(e)),
    });
  }
}
