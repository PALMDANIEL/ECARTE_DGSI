import { Component, OnInit } from '@angular/core';
import { MessageService } from 'primeng/api';
import { isAdminRole } from '../../core/auth/role';
import { downloadBlob } from '../admin/download';
import { AdminApiService, OrgUnit } from '../admin/services/admin-api.service';
import { STATUS_LABEL } from '../requests/requests-api.service';
import { BalanceRow, OverdueItem, PilotageApiService, PilotageFilters } from './pilotage-api.service';

const TYPES = [{ code: '', label: 'Tous les types' }, { code: 'DECISION_CONGE', label: 'Décision de congé' }, { code: 'JOUISSANCE_CONGE', label: 'Jouissance de congé' }, { code: 'AUTORISATION_ABSENCE', label: "Autorisation d'absence" }];
const PALETTE = ['#0F8B8D', '#C89B3C', '#12172B', '#D64545', '#7C8099', '#5B8C5A'];

@Component({
  selector: 'app-pilotage',
  standalone: false,
  template: `
    <div class="ec-page">
      <div class="ec-page-header">
        <div><h1 class="ec-display">Pilotage</h1>
          <p class="ec-mono">{{ data?.scope === 'COMPANY' ? 'ENSEMBLE DE L\\'ADMINISTRATION' : 'DEMANDES DE VOTRE CIRCUIT' }}</p></div>
        <button pButton type="button" label="Exporter les demandes (CSV)" icon="pi pi-download" class="p-button-outlined" (click)="exportRequests()"></button>
      </div>

      <div class="ec-panel ec-panel-pad pl-filters">
        <div class="p-field"><label>Du</label><input type="date" class="ec-select" [(ngModel)]="f.from" (change)="load()" /></div>
        <div class="p-field"><label>Au</label><input type="date" class="ec-select" [(ngModel)]="f.to" (change)="load()" /></div>
        <div class="p-field"><label>Démarche</label><select class="ec-select" [(ngModel)]="f.typeCode" (change)="load()"><option *ngFor="let t of types" [value]="t.code">{{ t.label }}</option></select></div>
        <div class="p-field"><label>Statut</label><select class="ec-select" [(ngModel)]="f.status" (change)="load()"><option value="">Tous</option><option *ngFor="let s of statuses" [value]="s">{{ label(s) }}</option></select></div>
        <div class="p-field" *ngIf="units.length"><label>Unité (sous-unités incluses)</label><select class="ec-select" [(ngModel)]="f.orgUnitId" (change)="load()"><option value="">Toutes</option><option *ngFor="let u of units" [value]="u.id">{{ u.name }}</option></select></div>
        <button pButton type="button" label="Réinitialiser" icon="pi pi-times" class="p-button-text" (click)="reset()"></button>
      </div>

      <div class="pl-error" *ngIf="error">{{ error }}</div>

      <ng-container *ngIf="data">
        <div class="pl-tiles">
          <div class="pl-tile"><div class="v">{{ data.requests.submitted }}</div><div class="l ec-mono">DEMANDES DÉPOSÉES</div></div>
          <div class="pl-tile"><div class="v">{{ data.requests.pending }}</div><div class="l ec-mono">EN COURS</div></div>
          <div class="pl-tile"><div class="v">{{ data.requests.approved }}</div><div class="l ec-mono">APPROUVÉES</div></div>
          <div class="pl-tile"><div class="v">{{ data.requests.rejected }}</div><div class="l ec-mono">REJETÉES</div></div>
          <div class="pl-tile"><div class="v">{{ data.requests.returned }}</div><div class="l ec-mono">À CORRIGER</div></div>
          <div class="pl-tile"><div class="v">{{ data.processing.avgDays ?? '—' }}<small *ngIf="data.processing.avgDays !== null"> j</small></div><div class="l ec-mono">DÉLAI MOYEN DE TRAITEMENT</div></div>
          <div class="pl-tile warn" *ngIf="data.delays.overdueNow"><div class="v">{{ data.delays.overdueNow }}</div><div class="l ec-mono">EN RETARD AUJOURD'HUI</div></div>
          <div class="pl-tile"><div class="v">{{ data.delays.escalated }}</div><div class="l ec-mono">ÉTAPES ESCALADÉES</div></div>
        </div>

        <div class="pl-grid">
          <div class="ec-panel ec-panel-pad"><h2 class="pl-title">Demandes par mois</h2>
            <p-chart *ngIf="monthData.labels.length" type="bar" [data]="monthData" [options]="barOptions" height="240px"></p-chart>
            <div class="ec-empty" *ngIf="!monthData.labels.length">Aucune donnée sur la période.</div></div>
          <div class="ec-panel ec-panel-pad"><h2 class="pl-title">Répartition par statut</h2>
            <p-chart *ngIf="statusData.labels.length" type="doughnut" [data]="statusData" [options]="doughnutOptions" height="240px"></p-chart>
            <div class="ec-empty" *ngIf="!statusData.labels.length">Aucune donnée sur la période.</div></div>
        </div>

        <div class="pl-grid">
          <div class="ec-panel"><h2 class="pl-title pad">Par démarche</h2>
            <table class="ec-table"><thead><tr><th>Démarche</th><th>Total</th><th>Approuvées</th><th>Rejetées</th><th>Délai moyen</th></tr></thead>
              <tbody><tr *ngFor="let t of data.requests.byType"><td>{{ t.name }}</td><td>{{ t.count }}</td><td>{{ t.approved }}</td><td>{{ t.rejected }}</td><td>{{ t.avgDays ?? '—' }}</td></tr>
                <tr *ngIf="!data.requests.byType.length"><td colspan="5" class="ec-empty">Aucune donnée</td></tr></tbody></table></div>
          <div class="ec-panel"><h2 class="pl-title pad">Par unité du demandeur</h2>
            <table class="ec-table"><thead><tr><th>Unité</th><th>Demandes</th></tr></thead>
              <tbody><tr *ngFor="let u of data.requests.byUnit"><td>{{ u.name }}</td><td>{{ u.count }}</td></tr>
                <tr *ngIf="!data.requests.byUnit.length"><td colspan="2" class="ec-empty">Aucune donnée</td></tr></tbody></table></div>
        </div>

        <div class="ec-panel"><h2 class="pl-title pad">Délais par autorité (étapes traitées)</h2>
          <table class="ec-table"><thead><tr><th>Autorité / étape</th><th>Étapes traitées</th><th>Délai moyen (jours)</th><th>Traitées en retard</th></tr></thead>
            <tbody><tr *ngFor="let s of data.processing.byStep"><td>{{ s.authority }}</td><td>{{ s.decided }}</td><td>{{ s.avgDays ?? '—' }}</td><td>{{ s.late }}</td></tr>
              <tr *ngIf="!data.processing.byStep.length"><td colspan="4" class="ec-empty">Aucune étape traitée</td></tr></tbody></table></div>

        <div class="pl-grid">
          <div class="ec-panel ec-panel-pad"><h2 class="pl-title">Absences et congés approuvés</h2>
            <p>Jours de jouissance de congé : <strong>{{ data.absences.approvedLeaveEnjoymentDays }}</strong></p>
            <p>Jours d'absence autorisés : <strong>{{ data.absences.approvedAbsenceDays }}</strong></p>
            <ul class="pl-ul"><li *ngFor="let a of data.absences.byType">{{ a.name }} : {{ a.days }} j</li></ul></div>
          <div class="ec-panel ec-panel-pad" *ngIf="data.cards"><h2 class="pl-title">Cartes professionnelles</h2>
            <p>Total : <strong>{{ data.cards.total }}</strong> · Actives : <strong>{{ data.cards.active }}</strong> · Suspendues : <strong>{{ data.cards.suspended }}</strong></p>
            <p>Révoquées : <strong>{{ data.cards.revoked }}</strong> · Expirées : <strong>{{ data.cards.expired }}</strong> · À renouveler sous 30 j : <strong>{{ data.cards.expiringSoon }}</strong></p></div>
        </div>
      </ng-container>

      <ng-container *ngIf="admin">
        <div class="ec-panel" style="margin-top:16px">
          <div class="pl-head"><h2 class="pl-title pad">Demandes en retard</h2>
            <button pButton type="button" label="Lancer le balayage des délais" icon="pi pi-refresh" class="p-button-text" (click)="sweep()"></button></div>
          <table class="ec-table"><thead><tr><th>Référence</th><th>Démarche</th><th>Demandeur</th><th>Étape</th><th>Échéance</th><th>Retard</th><th>Suivi</th></tr></thead>
            <tbody><tr *ngFor="let o of overdue"><td>{{ o.reference }}</td><td>{{ o.type }}</td><td>{{ o.applicant }}</td><td>{{ o.titleSnapshot || o.step }}</td><td>{{ o.dueAt | date:'dd/MM/yyyy' }}</td><td>{{ o.daysLate }} j</td>
              <td><span class="ec-badge" *ngIf="o.escalatedAt">Escaladée</span><span class="ec-badge" *ngIf="!o.escalatedAt && o.reminderSentAt">Rappel envoyé</span></td></tr>
              <tr *ngIf="!overdue.length"><td colspan="7" class="ec-empty">Aucune demande en retard.</td></tr></tbody></table>
        </div>

        <div class="ec-panel" style="margin-top:16px">
          <div class="pl-head"><h2 class="pl-title pad">Droits et soldes de congé</h2>
            <div class="ec-toolbar-row" style="margin:0 16px 0 0"><label class="ec-mono">Année</label><input type="number" class="ec-select" style="width:90px" [(ngModel)]="year" (change)="loadBalances()" />
              <button pButton type="button" label="Exporter (CSV)" icon="pi pi-download" class="p-button-text" (click)="exportBalances()"></button></div></div>
          <table class="ec-table"><thead><tr><th>Matricule</th><th>Agent</th><th>Unité</th><th>Acquis</th><th>Autorisés</th><th>Consommés</th><th>Régularisations</th><th>Solde</th><th>Absences (j)</th></tr></thead>
            <tbody><tr *ngFor="let b of balances"><td>{{ b.matricule }}</td><td>{{ b.name }}</td><td>{{ b.unit || '—' }}</td><td>{{ b.acquired }}</td><td>{{ b.authorized }}</td><td>{{ b.consumed }}</td><td>{{ b.adjustments }}</td><td><strong>{{ b.remaining }}</strong></td><td>{{ b.absenceDays }}</td></tr>
              <tr *ngIf="!balances.length"><td colspan="9" class="ec-empty">Aucun agent.</td></tr></tbody></table>
        </div>
      </ng-container>
    </div>
  `,
  styles: [`
    .pl-filters { display: flex; flex-wrap: wrap; gap: 12px; align-items: flex-end; margin-bottom: 16px; }
    .pl-filters .p-field { margin: 0; min-width: 150px; }
    .pl-tiles { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 14px; margin-bottom: 16px; }
    .pl-tile { background: var(--ec-paper-raised); border: 1px solid var(--ec-line); border-radius: 14px; padding: 18px; }
    .pl-tile.warn { border-color: var(--ec-coral); } .pl-tile.warn .v { color: var(--ec-coral); }
    .pl-tile .v { font-family: var(--ec-font-display); font-size: 1.8rem; font-weight: 600; color: var(--ec-ink); line-height: 1; }
    .pl-tile .v small { font-size: .9rem; } .pl-tile .l { font-size: .62rem; color: var(--ec-ink-soft); margin-top: 8px; }
    .pl-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(340px, 1fr)); gap: 16px; margin-bottom: 16px; }
    .pl-title { font-family: var(--ec-font-display); font-size: 1.05rem; margin: 0 0 12px; } .pl-title.pad { padding: 16px 16px 0; margin: 0 0 4px; }
    .pl-head { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; }
    .pl-ul { margin: 6px 0 0; padding-left: 18px; }
    .pl-error { background: #FBEAEA; color: #8a2d2d; padding: 10px 14px; border-radius: 8px; margin-bottom: 12px; }
  `]
})
export class PilotageComponent implements OnInit {
  admin = isAdminRole();
  types = TYPES;
  statuses = ['IN_PROGRESS', 'RETURNED', 'APPROVED', 'REJECTED', 'CANCELLED'];
  f: PilotageFilters = { from: '', to: '', typeCode: '', status: '', orgUnitId: '' };
  units: OrgUnit[] = [];
  data: any = null;
  error = '';
  overdue: OverdueItem[] = [];
  balances: BalanceRow[] = [];
  year = new Date().getFullYear();
  monthData: any = { labels: [], datasets: [] };
  statusData: any = { labels: [], datasets: [] };
  barOptions = { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { precision: 0 } } } };
  doughnutOptions = { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } };

  constructor(private api: PilotageApiService, private adminApi: AdminApiService, private messages: MessageService) {}

  label(s: string) { return STATUS_LABEL[s] || s; }

  ngOnInit() {
    if (this.admin) { this.adminApi.orgUnits().subscribe(u => (this.units = u.filter(x => x.isActive))); this.loadOverdue(); this.loadBalances(); }
    this.load();
  }

  private clean(): PilotageFilters {
    return { ...this.f, from: this.f.from ? `${this.f.from}` : '', to: this.f.to ? `${this.f.to}` : '' };
  }

  load() {
    this.error = '';
    this.api.overview(this.clean()).subscribe({
      next: d => {
        this.data = d;
        this.monthData = { labels: d.requests.byMonth.map((m: any) => m.month), datasets: [{ label: 'Demandes', data: d.requests.byMonth.map((m: any) => m.count), backgroundColor: '#0F8B8D' }] };
        const st = Object.entries(d.requests.byStatus as Record<string, number>);
        this.statusData = { labels: st.map(([k]) => this.label(k)), datasets: [{ data: st.map(([, v]) => v), backgroundColor: PALETTE }] };
      },
      error: e => { this.data = null; this.error = e.error?.message || 'Chargement impossible'; }
    });
  }

  reset() { this.f = { from: '', to: '', typeCode: '', status: '', orgUnitId: '' }; this.load(); }
  loadOverdue() { this.api.overdue().subscribe(o => (this.overdue = o)); }
  loadBalances() { this.api.balances(this.year, this.f.orgUnitId || undefined).subscribe({ next: b => (this.balances = b), error: () => (this.balances = []) }); }
  sweep() {
    this.api.runSweep().subscribe(r => {
      this.messages.add({ severity: 'success', summary: 'Balayage terminé', detail: `${r.reminders} rappel(s), ${r.escalations} escalade(s) sur ${r.checked} étape(s) en retard` });
      this.loadOverdue(); this.load();
    });
  }
  exportRequests() { this.api.requestsCsv(this.clean()).subscribe(b => downloadBlob(b, 'demandes.csv')); }
  exportBalances() { this.api.balancesCsv(this.year, this.f.orgUnitId || undefined).subscribe(b => downloadBlob(b, `soldes-${this.year}.csv`)); }
}
