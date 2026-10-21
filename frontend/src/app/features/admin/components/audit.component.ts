import { Component, OnInit } from '@angular/core';
import { MessageService } from 'primeng/api';
import { AdminApiService, AuditEntry } from '../services/admin-api.service';

@Component({
  selector: 'app-audit',
  standalone: false,
  template: `
    <div class="ec-page">
      <div class="ec-page-header">
        <div>
          <h1 class="ec-display">Journal d'audit</h1>
          <p class="ec-mono">{{ total }} ÉVÉNEMENT(S) — CHAÎNE D'EMPREINTES INFALSIFIABLE</p>
        </div>
        <button pButton label="Vérifier l'intégrité" icon="pi pi-shield" (click)="verify()" [disabled]="verifying"></button>
      </div>

      <div class="ec-info-box" *ngIf="integrity" [class.ec-error-box]="!integrity.ok">
        <ng-container *ngIf="integrity.ok">Journal intègre : {{ integrity.checked }} entrée(s) vérifiée(s), aucune modification détectée.</ng-container>
        <ng-container *ngIf="!integrity.ok">⚠ Anomalie détectée à partir de l'entrée n° {{ integrity.brokenAtSeq }} : le journal a été altéré.</ng-container>
      </div>

      <div class="ec-toolbar-row">
        <input pInputText placeholder="Action (ex. CARD_REVOKED)" [(ngModel)]="action" (keyup.enter)="page = 1; load()" />
        <select class="ec-select" style="max-width:220px" [(ngModel)]="entity" (ngModelChange)="page = 1; load()">
          <option value="">Toutes les entités</option>
          <option *ngFor="let e of entities" [value]="e">{{ e }}</option>
        </select>
        <button pButton type="button" label="Filtrer" icon="pi pi-filter" class="p-button-text" (click)="page = 1; load()"></button>
      </div>

      <div class="ec-panel">
        <table class="ec-table">
          <thead><tr><th>N°</th><th>Date</th><th>Acteur</th><th>Action</th><th>Entité</th><th>Détail</th></tr></thead>
          <tbody>
            <tr *ngFor="let e of items">
              <td class="ec-mono-text">{{ e.seq }}</td>
              <td style="white-space:nowrap">{{ e.createdAt | date:'dd/MM/yyyy HH:mm:ss' }}</td>
              <td>{{ e.actorEmail || '—' }}</td>
              <td><span class="ec-badge">{{ e.action }}</span></td>
              <td>{{ e.entity }}</td>
              <td class="ec-mono-text" style="max-width:340px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap" [title]="detail(e)">{{ detail(e) }}</td>
            </tr>
            <tr *ngIf="!items.length"><td colspan="6" class="ec-empty">Aucun événement.</td></tr>
          </tbody>
        </table>
        <div class="ec-toolbar-row" style="padding: 8px 16px; margin: 0; justify-content: space-between" *ngIf="total > limit">
          <span class="ec-hint">Page {{ page }} / {{ pages }}</span>
          <span>
            <button pButton type="button" icon="pi pi-chevron-left" class="p-button-text" [disabled]="page <= 1" (click)="page = page - 1; load()"></button>
            <button pButton type="button" icon="pi pi-chevron-right" class="p-button-text" [disabled]="page >= pages" (click)="page = page + 1; load()"></button>
          </span>
        </div>
      </div>
    </div>
  `
})
export class AuditComponent implements OnInit {
  items: AuditEntry[] = []; total = 0; page = 1; limit = 25;
  action = ''; entity = '';
  entities = ['Agent', 'OrgUnit', 'Position', 'Delegation', 'BusinessCard', 'RuleParameter'];
  integrity: { ok: boolean; checked: number; brokenAtSeq?: number } | null = null;
  verifying = false;

  constructor(private api: AdminApiService, private messages: MessageService) {}

  get pages() { return Math.max(1, Math.ceil(this.total / this.limit)); }

  ngOnInit() { this.load(); }

  load() {
    this.api.audit({ action: this.action, entity: this.entity, page: this.page, limit: this.limit }).subscribe({
      next: r => { this.items = r.items; this.total = r.total; },
      error: () => this.messages.add({ severity: 'error', summary: 'Erreur', detail: 'Impossible de charger le journal' })
    });
  }

  detail(e: AuditEntry): string {
    const d = e.after ?? e.before;
    return d ? JSON.stringify(d) : '';
  }

  verify() {
    this.verifying = true;
    this.api.verifyAudit().subscribe({ next: r => { this.integrity = r; this.verifying = false; }, error: () => { this.verifying = false; } });
  }
}
