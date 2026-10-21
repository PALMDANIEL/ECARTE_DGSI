import { Component, EventEmitter, Input, OnChanges, Output } from '@angular/core';
import { ConfirmationService, MessageService } from 'primeng/api';
import { CardEvent, CardLifecycle, CardService, CardStatus } from '../../services/card.service';

export const STATUS_LABEL: Record<CardStatus, string> = {
  PENDING: 'Non émise', ACTIVE: 'Active', SUSPENDED: 'Suspendue', REVOKED: 'Révoquée', EXPIRED: 'Expirée', REPLACED: 'Remplacée'
};
const EVENT_LABEL: Record<string, string> = {
  ISSUED: 'Émission', SUSPENDED: 'Suspension', REACTIVATED: 'Réactivation', REVOKED: 'Révocation', RENEWED: 'Renouvellement', REPLACED: 'Remplacement'
};

type Action = 'suspend' | 'revoke' | 'replace';

/** Fenêtre de gestion de la carte professionnelle : état, actions autorisées selon le statut, QR d'accès, historique. */
@Component({
  selector: 'app-card-lifecycle',
  standalone: false,
  template: `
    <p-dialog header="Carte professionnelle" [visible]="visible" (visibleChange)="visibleChange.emit($event)" [modal]="true" [style]="{ width: '40rem' }" [draggable]="false">
      <ng-container *ngIf="info">
        <div class="ec-panel-pad" style="padding:0 0 12px">
          <div class="ec-toolbar-row" style="margin-bottom:6px">
            <strong style="font-size:1.05rem">{{ info.fullName }}</strong>
            <span class="ec-badge" [class.ok]="info.effectiveStatus === 'ACTIVE'" [class.warn]="info.effectiveStatus === 'SUSPENDED' || info.effectiveStatus === 'PENDING' || info.effectiveStatus === 'EXPIRED'" [class.bad]="info.effectiveStatus === 'REVOKED'">{{ label(info.effectiveStatus) }}</span>
          </div>
          <div class="ec-hint" *ngIf="info.agent">Titulaire : {{ info.agent.firstName }} {{ info.agent.lastName }} — matricule {{ info.agent.agentProfile?.matricule || '—' }}</div>
          <div class="ec-hint" *ngIf="!info.agent">Aucun agent associé : modifiez la carte pour désigner son titulaire avant de l'émettre.</div>
          <div class="ec-hint" *ngIf="info.cardNumber">N° <span class="ec-mono-text">{{ info.cardNumber }}</span> — émise le {{ info.issuedAt | date:'dd/MM/yyyy' }}, valable jusqu'au {{ info.expiresAt | date:'dd/MM/yyyy' }}</div>
        </div>

        <div class="ec-error-box" *ngIf="error">{{ error }}</div>

        <div class="ec-toolbar-row" *ngIf="!pendingAction">
          <button pButton type="button" label="Émettre la carte" icon="pi pi-check-circle" class="p-button-success" *ngIf="info.status === 'PENDING'" [disabled]="!info.agentId || busy" (click)="run('issue')"></button>
          <button pButton type="button" label="Renouveler" icon="pi pi-refresh" *ngIf="info.effectiveStatus === 'ACTIVE' || info.effectiveStatus === 'EXPIRED'" [disabled]="busy" (click)="confirmRenew()"></button>
          <button pButton type="button" label="Suspendre" icon="pi pi-pause" class="p-button-warning" *ngIf="info.status === 'ACTIVE'" (click)="pendingAction = 'suspend'"></button>
          <button pButton type="button" label="Réactiver" icon="pi pi-play" class="p-button-success" *ngIf="info.status === 'SUSPENDED'" [disabled]="busy" (click)="run('reactivate')"></button>
          <button pButton type="button" label="Remplacer (perte, vol…)" icon="pi pi-clone" *ngIf="['ACTIVE','SUSPENDED','EXPIRED'].includes(info.effectiveStatus)" (click)="pendingAction = 'replace'"></button>
          <button pButton type="button" label="Révoquer" icon="pi pi-ban" class="p-button-danger" *ngIf="info.status !== 'REVOKED' && info.status !== 'PENDING'" (click)="pendingAction = 'revoke'"></button>
        </div>

        <div *ngIf="pendingAction" class="ec-panel ec-panel-pad">
          <div class="p-field">
            <label>Motif ({{ actionLabel() }}) *</label>
            <input pInputText [(ngModel)]="reason" placeholder="Ex. perte déclarée le 12/10, enquête interne…" />
            <p class="ec-hint" *ngIf="pendingAction === 'revoke'">La révocation est définitive : le QR imprimé cessera immédiatement de fonctionner.</p>
            <p class="ec-hint" *ngIf="pendingAction === 'replace'">Un nouveau numéro et un nouveau QR sont générés ; l'ancien QR est invalidé. Pensez à réimprimer la carte.</p>
          </div>
          <div class="ec-form-actions">
            <button pButton type="button" label="Annuler" class="p-button-text" (click)="pendingAction = null; reason = ''"></button>
            <button pButton type="button" [label]="'Confirmer'" icon="pi pi-check" [disabled]="reason.trim().length < 3 || busy" (click)="run(pendingAction!, reason.trim())"></button>
          </div>
        </div>

        <div *ngIf="info.status === 'ACTIVE' || info.status === 'SUSPENDED'" style="margin-top:6px">
          <button pButton type="button" label="Afficher le QR d'accès" icon="pi pi-qrcode" class="p-button-text" (click)="toggleQr()"></button>
          <div *ngIf="qrUrl" style="text-align:center; margin: 8px 0">
            <img [src]="qrUrl" alt="QR d'accès" style="width: 220px; height: 220px" />
            <p class="ec-hint">Ce QR ne contient aucune donnée personnelle : il renvoie vers un lien sécurisé protégé par le PIN de l'agent. À imprimer sur la carte.</p>
            <a [href]="qrUrl" [download]="'qr-acces-' + (info.cardNumber || info.id) + '.png'" class="ec-hint">Télécharger l'image</a>
          </div>
        </div>

        <h3 class="ec-section-title" style="margin-top:16px">Historique</h3>
        <div *ngFor="let e of events" style="padding:8px 0; border-bottom:1px solid var(--ec-line); font-size:.85rem">
          <span class="ec-badge">{{ eventLabel(e.type) }}</span>
          <span style="margin-left:8px">{{ e.createdAt | date:'dd/MM/yyyy HH:mm' }}</span>
          <span *ngIf="e.reason" style="margin-left:8px; color:var(--ec-ink-soft)">— {{ e.reason }}</span>
          <span *ngIf="e.metadata?.previousCardNumber" class="ec-hint" style="margin-left:8px">(ancien n° {{ e.metadata.previousCardNumber }})</span>
        </div>
        <div class="ec-empty" *ngIf="!events.length">Aucun événement.</div>
      </ng-container>
    </p-dialog>
  `
})
export class CardLifecycleComponent implements OnChanges {
  @Input() cardId: string | null = null;
  @Input() visible = false;
  @Output() visibleChange = new EventEmitter<boolean>();
  @Output() changed = new EventEmitter<void>();

