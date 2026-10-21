import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { Store } from '@ngrx/store';
import { AppState } from '../../../core/store';
import { BusinessCard } from '../../../core/models/business-card.model';
import { CardService } from '../../cards/services/card.service';
import { Observable } from 'rxjs';

@Component({
  selector: 'app-dashboard',
  standalone: false,
  template: `
    <div class="ec-dashboard">
      <h1 class="ec-display" style="font-size: 2rem; margin-bottom: 24px;">Tableau de bord</h1>

      <div class="ec-stats">
        <div class="ec-stat-card">
          <i class="pi pi-id-card" style="font-size: 2rem; color: var(--ec-brass);"></i>
          <span class="ec-stat-value">{{ (cards$ | async)?.length || 0 }}</span>
          <span class="ec-stat-label">Cartes créées</span>
        </div>
        <div class="ec-stat-card">
          <i class="pi pi-eye" style="font-size: 2rem; color: var(--ec-teal);"></i>
          <span class="ec-stat-value">0</span>
          <span class="ec-stat-label">Vues totales</span>
        </div>
        <div class="ec-stat-card">
          <i class="pi pi-users" style="font-size: 2rem; color: var(--ec-ink-soft);"></i>
          <span class="ec-stat-value">0</span>
          <span class="ec-stat-label">Contacts ajoutés</span>
        </div>
      </div>

      <div class="ec-recent">
        <h2 class="ec-display" style="font-size: 1.4rem; margin: 32px 0 16px;">Vos dernières cartes</h2>
        <div class="ec-card-grid" *ngIf="(cards$ | async)?.length; else emptyCards">
          <div class="ec-card-mini" *ngFor="let card of (cards$ | async) | slice:0:3" (click)="goToCard(card.id)">
            <img [src]="card.photo || 'https://ui-avatars.com/api/?name=' + card.fullName + '&background=12172B&color=C89B3C&bold=true'" />
            <div>
              <p class="ec-name">{{ card.fullName }}</p>
              <p class="ec-mono">{{ card.jobTitle }}</p>
            </div>
          </div>
        </div>
        <ng-template #emptyCards>
          <p class="ec-mono" style="color: var(--ec-ink-soft);">Aucune carte pour le moment. <a routerLink="/cards/new">Créez-en une</a></p>
        </ng-template>
      </div>
    </div>
  `,
  styles: [`
    .ec-dashboard { padding: 24px; max-width: 1200px; margin: 0 auto; }
    .ec-stats {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 20px;
      margin-bottom: 24px;
    }
    .ec-stat-card {
      background: var(--ec-paper-raised);
      padding: 24px;
      border-radius: 14px;
      border: 1px solid var(--ec-line);
      display: flex;
      flex-direction: column;
      align-items: center;
      text-align: center;
      gap: 6px;
    }
    .ec-stat-value {
      font-family: var(--ec-font-display);
      font-size: 2.2rem;
      font-weight: 600;
      color: var(--ec-ink);
    }
    .ec-stat-label {
      font-size: 0.8rem;
      color: var(--ec-ink-soft);
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    .ec-card-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
      gap: 16px;
    }
    .ec-card-mini {
      background: var(--ec-paper-raised);
      border: 1px solid var(--ec-line);
      border-radius: 12px;
      padding: 16px;
      display: flex;
      align-items: center;
      gap: 14px;
      cursor: pointer;
      transition: transform .15s ease, box-shadow .15s ease;
    }
    .ec-card-mini:hover {
      transform: translateY(-2px);
      box-shadow: 0 4px 12px rgba(18,23,43,0.08);
    }
    .ec-card-mini img {
      width: 48px;
      height: 48px;
      border-radius: 50%;
      object-fit: cover;
    }
    .ec-card-mini .ec-name {
      font-weight: 600;
      margin: 0;
    }
    .ec-card-mini p {
      margin: 0;
      font-size: 0.8rem;
      color: var(--ec-ink-soft);
    }
  `]
})
export class DashboardComponent implements OnInit {
  cards$: Observable<BusinessCard[]>;

  constructor(private store: Store<AppState>, private cardService: CardService, private router: Router) {
    this.cards$ = this.cardService.getUserCards();
  }

  ngOnInit() {}

  goToCard(id: string) {
    this.router.navigate(['/cards', id]);
  }
}
