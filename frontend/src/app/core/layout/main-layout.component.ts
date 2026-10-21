import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { Store } from '@ngrx/store';
import { AppState } from '../store';
import { logout } from '../store/auth/auth.actions';

@Component({
  selector: 'app-main-layout',
  standalone: false,
  template: `
    <div class="ec-shell">
      <aside class="ec-sidebar">
        <div class="ec-sidebar-brand"><i class="pi pi-id-card"></i><span class="ec-display">ECARTE</span></div>
        <nav class="ec-nav">
          <a *ngFor="let item of menuItems" [routerLink]="item.link" routerLinkActive="active" class="ec-nav-item">
            <i [class]="item.icon"></i><span>{{ item.label }}</span>
          </a>
        </nav>
        <button class="ec-logout" (click)="logout()"><i class="pi pi-sign-out"></i><span>Déconnexion</span></button>
      </aside>
      <main class="ec-main"><router-outlet></router-outlet></main>
      <p-toast position="top-right"></p-toast>
      <p-confirmDialog [style]="{ width: '26rem' }" acceptLabel="Oui" rejectLabel="Non" header="Confirmation" icon="pi pi-exclamation-triangle"></p-confirmDialog>
    </div>
  `,
  styles: [`
    .ec-shell { display: flex; min-height: 100vh; }
    .ec-sidebar { width: 240px; background: var(--ec-ink); color: #E8E6DE; display: flex; flex-direction: column; padding: 24px 16px; flex-shrink: 0; }
    .ec-sidebar-brand { display: flex; align-items: center; gap: 10px; font-size: 1.2rem; font-weight: 600; padding: 0 8px 24px; color: white; }
    .ec-sidebar-brand i { color: var(--ec-brass); }
    .ec-nav { display: flex; flex-direction: column; gap: 2px; flex: 1; }
    .ec-nav-item { display: flex; align-items: center; gap: 12px; padding: 10px 12px; border-radius: 8px; color: #B8B6AE; text-decoration: none; font-size: 0.9rem; font-weight: 500; }
    .ec-nav-item:hover { background: rgba(255,255,255,0.06); color: white; }
    .ec-nav-item.active { background: var(--ec-brass); color: var(--ec-ink); font-weight: 600; }
    .ec-logout { display: flex; align-items: center; gap: 10px; background: transparent; border: 1px solid rgba(255,255,255,0.12); color: #B8B6AE; padding: 10px 12px; border-radius: 8px; cursor: pointer; }
    .ec-logout:hover { border-color: var(--ec-coral); color: var(--ec-coral); }
    .ec-main { flex: 1; background: var(--ec-paper); overflow-y: auto; }
    @media (max-width: 768px) { .ec-shell { flex-direction: column; } .ec-sidebar { width: 100%; flex-direction: row; align-items: center; } .ec-nav { flex-direction: row; overflow-x: auto; } .ec-nav-item span, .ec-logout span { display: none; } }
  `]
})
export class MainLayoutComponent {
  private allItems = [
    { label: 'Tableau de bord', icon: 'pi pi-home', link: '/dashboard' },
    { label: 'Mes cartes', icon: 'pi pi-id-card', link: '/cards' },
    { label: 'Statistiques', icon: 'pi pi-chart-line', link: '/statistics' },
    { label: 'Utilisateurs', icon: 'pi pi-users', link: '/users', roles: ['SUPER_ADMIN', 'ADMIN'] },
    { label: 'Équipes', icon: 'pi pi-sitemap', link: '/teams', roles: ['SUPER_ADMIN', 'ADMIN'] },
    { label: 'Entreprises', icon: 'pi pi-building', link: '/companies', roles: ['SUPER_ADMIN'] },
    { label: 'Mon compte', icon: 'pi pi-user', link: '/account' }
  ];
  menuItems: { label: string; icon: string; link: string }[] = [];
  constructor(private store: Store<AppState>, private router: Router) {
    const role = this.roleFromToken();
    this.menuItems = this.allItems.filter(i => !('roles' in i) || (i as any).roles.includes(role));
  }
  private roleFromToken(): string | null {
    try { return JSON.parse(atob((localStorage.getItem('accessToken') || '').split('.')[1])).role || null; } catch { return null; }
  }
  logout() { this.store.dispatch(logout()); this.router.navigate(['/auth/login']); }
}
