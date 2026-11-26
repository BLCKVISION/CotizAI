import { Component, OnInit, AfterViewInit, OnDestroy, ElementRef, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { gsap } from 'gsap';
import { UiService } from '../../core/ui/ui.service';
import { SoundService } from '../../core/services/sound.service';
import { ThemeService } from '../../core/services/theme.service';

export interface TeamMember {
  id: string;
  name: string;
  email: string;
  phone?: string;
  role: 'admin' | 'agent';
  status: 'active' | 'paused';
  avatarBg?: string;
  initials?: string;
  lastActive?: string;
  conversationsHandled?: number;
  permissions: {
    conversationsReply: boolean;
    paymentsVerify: boolean;
    catalogManage: boolean;
    reportsView: boolean;
  };
}

@Component({
  selector: 'app-team',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './team.component.html',
  styleUrls: ['./team.component.scss'],
})
export class TeamComponent implements OnInit, AfterViewInit, OnDestroy {
  private ui = inject(UiService);
  private sound = inject(SoundService);
  public themeService = inject(ThemeService);
  private el = inject(ElementRef);
  private ctx?: gsap.Context;

  // Estado del equipo
  teamMembers = signal<TeamMember[]>([
    {
      id: 'usr-1',
      name: 'Carlos Mendoza',
      email: 'carlos@boutiquecaracas.com',
      phone: '+58 412 889 1234',
      role: 'admin',
      status: 'active',
      avatarBg: '#d4f938',
      initials: 'CM',
      lastActive: 'En línea ahora',
      conversationsHandled: 420,
      permissions: {
        conversationsReply: true,
        paymentsVerify: true,
        catalogManage: true,
        reportsView: true,
      },
    },
    {
      id: 'usr-2',
      name: 'Mariana Asesora',
      email: 'mariana@boutiquecaracas.com',
      phone: '+58 414 776 5432',
      role: 'agent',
      status: 'active',
      avatarBg: '#38bdf8',
      initials: 'MA',
      lastActive: 'Hace 5 min',
      conversationsHandled: 185,
      permissions: {
        conversationsReply: true,
        paymentsVerify: true,
        catalogManage: false,
        reportsView: false,
      },
    },
    {
      id: 'usr-3',
      name: 'Alejandro Gómez',
      email: 'alejandro@boutiquecaracas.com',
      phone: '+58 416 333 4455',
      role: 'agent',
      status: 'active',
      avatarBg: '#a855f7',
      initials: 'AG',
      lastActive: 'Hace 1 hora',
      conversationsHandled: 94,
      permissions: {
        conversationsReply: true,
        paymentsVerify: false,
        catalogManage: true,
        reportsView: false,
      },
    },
    {
      id: 'usr-4',
      name: 'Valeria Ramos',
      email: 'valeria@boutiquecaracas.com',
      phone: '+58 424 555 9876',
      role: 'agent',
      status: 'paused',
      avatarBg: '#f59e0b',
      initials: 'VR',
      lastActive: 'Ayer',
      conversationsHandled: 52,
      permissions: {
        conversationsReply: false,
        paymentsVerify: false,
        catalogManage: false,
        reportsView: false,
      },
    },
  ]);

  // Filtros y búsqueda
  searchQuery = signal('');
  roleFilter = signal<'all' | 'admin' | 'agent' | 'active' | 'paused'>('all');

  // Modal para nuevo agente
  modalOpen = signal(false);
  newName = '';
  newEmail = '';
  newPhone = '';
  newPassword = '';
  newRole: 'admin' | 'agent' = 'agent';
  newPerms = {
    conversationsReply: true,
    paymentsVerify: false,
    catalogManage: false,
    reportsView: false,
  };

  // KPIs computados
  totalMembers = computed(() => this.teamMembers().length);
  totalAdmins = computed(() => this.teamMembers().filter((m) => m.role === 'admin').length);
  activeAgents = computed(() => this.teamMembers().filter((m) => m.role === 'agent' && m.status === 'active').length);
  pausedMembers = computed(() => this.teamMembers().filter((m) => m.status === 'paused').length);

  // Lista filtrada
  filteredMembers = computed(() => {
    const q = this.searchQuery().toLowerCase().trim();
    const filter = this.roleFilter();

    return this.teamMembers().filter((m) => {
      const matchSearch =
        !q ||
        m.name.toLowerCase().includes(q) ||
        m.email.toLowerCase().includes(q) ||
        (m.phone && m.phone.includes(q));

      if (!matchSearch) return false;

      if (filter === 'admin') return m.role === 'admin';
      if (filter === 'agent') return m.role === 'agent';
      if (filter === 'active') return m.status === 'active';
      if (filter === 'paused') return m.status === 'paused';

      return true;
    });
  });

  ngOnInit() {
    this.loadFromStorage();
  }

  ngAfterViewInit() {
    this.ctx = gsap.context(() => {
      this.animateEntrance();
    }, this.el.nativeElement);
  }

  ngOnDestroy() {
    this.ctx?.revert();
  }

  animateEntrance() {
    const tl = gsap.timeline({ defaults: { ease: 'power2.out' } });

    tl.from('.page-header', {
      y: 18,
      autoAlpha: 0,
      duration: 0.45,
      clearProps: 'all',
    }, 0);

    tl.from('.kpi-card', {
      y: 20,
      autoAlpha: 0,
      stagger: 0.08,
      duration: 0.45,
      clearProps: 'all',
    }, 0.1);

    tl.from('.filters-bar', {
      y: 14,
      autoAlpha: 0,
      duration: 0.4,
      clearProps: 'all',
    }, 0.2);

    tl.from('.member-card', {
      y: 24,
      autoAlpha: 0,
      stagger: 0.07,
      duration: 0.45,
      clearProps: 'all',
    }, 0.25);
  }

  setRoleFilter(f: 'all' | 'admin' | 'agent' | 'active' | 'paused') {
    this.roleFilter.set(f);
  }

  openCreateModal() {
    this.newName = '';
    this.newEmail = '';
    this.newPhone = '';
    this.newPassword = '';
    this.newRole = 'agent';
    this.newPerms = {
      conversationsReply: true,
      paymentsVerify: false,
      catalogManage: false,
      reportsView: false,
    };
    this.modalOpen.set(true);
  }

  closeModal() {
    this.modalOpen.set(false);
  }

  createMember() {
    if (!this.newName.trim() || !this.newEmail.trim()) {
      this.ui.error('Por favor completa el nombre y correo del miembro');
      return;
    }

    const initials = this.newName
      .trim()
      .split(' ')
      .map((w) => w[0])
      .slice(0, 2)
      .join('')
      .toUpperCase();

    const colors = ['#38bdf8', '#a855f7', '#ec4899', '#f97316', '#22c55e', '#14b8a6'];
    const randomColor = colors[Math.floor(Math.random() * colors.length)];

    const newMember: TeamMember = {
      id: `usr-${Date.now()}`,
      name: this.newName.trim(),
      email: this.newEmail.trim(),
      phone: this.newPhone.trim() || undefined,
      role: this.newRole,
      status: 'active',
      avatarBg: this.newRole === 'admin' ? '#d4f938' : randomColor,
      initials: initials || 'AG',
      lastActive: 'Recién creado',
      conversationsHandled: 0,
      permissions:
        this.newRole === 'admin'
          ? {
            conversationsReply: true,
            paymentsVerify: true,
            catalogManage: true,
            reportsView: true,
          }
          : { ...this.newPerms },
    };

    this.teamMembers.update((list) => [newMember, ...list]);
    this.saveToStorage();
    this.closeModal();
    this.sound.play('success');
    this.ui.success(`¡Agente ${newMember.name} creado y permisos configurados!`);
  }

  toggleStatus(member: TeamMember) {
    if (member.role === 'admin') {
      this.ui.error('No se puede pausar la cuenta del Administrador principal');
      return;
    }

    this.teamMembers.update((list) =>
      list.map((m) =>
        m.id === member.id
          ? { ...m, status: m.status === 'active' ? 'paused' : 'active' }
          : m
      )
    );
    this.saveToStorage();
    this.sound.play('pop');
    this.ui.success(`Estado de ${member.name} actualizado`);
  }

  togglePermission(
    memberId: string,
    permKey: 'conversationsReply' | 'paymentsVerify' | 'catalogManage' | 'reportsView'
  ) {
    const member = this.teamMembers().find((m) => m.id === memberId);
    if (member?.role === 'admin') {
      this.ui.error('Los Administradores tienen acceso total por defecto');
      return;
    }

    this.teamMembers.update((list) =>
      list.map((m) => {
        if (m.id === memberId) {
          const updatedPerms = { ...m.permissions, [permKey]: !m.permissions[permKey] };
          return { ...m, permissions: updatedPerms };
        }
        return m;
      })
    );
    this.saveToStorage();
    this.sound.play('pop');
    this.ui.success('Permiso actualizado');
  }

  async deleteMember(member: TeamMember) {
    if (member.role === 'admin') {
      this.ui.error('No es posible eliminar al Administrador');
      return;
    }

    const ok = await this.ui.confirm(
      `¿Estás seguro de que deseas eliminar a ${member.name}? Esta acción revocará sus credenciales de inmediato.`,
      { title: 'Eliminar agente', confirmLabel: 'Eliminar', danger: true }
    );

    if (ok) {
      this.teamMembers.update((list) => list.filter((m) => m.id !== member.id));
      this.saveToStorage();
      this.ui.success(`Agente ${member.name} eliminado`);
    }
  }

  private saveToStorage() {
    try {
      localStorage.setItem('relay_team_members', JSON.stringify(this.teamMembers()));
    } catch (_) { }
  }

  private loadFromStorage() {
    try {
      const saved = localStorage.getItem('relay_team_members');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          this.teamMembers.set(parsed);
        }
      }
    } catch (_) { }
  }
}