  info: CardLifecycle | null = null;
  events: CardEvent[] = [];
  pendingAction: Action | null = null;
  reason = '';
  busy = false;
  error = '';
  qrUrl: string | null = null;

  constructor(private cards: CardService, private messages: MessageService, private confirm: ConfirmationService) {}

  label(s: CardStatus) { return STATUS_LABEL[s]; }
  eventLabel(t: string) { return EVENT_LABEL[t] || t; }
  actionLabel() { return this.pendingAction === 'suspend' ? 'suspension' : this.pendingAction === 'revoke' ? 'révocation' : 'remplacement'; }

  ngOnChanges() {
    if (this.visible && this.cardId) this.load();
    if (!this.visible) this.clearQr();
  }

  private clearQr() { if (this.qrUrl) window.URL.revokeObjectURL(this.qrUrl); this.qrUrl = null; }

  load() {
    if (!this.cardId) return;
    this.error = ''; this.pendingAction = null; this.reason = ''; this.clearQr();
    this.cards.lifecycle(this.cardId).subscribe({ next: i => (this.info = i), error: e => (this.error = e.error?.message || 'Chargement impossible') });
    this.cards.cardHistory(this.cardId).subscribe({ next: h => (this.events = h.events), error: () => (this.events = []) });
  }

  confirmRenew() {
    this.confirm.confirm({ message: 'Renouveler la carte ? Un nouveau QR sera généré et l\'ancien cessera de fonctionner.', accept: () => this.run('renew') });
  }

  run(action: 'issue' | 'renew' | 'reactivate' | Action, reason = '') {
    if (!this.cardId) return;
    const id = this.cardId;
    const calls = {
      issue: () => this.cards.issueCard(id), renew: () => this.cards.renewCard(id), reactivate: () => this.cards.reactivateCard(id),
      suspend: () => this.cards.suspendCard(id, reason), revoke: () => this.cards.revokeCard(id, reason), replace: () => this.cards.replaceCard(id, reason)
    };
    this.busy = true; this.error = '';
    calls[action]().subscribe({
      next: () => { this.busy = false; this.messages.add({ severity: 'success', summary: 'Carte mise à jour', detail: 'Opération effectuée' }); this.load(); this.changed.emit(); },
      error: e => { this.busy = false; this.error = e.error?.message || 'Opération impossible'; }
    });
  }

  toggleQr() {
    if (this.qrUrl) { this.clearQr(); return; }
    if (!this.cardId) return;
    this.cards.accessQr(this.cardId).subscribe({ next: b => (this.qrUrl = window.URL.createObjectURL(b)), error: e => (this.error = e.error?.message || 'QR indisponible') });
  }
}
