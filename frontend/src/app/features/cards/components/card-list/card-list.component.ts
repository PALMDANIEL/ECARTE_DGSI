import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { CardService } from '../../services/card.service';
import { BusinessCard } from '../../../../core/models/business-card.model';
import { ConfirmationService, MessageService } from 'primeng/api';
import { Observable, map, BehaviorSubject, combineLatest } from 'rxjs';
import { environment } from '../../../../../environments/environment';
import { isAdminRole } from '../../../../core/auth/role';
import { STATUS_LABEL } from '../card-lifecycle/card-lifecycle.component';

@Component({
  selector: 'app-card-list',
  standalone: false,
  template: `
    <div class="ec-page">
      <div class="ec-page-header">
        <div>
          <h1 class="ec-display">Mes cartes</h1>
          <p class="ec-mono">{{ (cards$ | async)?.length || 0 }} CARTE(S)</p>
        </div>
        <button pButton label="Nouvelle carte" icon="pi pi-plus" class="p-button-success" routerLink="/cards/new"></button>
      </div>

      <div class="ec-toolbar">
        <span class="ec-search">
          <i class="pi pi-search"></i>
          <input type="text" placeholder="Rechercher un nom, un service…" (input)="search($event)" />
        </span>
      </div>

      <div class="ec-cards-grid" *ngIf="(cards$ | async)?.length; else empty">
        <div class="ec-card-tile" *ngFor="let card of cards$ | async">
          <div class="ec-tile-top">
            <img [src]="card.photo || 'https://ui-avatars.com/api/?name=' + card.fullName + '&background=12172B&color=C89B3C&bold=true'" />
            <span class="ec-status-dot" [class.active]="card.isActive"></span>
          </div>

          <h3>{{ card.fullName }}</h3>
          <p class="ec-mono" style="font-size:.68rem; margin:-4px 0 6px" *ngIf="card.status && card.status !== 'PENDING'">
            <span class="ec-badge" [class.ok]="card.status === 'ACTIVE'" [class.warn]="card.status === 'SUSPENDED' || card.status === 'EXPIRED'" [class.bad]="card.status === 'REVOKED'">{{ statusLabel(card.status) }}</span>
            <span *ngIf="card.cardNumber" style="margin-left:6px">{{ card.cardNumber }}</span>
          </p>
          <p class="ec-mono ec-job" *ngIf="card.jobTitle">{{ card.jobTitle | uppercase }}</p>

          <div class="ec-org" *ngIf="card.ministry || card.direction || card.service">
            <span *ngIf="card.ministry">{{ card.ministry }}</span>
            <span *ngIf="card.direction">{{ card.direction }}</span>
            <span *ngIf="card.service">{{ card.service }}</span>
          </div>

          <div class="ec-contact" *ngIf="card.email || card.phoneMobile">
            <span *ngIf="card.email"><i class="pi pi-envelope"></i>{{ card.email }}</span>
            <span *ngIf="card.phoneMobile"><i class="pi pi-phone"></i>{{ card.phoneMobile }}</span>
          </div>

          <div class="ec-tile-actions">
            <button class="ec-tile-btn" (click)="manageCard(card)" pTooltip="Carte professionnelle (émission, QR d'accès, révocation…)" *ngIf="isAdmin"><i class="pi pi-id-card"></i></button>
            <button class="ec-tile-btn" (click)="showQR(card)" pTooltip="QR contact (carte de visite)" [class.loading]="generatingQrId === card.id">
              <i class="pi" [class.pi-qrcode]="generatingQrId !== card.id" [class.pi-spin]="generatingQrId === card.id" [class.pi-spinner]="generatingQrId === card.id"></i>
            </button>
            <button class="ec-tile-btn" (click)="viewCard(card)" pTooltip="Voir la carte"><i class="pi pi-eye"></i></button>
            <button class="ec-tile-btn" (click)="printCard(card)" pTooltip="Imprimer / PDF" [class.loading]="printingId === card.id">
              <i class="pi" [class.pi-print]="printingId !== card.id" [class.pi-spin]="printingId === card.id" [class.pi-spinner]="printingId === card.id"></i>
            </button>
            <button class="ec-tile-btn" (click)="editCard(card)" pTooltip="Modifier"><i class="pi pi-pencil"></i></button>
            <button class="ec-tile-btn danger" (click)="deleteCard(card)" pTooltip="Supprimer"><i class="pi pi-trash"></i></button>
          </div>
        </div>
      </div>

      <ng-template #empty>
        <div class="ec-empty">
          <div class="ec-empty-icon"><i class="pi pi-id-card"></i></div>
          <h3>Aucune carte pour le moment</h3>
          <p>Créez votre première carte de visite numérique en quelques secondes.</p>
          <button pButton label="Créer ma première carte" icon="pi pi-plus" routerLink="/cards/new"></button>
        </div>
      </ng-template>

      <p-dialog header="QR Code — Contact direct" [(visible)]="showQRDialog" [modal]="true" styleClass="ec-qr-modal">
        <div class="ec-qr-dialog" *ngIf="selectedCard">
          <img [src]="qrImageUrl" *ngIf="qrImageUrl" />
          <p class="ec-qr-note">
            <i class="pi pi-info-circle"></i>
            Ce QR contient directement les coordonnées de {{ selectedCard.fullName }} — il fonctionne hors ligne, sans passer par un serveur.
          </p>
          <a [href]="qrImageUrl" [download]="'qr-contact-' + selectedCard.slug + '.png'" pButton label="Télécharger PNG" icon="pi pi-download"></a>
        </div>
      </p-dialog>

      <app-card-lifecycle [cardId]="lifecycleCardId" [(visible)]="showLifecycle" (changed)="refresh()"></app-card-lifecycle>
    </div>
  `,
  styles: [`
    .ec-toolbar { margin-bottom: 20px; }
    .ec-search { display: flex; align-items: center; gap: 10px; background: var(--ec-paper-raised); border: 1px solid var(--ec-line); border-radius: 10px; padding: 10px 14px; max-width: 360px; }
    .ec-search i { color: var(--ec-ink-soft); }
    .ec-search input { border: none; outline: none; background: transparent; width: 100%; font-family: var(--ec-font-body); font-size: 0.9rem; }
    .ec-cards-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 18px; }
    .ec-card-tile { background: var(--ec-paper-raised); border: 1px solid var(--ec-line); border-radius: 16px; padding: 20px; transition: transform .15s ease, box-shadow .15s ease; position: relative; }
    .ec-card-tile:hover { transform: translateY(-3px); box-shadow: 0 10px 24px rgba(18,23,43,0.10); }
    .ec-tile-top { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px; }
    .ec-tile-top img { width: 52px; height: 52px; border-radius: 50%; object-fit: cover; border: 2px solid var(--ec-brass-soft); }
    .ec-status-dot { width: 9px; height: 9px; border-radius: 50%; background: var(--ec-coral); margin-top: 4px; }
    .ec-status-dot.active { background: var(--ec-teal); }
    .ec-card-tile h3 { font-family: var(--ec-font-display); font-size: 1.15rem; margin: 0 0 2px; color: var(--ec-ink); }
    .ec-job { font-size: 0.68rem; color: var(--ec-teal); margin: 0 0 10px; }
    .ec-org { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 12px; }
    .ec-org span { background: var(--ec-brass-soft); color: var(--ec-ink); font-size: 0.68rem; padding: 3px 9px; border-radius: 999px; font-weight: 600; }
    .ec-contact { display: flex; flex-direction: column; gap: 4px; margin-bottom: 16px; }
    .ec-contact span { display: flex; align-items: center; gap: 6px; font-size: 0.78rem; color: var(--ec-ink-soft); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .ec-contact i { color: var(--ec-brass); font-size: 0.75rem; width: 14px; }
    .ec-tile-actions { display: flex; gap: 4px; border-top: 1px solid var(--ec-line); padding-top: 12px; }
    .ec-tile-btn { flex: 1; display: flex; align-items: center; justify-content: center; padding: 8px; border-radius: 8px; border: none; background: var(--ec-paper); color: var(--ec-ink-soft); cursor: pointer; transition: background .15s ease, color .15s ease; }
    .ec-tile-btn:hover { background: var(--ec-brass-soft); color: var(--ec-ink); }
    .ec-tile-btn.danger:hover { background: #FBEAEA; color: var(--ec-coral); }
    .ec-tile-btn.loading { pointer-events: none; opacity: 0.6; }
    .ec-empty { display: flex; flex-direction: column; align-items: center; text-align: center; padding: 80px 20px; color: var(--ec-ink-soft); }
    .ec-empty-icon { width: 72px; height: 72px; border-radius: 50%; background: var(--ec-brass-soft); display: flex; align-items: center; justify-content: center; font-size: 1.8rem; color: var(--ec-brass); margin-bottom: 16px; }
    .ec-empty h3 { font-family: var(--ec-font-display); color: var(--ec-ink); margin: 0 0 6px; }
    .ec-empty p { margin: 0 0 20px; max-width: 320px; }
    .ec-qr-dialog { display: flex; flex-direction: column; align-items: center; gap: 12px; padding: 8px; }
    .ec-qr-dialog img { width: 240px; height: 240px; border-radius: 8px; }
    .ec-qr-note { font-size: 0.78rem; color: var(--ec-ink-soft); text-align: center; display: flex; align-items: flex-start; gap: 6px; max-width: 280px; }
    .ec-qr-note i { color: var(--ec-teal); margin-top: 2px; flex-shrink: 0; }
  `]
})
export class CardListComponent implements OnInit {
  private allCards$ = new BehaviorSubject<BusinessCard[]>([]);
  private searchTerm$ = new BehaviorSubject<string>('');
  cards$: Observable<BusinessCard[]>;

