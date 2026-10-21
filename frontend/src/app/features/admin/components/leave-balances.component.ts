import { Component, OnInit } from '@angular/core';
import { MessageService } from 'primeng/api';
import { AdminApiService, Agent, LeaveControl, LeaveOverview, LedgerEntry } from '../services/admin-api.service';
import { downloadBlob } from '../download';

const NATURE: Record<string, string> = { ACQUIS: 'Droit acquis', REPORT: 'Report', CONSOMME: 'Consommation', REGULARISATION: 'Régularisation' };

@Component({
  selector: 'app-leave-balances',
  standalone: false,
  template: `
    <div class="ec-page">
      <div class="ec-page-header">
        <div>
          <h1 class="ec-display">Droits et soldes</h1>
          <p class="ec-mono">CONGÉ ANNUEL ET AUTORISATIONS D'ABSENCE — REGISTRE EN ÉCRITURE SEULE</p>
        </div>
      </div>

      <div class="ec-toolbar-row">
        <select class="ec-select" style="max-width:380px" [(ngModel)]="agentId" (ngModelChange)="load()">
          <option value="">— Choisir un agent —</option>
          <option *ngFor="let a of agents" [value]="a.id">{{ a.lastName | uppercase }} {{ a.firstName }} ({{ a.profile.matricule }})</option>
        </select>
        <select class="ec-select" style="max-width:120px" [(ngModel)]="year" (ngModelChange)="load()"><option *ngFor="let y of years" [ngValue]="y">{{ y }}</option></select>
        <button pButton type="button" label="Régulariser" icon="pi pi-pencil" class="p-button-warning" [disabled]="!agentId" (click)="openReg()"></button>
      </div>

      <div *ngIf="ov">
        <div class="ec-error-box" *ngIf="!ov.entitlement.eligible">{{ ov.entitlement.reason }}</div>
        <div class="ec-info-box" *ngIf="ov.entitlement.eligible">Droit {{ year }} : <b>{{ ov.entitlement.days }} jours</b>{{ ov.entitlement.eligibleFrom ? ' — ouvert depuis le ' + (ov.entitlement.eligibleFrom | date:'dd/MM/yyyy') : '' }} (période du {{ ov.entitlement.period.from | date:'dd/MM/yyyy' }} au {{ ov.entitlement.period.to | date:'dd/MM/yyyy' }}).</div>

        <h2 class="ec-section-title">Congé annuel</h2>
        <div class="ec-panel">
          <table class="ec-table">
            <thead><tr><th>Acquis</th><th>Report</th><th>Régularisations</th><th>Consommé</th><th>Solde</th><th>Ouvert par décision</th><th>Reste à prendre</th></tr></thead>
            <tbody><tr>
              <td>{{ ov.annual.acquired }}</td><td>{{ ov.annual.carriedOver }}</td><td>{{ ov.annual.adjustments }}</td><td>{{ ov.annual.consumed }}</td>
              <td><span class="ec-badge" [class.ok]="ov.annual.remaining >= 0" [class.bad]="ov.annual.remaining < 0">{{ ov.annual.remaining }} j</span></td>
              <td>{{ ov.annual.decided }}</td><td>{{ ov.annual.takeable }}</td>
            </tr></tbody>
          </table>
        </div>
        <div class="ec-panel" *ngIf="ov.decisions.length">
          <table class="ec-table">
            <thead><tr><th>Décision N°</th><th>Jours</th><th>Délivrée le</th><th>Statut</th><th></th></tr></thead>
            <tbody><tr *ngFor="let d of ov.decisions">
              <td class="ec-mono-text">{{ d.number }}</td><td>{{ d.days }}</td><td>{{ d.issuedAt | date:'dd/MM/yyyy' }}</td>
              <td><span class="ec-badge" [class.ok]="d.status === 'VALID'" [class.bad]="d.status !== 'VALID'">{{ d.status === 'VALID' ? 'Valide' : 'Annulée' }}</span></td>
              <td class="ec-cell-actions"><button class="ec-icon-btn danger" *ngIf="d.status === 'VALID'" (click)="openCancel(d)" title="Annuler la décision"><i class="pi pi-ban"></i></button></td>
            </tr></tbody>
          </table>
        </div>

        <h2 class="ec-section-title">Autorisations d'absence</h2>
        <div class="ec-panel">
          <table class="ec-table">
            <thead><tr><th>Type</th><th>Plafond annuel</th><th>Consommé</th><th>Réservé (en cours)</th><th>Reste</th></tr></thead>
            <tbody><tr *ngFor="let a of ov.absences">
              <td><b>{{ a.name }}</b><br /><span class="ec-hint">{{ a.legalReference }}</span></td>
              <td>{{ a.cap === null ? 'Aucun plafond' : a.cap + ' j' }}</td><td>{{ a.consumed }}</td><td>{{ a.reserved }}</td>
              <td><span class="ec-badge" [class.ok]="a.remaining === null || a.remaining > 0" [class.warn]="a.remaining === 0" [class.bad]="a.remaining !== null && a.remaining < 0">{{ a.remaining === null ? '—' : a.remaining + ' j' }}</span></td>
            </tr></tbody>
          </table>
        </div>

        <h2 class="ec-section-title">Historique du registre</h2>
        <div class="ec-panel">
          <table class="ec-table">
            <thead><tr><th>Date</th><th>Droit</th><th>Année</th><th>Nature</th><th>Jours</th><th>Motif</th></tr></thead>
            <tbody>
              <tr *ngFor="let e of ledger"><td>{{ e.createdAt | date:'dd/MM/yyyy HH:mm' }}</td><td class="ec-mono-text">{{ e.leaveType }}</td><td>{{ e.year }}</td><td>{{ nature(e.nature) }}</td>
                <td [style.color]="e.days < 0 ? 'var(--ec-coral)' : 'var(--ec-teal)'"><b>{{ e.days > 0 ? '+' : '' }}{{ e.days }}</b></td><td>{{ e.reason || '—' }}</td></tr>
              <tr *ngIf="!ledger.length"><td colspan="6" class="ec-empty">Aucune écriture.</td></tr>
            </tbody>
          </table>
        </div>
      </div>

      <h2 class="ec-section-title">Contrôles administratifs</h2>
      <div class="ec-panel">
        <table class="ec-table">
          <tbody>
            <tr *ngFor="let c of controls"><td><span class="ec-badge warn">{{ c.type }}</span></td><td>{{ c.label }}</td><td>{{ c.detail }}</td></tr>
            <tr *ngIf="!controls.length"><td class="ec-empty">Aucune anomalie détectée.</td></tr>
          </tbody>
        </table>
      </div>

      <app-csv-import title="Reprise de soldes : importer des ajustements (CSV)"
        help="Colonnes : matricule ; annee ; type (CONGE_ANNUEL ou code d'un type d'absence) ; jours (signé : -12 = 12 jours déjà pris) ; motif. Chaque ligne crée une écriture de régularisation datée et journalisée."
        [runImport]="runImport" (download)="template()" (imported)="load(); loadControls()"></app-csv-import>

      <p-dialog header="Régularisation" [(visible)]="showReg" [modal]="true" [style]="{ width: '34rem' }">
        <div class="ec-info-box">Le registre est en écriture seule : une erreur se corrige par une écriture compensatoire, jamais par modification. Un nombre <b>négatif</b> retire des jours, un nombre <b>positif</b> en rend.</div>
        <div class="ec-form-grid">
          <div class="p-field"><label>Droit *</label><select class="ec-select" [(ngModel)]="regType"><option value="CONGE_ANNUEL">Congé annuel</option><option *ngFor="let a of ov?.absences" [value]="a.code">{{ a.name }}</option></select></div>
          <div class="p-field"><label>Année *</label><select class="ec-select" [(ngModel)]="regYear"><option *ngFor="let y of years" [ngValue]="y">{{ y }}</option></select></div>
          <div class="p-field"><label>Jours (signé) *</label><input pInputText type="number" step="0.5" [(ngModel)]="regDays" /></div>
          <div class="p-field full"><label>Motif (obligatoire, 5 caractères min.) *</label><input pInputText [(ngModel)]="regReason" /></div>
        </div>
        <div class="ec-error-box" *ngIf="error">{{ error }}</div>
        <div class="ec-form-actions"><button type="button" pButton label="Annuler" class="p-button-text" (click)="showReg = false"></button>
          <button type="button" pButton label="Enregistrer" icon="pi pi-check" [disabled]="!regDays || regReason.trim().length < 5" (click)="saveReg()"></button></div>
      </p-dialog>

      <p-dialog header="Annuler la décision de congé" [(visible)]="showCancel" [modal]="true" [style]="{ width: '30rem' }">
        <p>Décision <b>{{ cancelTarget?.number }}</b>. L'annulation est impossible si des jouissances y sont rattachées.</p>
        <div class="p-field"><label>Motif *</label><input pInputText [(ngModel)]="cancelReason" /></div>
        <div class="ec-error-box" *ngIf="error" style="margin-top:8px">{{ error }}</div>
        <div class="ec-form-actions"><button type="button" pButton label="Fermer" class="p-button-text" (click)="showCancel = false"></button>
          <button type="button" pButton label="Annuler la décision" icon="pi pi-ban" class="p-button-danger" [disabled]="cancelReason.trim().length < 5" (click)="doCancel()"></button></div>
      </p-dialog>
    </div>
  `
})
export class LeaveBalancesComponent implements OnInit {
  agents: Agent[] = [];
  agentId = '';
  year = new Date().getFullYear();
  years = [this.year - 2, this.year - 1, this.year, this.year + 1];
  ov: LeaveOverview | null = null;
  ledger: LedgerEntry[] = [];
  controls: LeaveControl[] = [];
  showReg = false; regType = 'CONGE_ANNUEL'; regYear = this.year; regDays: number | null = null; regReason = '';
  showCancel = false; cancelTarget: { id: string; number: string } | null = null; cancelReason = '';
  error = '';
  runImport = (csv: string, dryRun: boolean) => this.api.importAdjustments(csv, dryRun);

