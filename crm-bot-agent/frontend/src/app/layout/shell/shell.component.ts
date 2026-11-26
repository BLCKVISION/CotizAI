import { AfterViewInit, OnDestroy, Component, signal, HostListener, inject, computed } from '@angular/core';
import { RouterOutlet, RouterLink, RouterLinkActive, Router, NavigationEnd } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { filter } from 'rxjs/operators';
import { AuthService } from '../../core/services/auth.service';
import { TourService } from '../../core/services/tour.service';
import { NotificationsService } from '../../core/services/notifications.service';
import { RealtimeService } from '../../core/services/realtime.service';
import { ThemeService } from '../../core/services/theme.service';
import { SoundService } from '../../core/services/sound.service';

export interface NavItem {
  label: string;
  icon: string;
  route: string;
  badge?: string;
}

@Component({
  selector: 'app-shell',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, CommonModule, FormsModule],
  templateUrl: './shell.component.html',
  styleUrls: ['./shell.component.scss'],
})
export class ShellComponent implements AfterViewInit, OnDestroy {
  public auth = inject(AuthService);
  public themeService = inject(ThemeService);
  public sound = inject(SoundService);
  private router = inject(Router);
  realtime = inject(RealtimeService);
  notifs = inject(NotificationsService);
  private tour = inject(TourService);
  searchText = '';

  // En pantallas estrechas el menú empieza cerrado
  sidebarOpen = signal(typeof window === 'undefined' ? true : window.innerWidth > 820);
  userMenuOpen = signal(false);
  tenantMenuOpen = signal(false);
  notificationsOpen = signal(false);
  configMenuOpen = signal(false);
  collapsedMenuHover = signal(false);
  currentUrl = signal('/dashboard');

  currentUser = this.auth.currentUser;
  currentTenant = this.auth.currentTenant;

  // Title dictionary for top header
  private routeTitles: Record<string, string> = {
    '/dashboard': 'Dashboard',
    '/conversations': 'Conversaciones',
    '/crm': 'Clientes',
    '/clientes': 'Clientes',
    '/reportes': 'Reportes',
    '/agenda': 'Agenda',
    '/plantillas': 'Plantillas',
    '/equipo': 'Equipo & Agentes',
    '/agentes': 'Equipo & Agentes',
    '/productos': 'Productos',
    '/configuracion/whatsapp': 'WhatsApp',
    '/whatsapp': 'WhatsApp',
    '/ai-config': 'Agente IA',
    '/conocimiento': 'Conocimiento',
    '/funnel': 'Funnel',
    '/webhooks': 'Webhooks',
  };

  currentTitle = computed(() => {
    const url = this.currentUrl();
    for (const [route, title] of Object.entries(this.routeTitles)) {
      if (url.startsWith(route)) {
        return title;
      }
    }
    return 'Dashboard';
  });

  navPrimary: NavItem[] = [
    { label: 'Dashboard', icon: 'grid_view', route: '/dashboard' },
    { label: 'Conversaciones', icon: 'chat_bubble', route: '/conversations' },
    { label: 'Clientes', icon: 'person', route: '/crm' },
    { label: 'Reportes', icon: 'trending_up', route: '/reportes' },
    { label: 'Agenda', icon: 'calendar_today', route: '/agenda' },
    { label: 'Productos', icon: 'inventory_2', route: '/productos' },
  ];

  navConfig: NavItem[] = [
    { label: 'Plantillas', icon: 'description', route: '/plantillas' },
    { label: 'Equipo & Agentes', icon: 'group', route: '/equipo' },
    { label: 'WhatsApp', icon: 'phone_iphone', route: '/configuracion/whatsapp' },
    { label: 'Agente IA', icon: 'smart_toy', route: '/ai-config' },
    { label: 'Conocimiento', icon: 'library_books', route: '/conocimiento' },
    { label: 'Funnel', icon: 'filter_alt', route: '/funnel' },
    { label: 'Webhooks', icon: 'webhook', route: '/webhooks' },
  ];

  isConfigRoute = computed(() => {
    const url = this.currentUrl();
    return this.navConfig.some((item) => url.startsWith(item.route));
  });

  constructor() {
    this.currentUrl.set(this.router.url);
    if (this.isConfigRoute()) {
      this.configMenuOpen.set(true);
    }
    this.router.events
      .pipe(filter((event): event is NavigationEnd => event instanceof NavigationEnd))
      .subscribe((event) => {
        this.currentUrl.set(event.urlAfterRedirects);
        if (this.isConfigRoute()) {
          this.configMenuOpen.set(true);
        }
      });
  }

  ngAfterViewInit() {
    setTimeout(() => this.tour.maybeStart(() => this.sidebarOpen.set(true)), 900);
  }

  ngOnDestroy() {
    this.tour.stop();
  }

  toggleConfigMenu() {
    if (!this.sidebarOpen()) {
      this.sidebarOpen.set(true);
      this.configMenuOpen.set(true);
      this.collapsedMenuHover.set(false);
      return;
    }
    this.configMenuOpen.update((v) => !v);
  }

  onConfigHover() {
    if (!this.sidebarOpen()) {
      this.collapsedMenuHover.set(true);
    }
  }

  startTour() {
    this.sidebarOpen.set(true);
    setTimeout(() => this.tour.start(), 150);
  }

  search() {
    const q = this.searchText.trim();
    this.router.navigate(['/crm'], { queryParams: q ? { q } : {} });
  }

  toggleNotifications() {
    this.notificationsOpen.update((v) => !v);
    if (this.notificationsOpen()) this.notifs.markRead();
  }

  openNotification(link?: string) {
    this.notificationsOpen.set(false);
    if (link) this.router.navigateByUrl(link);
  }

  toggleSidebar() {
    this.sidebarOpen.update((v) => !v);
  }

  closeSidebarOnMobile() {
    if (window.innerWidth <= 820) this.sidebarOpen.set(false);
  }

  logout() {
    this.auth.logout();
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: Event) {
    const target = event.target as HTMLElement;
    if (!target.closest('.user-menu-wrapper')) {
      this.userMenuOpen.set(false);
    }
    if (!target.closest('.tenant-card-wrapper')) {
      this.tenantMenuOpen.set(false);
    }
    if (!target.closest('.notifications-wrapper')) {
      this.notificationsOpen.set(false);
    }
  }

  @HostListener('window:keydown', ['$event'])
  onKeyDown(event: KeyboardEvent) {
    if ((event.metaKey || event.ctrlKey) && event.key === 'k') {
      event.preventDefault();
      const searchInput = document.getElementById('topbar-search') as HTMLInputElement;
      if (searchInput) {
        searchInput.focus();
      }
    }
  }
}