  showQRDialog = false;
  qrImageUrl: string | null = null;
  selectedCard: BusinessCard | null = null;
  printingId: string | null = null;
  generatingQrId: string | null = null;
  environment = environment;

  constructor(
    private cardService: CardService,
    private confirmationService: ConfirmationService,
    private messageService: MessageService,
    private router: Router
  ) {
    this.cards$ = combineLatest([this.allCards$, this.searchTerm$]).pipe(
      map(([cards, term]) => {
        if (!term) return cards;
        const t = term.toLowerCase();
        return cards.filter(c =>
          c.fullName?.toLowerCase().includes(t) ||
          c.service?.toLowerCase().includes(t) ||
          c.direction?.toLowerCase().includes(t) ||
          c.ministry?.toLowerCase().includes(t) ||
          c.email?.toLowerCase().includes(t)
        );
      })
    );
  }

  ngOnInit() { this.refresh(); }

  refresh() {
    this.cardService.getUserCards().subscribe({
      next: cards => this.allCards$.next(cards),
      error: () => this.allCards$.next([])
    });
  }

  search(event: Event) { this.searchTerm$.next((event.target as HTMLInputElement).value); }

  isAdmin = isAdminRole();
  lifecycleCardId: string | null = null;
  showLifecycle = false;
  statusLabel(s: string) { return STATUS_LABEL[s as keyof typeof STATUS_LABEL] || s; }
  manageCard(card: BusinessCard) { this.lifecycleCardId = card.id; this.showLifecycle = true; }