  constructor(private api: AdminApiService, private messages: MessageService) {}

  ngOnInit() { this.api.agents({ limit: 200 }).subscribe(r => (this.agents = r.items)); this.loadControls(); }
  nature(n: string) { return NATURE[n] || n; }
  loadControls() { this.api.leaveControls().subscribe(c => (this.controls = c)); }

  load() {
    if (!this.agentId) { this.ov = null; this.ledger = []; return; }
    this.api.leaveOverview(this.agentId, this.year).subscribe({ next: o => (this.ov = o), error: e => this.messages.add({ severity: 'error', summary: 'Erreur', detail: e.error?.message || 'Chargement impossible' }) });
    this.api.leaveLedger(this.agentId, this.year).subscribe(l => (this.ledger = l));
  }

  openReg() { this.error = ''; this.regType = 'CONGE_ANNUEL'; this.regYear = this.year; this.regDays = null; this.regReason = ''; this.showReg = true; }
  saveReg() {
    this.api.regularise({ agentId: this.agentId, leaveType: this.regType, year: Number(this.regYear), days: Number(this.regDays), reason: this.regReason.trim() }).subscribe({
      next: () => { this.showReg = false; this.messages.add({ severity: 'success', summary: 'Régularisation enregistrée', detail: 'Écriture ajoutée au registre' }); this.load(); this.loadControls(); },
      error: e => { this.error = e.error?.message || 'Enregistrement impossible'; }
    });
  }

  openCancel(d: { id: string; number: string }) { this.error = ''; this.cancelTarget = d; this.cancelReason = ''; this.showCancel = true; }
  doCancel() {
    if (!this.cancelTarget) return;
    this.api.cancelDecision(this.cancelTarget.id, this.cancelReason.trim()).subscribe({
      next: () => { this.showCancel = false; this.messages.add({ severity: 'success', summary: 'Décision annulée', detail: this.cancelTarget!.number }); this.load(); },
      error: e => { this.error = e.error?.message || 'Annulation impossible'; }
    });
  }

  template() { this.api.adjustmentsTemplate().subscribe(b => downloadBlob(b, 'modele-ajustements.csv')); }
}
