import { Component, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { Subject, debounceTime } from 'rxjs';
import { isAdminRole } from '../../../core/auth/role';
import { AdminApiService, OrgUnit } from '../../admin/services/admin-api.service';
import { RequestsApiService, RequestView, STATUS_LABEL } from '../requests-api.service';

@Component({
  selector: 'app-requests',
  standalone: false,
  template: `
    <div class="ec-page">
      <div class="ec-page-header">
        <div>
          <h1 class="ec-display">Demandes</h1>
          <p class="ec-mono">AVIS, DÉCISIONS ET SUIVI DES DOSSIERS</p>
        </div>
      </div>

      <div class="ec-toolbar-row">
        <button pButton type="button" [label]="'À traiter (' + inbox.length + ')'" icon="pi pi-inbox" [class.p-button-text]="tab !== 'inbox'" (click)="tab = 'inbox'; loadInbox()"></button>
        <button pButton type="button" label="Toutes les demandes" icon="pi pi-search" [class.p-button-text]="tab !== 'all'" (click)="tab = 'all'; loadAll()"></button>
      </div>

      <!-- À traiter -->
      <div *ngIf="tab === 'inbox'">
        <div class="ec-panel ec-panel-pad ec-empty" *ngIf="!inbox.length">Aucune demande en attente de votre réponse.</div>
        <div class="ec-panel" *ngIf="inbox.length">
          <table class="ec-table">
            <thead><tr><th>Référence</th><th>Agent</th><th>Démarche</th><th>Étape à traiter</th><th>Échéance</th><th></th></tr></thead>
            <tbody>
              <tr *ngFor="let r of inbox">
                <td class="ec-mono-text">{{ r.reference }}</td>
                <td>{{ r.agent?.lastName | uppercase }} {{ r.agent?.firstName }}<br /><span class="ec-hint">{{ r.agent?.agentProfile?.matricule }}</span></td>
                <td>{{ r.type.name }}</td>
                <td>{{ r.activeStep?.label }}</td>
                <td><span class="ec-badge" [class.bad]="r.activeStep?.overdue" [class.ok]="!r.activeStep?.overdue">{{ r.activeStep?.dueAt ? (r.activeStep?.dueAt | date:'dd/MM/yyyy') : 'Sans délai' }}</span></td>
                <td class="ec-cell-actions"><button pButton type="button" label="Traiter" icon="pi pi-pencil" (click)="open(r, true)"></button></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Recherche -->
      <div *ngIf="tab === 'all'">
        <div class="ec-toolbar-row">
          <input pInputText placeholder="Référence, nom ou matricule…" [(ngModel)]="q" (ngModelChange)="q$.next($event)" />
          <select class="ec-select" style="max-width:240px" [(ngModel)]="typeCode" (ngModelChange)="page = 1; loadAll()">
            <option value="">Toutes les démarches</option><option value="DECISION_CONGE">Décision de congé</option><option value="JOUISSANCE_CONGE">Jouissance de congé</option><option value="AUTORISATION_ABSENCE">Autorisation d'absence</option>
          </select>
          <select class="ec-select" style="max-width:200px" [(ngModel)]="status" (ngModelChange)="page = 1; loadAll()">
            <option value="">Tous les statuts</option><option *ngFor="let s of statuses" [value]="s.v">{{ s.l }}</option>
          </select>
          <select class="ec-select" style="max-width:260px" [(ngModel)]="unit" (ngModelChange)="page = 1; loadAll()" *ngIf="admin">
            <option value="">Toutes les unités</option><option *ngFor="let u of units" [value]="u.id">{{ u.name }}</option>
          </select>
          <label class="ec-hint">Du <input pInputText type="date" [(ngModel)]="from" (ngModelChange)="page = 1; loadAll()" /></label>
          <label class="ec-hint">au <input pInputText type="date" [(ngModel)]="to" (ngModelChange)="page = 1; loadAll()" /></label>
        </div>
        <div class="ec-panel">
          <table class="ec-table">
            <thead><tr><th>Référence</th><th>Agent</th><th>Démarche</th><th>Déposée le</th><th>Statut</th><th></th></tr></thead>
            <tbody>
              <tr *ngFor="let r of items">
                <td class="ec-mono-text">{{ r.reference }}</td>
                <td>{{ r.agent?.lastName | uppercase }} {{ r.agent?.firstName }}<br /><span class="ec-hint">{{ r.agent?.agentProfile?.matricule }} · {{ r.agent?.agentProfile?.orgUnit?.name }}</span></td>
                <td>{{ r.type.name }}</td>
                <td>{{ r.submittedAt | date:'dd/MM/yyyy' }}</td>
                <td><span class="ec-badge" [class.ok]="r.status === 'APPROVED'" [class.warn]="r.status === 'IN_PROGRESS' || r.status === 'RETURNED'" [class.bad]="r.status === 'REJECTED' || r.status === 'CANCELLED'">{{ label(r.status) }}</span></td>
                <td class="ec-cell-actions"><button class="ec-icon-btn" (click)="open(r, false)" title="Consulter"><i class="pi pi-eye"></i></button></td>
              </tr>
              <tr *ngIf="!items.length"><td colspan="6" class="ec-empty">Aucune demande.</td></tr>
            </tbody>
          </table>
          <div class="ec-toolbar-row" style="padding: 8px 16px; margin: 0; justify-content: space-between" *ngIf="total > limit">
            <span class="ec-hint">{{ total }} résultat(s) — page {{ page }} / {{ pages }}</span>
            <span>
              <button pButton type="button" icon="pi pi-chevron-left" class="p-button-text" [disabled]="page <= 1" (click)="page = page - 1; loadAll()"></button>
              <button pButton type="button" icon="pi pi-chevron-right" class="p-button-text" [disabled]="page >= pages" (click)="page = page + 1; loadAll()"></button>
            </span>
          </div>
        </div>
      </div>

      <app-request-detail [requestId]="selectedId" [(visible)]="showDetail" [canAct]="canAct" (changed)="refresh()"></app-request-detail>
    </div>
  `
})
export class RequestsComponent implements OnInit {
  tab: 'inbox' | 'all' = 'inbox';
  inbox: RequestView[] = [];
  items: RequestView[] = [];
  total = 0; page = 1; limit = 25;
  q = ''; typeCode = ''; status = ''; unit = ''; from = ''; to = '';
  q$ = new Subject<string>();
  units: OrgUnit[] = [];
  admin = isAdminRole();
  statuses = Object.entries(STATUS_LABEL).filter(([k]) => k !== 'DRAFT').map(([v, l]) => ({ v, l }));
  selectedId: string | null = null; showDetail = false; canAct = false;

  constructor(private api: RequestsApiService, private adminApi: AdminApiService, private route: ActivatedRoute) {}

  get pages() { return Math.max(1, Math.ceil(this.total / this.limit)); }
  label(s: string) { return STATUS_LABEL[s] || s; }

  ngOnInit() {
    const openId = this.route.snapshot.queryParamMap.get('open');
    if (openId) { this.selectedId = openId; this.canAct = true; this.showDetail = true; }
    this.q$.pipe(debounceTime(300)).subscribe(() => { this.page = 1; this.loadAll(); });
    if (this.admin) this.adminApi.orgUnits().subscribe(u => (this.units = u.filter(x => x.isActive)));
    this.loadInbox();
  }

  loadInbox() { this.api.inbox().subscribe(r => (this.inbox = r)); }

  loadAll() {
    this.api.search({ q: this.q, typeCode: this.typeCode, status: this.status, orgUnitId: this.unit, from: this.from ? this.from + 'T00:00:00Z' : '', to: this.to ? this.to + 'T23:59:59Z' : '', page: this.page, limit: this.limit })
      .subscribe(r => { this.items = r.items; this.total = r.total; });
  }

  open(r: RequestView, canAct: boolean) { this.selectedId = r.id; this.canAct = canAct; this.showDetail = true; }
  refresh() { this.loadInbox(); if (this.tab === 'all') this.loadAll(); }
}