  viewCard(card: BusinessCard) { window.open(`/card/${card.slug}`, '_blank'); }
  editCard(card: BusinessCard) { this.router.navigate(['/cards', card.id, 'edit']); }

  printCard(card: BusinessCard) {
    this.printingId = card.id;
    this.cardService.exportPDF(card.id).subscribe({
      next: (blob) => {
        const url = window.URL.createObjectURL(blob);
        const printWindow = window.open(url, '_blank');
        this.printingId = null;
        if (printWindow) printWindow.addEventListener('load', () => printWindow.print());
        else this.messageService.add({ severity: 'warn', summary: 'Popup bloquée', detail: 'Autorisez les popups pour ce site afin d\'imprimer' });
      },
      error: () => {
        this.printingId = null;
        this.messageService.add({ severity: 'error', summary: 'Erreur', detail: 'Impossible de générer le PDF' });
      }
    });
  }

  showQR(card: BusinessCard) {
    this.selectedCard = card;
    this.generatingQrId = card.id;
    this.qrImageUrl = null;
    this.showQRDialog = true;

    // Récupère le PNG généré côté backend par la même fonction que le PDF
    // (buildVCard + qrcode.toBuffer partagés) : QR strictement identique.
    this.cardService.getQrCode(card.id).subscribe({
      next: (blob: Blob) => {
        this.qrImageUrl = window.URL.createObjectURL(blob);
        this.generatingQrId = null;
      },
      error: () => {
        this.messageService.add({ severity: 'error', summary: 'Erreur', detail: 'Impossible de générer le QR Code' });
        this.showQRDialog = false;
        this.generatingQrId = null;
      }
    });
  }

  deleteCard(card: BusinessCard) {
    this.confirmationService.confirm({
      message: `Voulez-vous vraiment supprimer la carte de ${card.fullName} ?`,
      accept: () => {
        this.cardService.deleteCard(card.id).subscribe({
          next: () => { this.messageService.add({ severity: 'success', summary: 'Supprimée', detail: 'Carte supprimée' }); this.refresh(); },
          error: () => this.messageService.add({ severity: 'error', summary: 'Erreur', detail: 'Impossible de supprimer' })
        });
      }
    });
  }
}
