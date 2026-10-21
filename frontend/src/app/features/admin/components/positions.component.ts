import { Component, OnInit, inject } from '@angular/core';
import { FormBuilder, Validators } from '@angular/forms';
import { ConfirmationService, MessageService } from 'primeng/api';
import { AdminApiService, Agent, Delegation, OrgUnit, Position } from '../services/admin-api.service';

@Component({
  selector: 'app-positions',
  standalone: false,
  template: `
    <div class="ec-page">
      <div class="ec-page-header">
        <div>
          <h1 class="ec-display">Postes et délégations</h1>
          <p class="ec-mono">AUTORITÉS COMPÉTENTES POUR LES AVIS ET DÉCISIONS</p>
        </div>
        <button pButton label="Nouveau poste" icon="pi pi-plus" class="p-button-success" (click)="openPosition()"></button>
      </div>

      <div class="ec-panel">
        <table class="ec-table">
          <thead><tr><th>Poste</th><th>Code</th><th>Unité</th><th>Titulaire</th><th></th></tr></thead>
          <tbody>
            <tr *ngFor="let p of positions" [style.opacity]="p.isActive ? 1 : 0.55">
              <td>{{ p.label }}</td>
              <td class="ec-mono-text">{{ p.code }}</td>
              <td>{{ p.orgUnit?.name || '—' }}</td>
              <td>
                <ng-container *ngIf="p.holder; else vacant">{{ p.holder.firstName }} {{ p.holder.lastName }}</ng-container>
                <ng-template #vacant><span class="ec-badge warn">Vacant</span></ng-template>
                <span class="ec-badge" style="margin-left:6px" *ngFor="let d of p.activeDelegations" [title]="'Délégation jusqu\\'au ' + (d.endsAt | date:'dd/MM/yyyy')">Délégué : {{ d.delegate.firstName }}</span>
              </td>
              <td class="ec-cell-actions">
                <button class="ec-icon-btn" (click)="openHolder(p)" title="Affecter un titulaire"><i class="pi pi-user-edit"></i></button>
                <button class="ec-icon-btn" (click)="openPosition(p)" title="Modifier"><i class="pi pi-pencil"></i></button>
                <button class="ec-icon-btn danger" (click)="removePosition(p)" title="Supprimer"><i class="pi pi-trash"></i></button>
              </td>
            </tr>
            <tr *ngIf="!positions.length"><td colspan="5" class="ec-empty">Aucun poste. Exemples : Ministre, Secrétaire Général, Chef du service RH…</td></tr>
          </tbody>
        </table>
      </div>

      <div class="ec-toolbar-row"><h2 class="ec-section-title" style="margin:0; flex:1">Délégations de signature</h2>
        <button pButton label="Nouvelle délégation" icon="pi pi-plus" class="p-button-warning" (click)="openDelegation()" [disabled]="!positions.length"></button></div>
      <div class="ec-panel">
        <table class="ec-table">
          <thead><tr><th>Poste</th><th>Délégataire</th><th>Du</th><th>Au</th><th>Démarches</th><th></th></tr></thead>
          <tbody>
            <tr *ngFor="let d of delegations">
              <td>{{ d.position.label }}</td><td>{{ d.delegate.firstName }} {{ d.delegate.lastName }}</td>
              <td>{{ d.startsAt | date:'dd/MM/yyyy' }}</td><td>{{ d.endsAt | date:'dd/MM/yyyy' }}</td>
              <td>{{ d.requestTypes.length ? d.requestTypes.join(', ') : 'Toutes' }}</td>
              <td class="ec-cell-actions"><button class="ec-icon-btn danger" (click)="removeDelegation(d)" title="Supprimer"><i class="pi pi-trash"></i></button></td>
            </tr>
            <tr *ngIf="!delegations.length"><td colspan="6" class="ec-empty">Aucune délégation.</td></tr>
          </tbody>
        </table>
      </div>

      <p-dialog [header]="editing ? 'Modifier le poste' : 'Nouveau poste'" [(visible)]="showPosition" [modal]="true" [style]="{ width: '34rem' }">
        <form [formGroup]="posForm" (ngSubmit)="savePosition()">
          <div class="ec-form-grid">
            <div class="p-field"><label>Code *</label><input pInputText formControlName="code" placeholder="CHEF_SERVICE_RH" [readonly]="!!editing" /></div>
            <div class="p-field"><label>Civilité du titulaire</label>
              <select class="ec-select" formControlName="civility"><option value="">—</option><option value="M">Monsieur</option><option value="MME">Madame</option></select></div>
            <div class="p-field full"><label>Intitulé *</label><input pInputText formControlName="label" placeholder="Chef du service des ressources humaines" /></div>
            <div class="p-field full"><label>Unité</label>
              <select class="ec-select" formControlName="orgUnitId"><option value="">— Aucune —</option><option *ngFor="let u of units" [value]="u.id">{{ u.name }} ({{ u.code }})</option></select></div>
            <div class="p-field"><label>Niveau hiérarchique</label><input pInputText type="number" min="0" formControlName="level" />
              <p class="ec-hint">0 = le plus élevé (ex. Ministre).</p></div>
            <div class="p-field" *ngIf="editing"><label><input type="checkbox" formControlName="isActive" /> Poste actif</label></div>
          </div>
          <div class="ec-error-box" *ngIf="error">{{ error }}</div>
          <div class="ec-form-actions"><button type="button" pButton label="Annuler" class="p-button-text" (click)="showPosition = false"></button>
            <button type="submit" pButton label="Enregistrer" icon="pi pi-check" [disabled]="posForm.invalid"></button></div>
        </form>
      </p-dialog>

      <p-dialog header="Affecter un titulaire" [(visible)]="showHolder" [modal]="true" [style]="{ width: '30rem' }">
        <p *ngIf="holderPos">Poste : <b>{{ holderPos.label }}</b><br /><span class="ec-hint">Le titulaire actuel sera clôturé à la date de prise de fonction.</span></p>
        <div class="p-field"><label>Agent *</label>
          <select class="ec-select" [(ngModel)]="holderUser"><option value="">—</option><option *ngFor="let a of agents" [value]="a.id">{{ a.lastName | uppercase }} {{ a.firstName }} ({{ a.profile.matricule }})</option></select></div>
        <div class="p-field" style="margin-top:10px"><label>Prise de fonction</label><input pInputText type="date" [(ngModel)]="holderDate" /></div>
        <div class="ec-error-box" *ngIf="error" style="margin-top:10px">{{ error }}</div>
        <div class="ec-form-actions">
          <button type="button" pButton label="Retirer le titulaire" class="p-button-text" *ngIf="holderPos?.holder" (click)="endHolder()"></button>
          <button type="button" pButton label="Affecter" icon="pi pi-check" [disabled]="!holderUser" (click)="assign()"></button>
        </div>
      </p-dialog>

      <p-dialog header="Nouvelle délégation" [(visible)]="showDelegation" [modal]="true" [style]="{ width: '34rem' }">
        <form [formGroup]="delForm" (ngSubmit)="saveDelegation()">
          <div class="ec-form-grid">
            <div class="p-field full"><label>Poste délégué *</label>
              <select class="ec-select" formControlName="positionId"><option value="">—</option><option *ngFor="let p of positions" [value]="p.id">{{ p.label }}</option></select></div>
            <div class="p-field full"><label>Délégataire *</label>
              <select class="ec-select" formControlName="delegateId"><option value="">—</option><option *ngFor="let a of agents" [value]="a.id">{{ a.lastName | uppercase }} {{ a.firstName }} ({{ a.profile.matricule }})</option></select></div>
            <div class="p-field"><label>Du *</label><input pInputText type="date" formControlName="startsAt" /></div>
            <div class="p-field"><label>Au *</label><input pInputText type="date" formControlName="endsAt" /></div>
            <div class="p-field full"><label>Motif</label><input pInputText formControlName="reason" placeholder="Mission, congé…" /></div>
          </div>
          <div class="ec-error-box" *ngIf="error">{{ error }}</div>
          <div class="ec-form-actions"><button type="button" pButton label="Annuler" class="p-button-text" (click)="showDelegation = false"></button>
            <button type="submit" pButton label="Enregistrer" icon="pi pi-check" [disabled]="delForm.invalid"></button></div>
        </form>
      </p-dialog>
    </div>
  `
})
export class PositionsComponent implements OnInit {
  private fb = inject(FormBuilder);
  positions: Position[] = []; delegations: Delegation[] = []; units: OrgUnit[] = []; agents: Agent[] = [];
  error = ''; editing: Position | null = null;
  showPosition = false; showHolder = false; showDelegation = false;
  holderPos: Position | null = null; holderUser = ''; holderDate = '';

  posForm = this.fb.group({ code: ['', Validators.required], label: ['', Validators.required], civility: [''], orgUnitId: [''], level: [0], isActive: [true] });
  delForm = this.fb.group({ positionId: ['', Validators.required], delegateId: ['', Validators.required], startsAt: ['', Validators.required], endsAt: ['', Validators.required], reason: [''] });

  constructor(private api: AdminApiService, private messages: MessageService, private confirm: ConfirmationService) {}

  ngOnInit() {
    this.api.orgUnits().subscribe(u => (this.units = u.filter(x => x.isActive)));
    this.api.agents({ limit: 200 }).subscribe(r => (this.agents = r.items.filter(a => a.isActive)));
    this.load();
  }

  load() {
    this.api.positions().subscribe(p => (this.positions = p));
    this.api.delegations().subscribe(d => (this.delegations = d));
  }

  private fail(err: any, fallback: string) { this.error = err.error?.message || fallback; }
  private ok(detail: string) { this.messages.add({ severity: 'success', summary: 'Enregistré', detail }); }

  openPosition(p?: Position) {
    this.editing = p || null; this.error = '';
    this.posForm.reset(p ? { code: p.code, label: p.label, civility: p.civility || '', orgUnitId: p.orgUnitId || '', level: p.level, isActive: p.isActive } : { code: '', label: '', civility: '', orgUnitId: '', level: 0, isActive: true });
    this.showPosition = true;
  }

  savePosition() {
    const v = this.posForm.value;
    const body: any = { code: v.code, label: v.label, civility: v.civility || null, orgUnitId: v.orgUnitId || null, level: Number(v.level) || 0 };
    const req = this.editing ? this.api.updatePosition(this.editing.id, { label: body.label, civility: body.civility, orgUnitId: body.orgUnitId, level: body.level, isActive: v.isActive }) : this.api.createPosition({ ...body, civility: body.civility || undefined, orgUnitId: body.orgUnitId || undefined });
    req.subscribe({ next: () => { this.showPosition = false; this.ok('Poste enregistré'); this.load(); }, error: e => this.fail(e, 'Enregistrement impossible') });
  }

  removePosition(p: Position) {
    this.confirm.confirm({
      message: `Supprimer le poste « ${p.label} » ?`,
      accept: () => this.api.deletePosition(p.id).subscribe({
        next: () => { this.ok('Poste supprimé'); this.load(); },
        error: e => this.messages.add({ severity: 'error', summary: 'Suppression impossible', detail: e.error?.message || 'Erreur', life: 8000 })
      })
    });
  }

  openHolder(p: Position) { this.holderPos = p; this.holderUser = ''; this.holderDate = ''; this.error = ''; this.showHolder = true; }

  assign() {
    if (!this.holderPos) return;
    this.api.assignHolder(this.holderPos.id, this.holderUser, this.holderDate || undefined).subscribe({
      next: () => { this.showHolder = false; this.ok('Titulaire affecté'); this.load(); }, error: e => this.fail(e, 'Affectation impossible')
    });
  }

  endHolder() {
    if (!this.holderPos) return;
    this.api.endHolder(this.holderPos.id).subscribe({ next: () => { this.showHolder = false; this.ok('Titulaire retiré'); this.load(); }, error: e => this.fail(e, 'Action impossible') });
  }

  openDelegation() { this.error = ''; this.delForm.reset({ positionId: '', delegateId: '', startsAt: '', endsAt: '', reason: '' }); this.showDelegation = true; }

  saveDelegation() {
    const v = this.delForm.value;
    // La fin de délégation inclut le dernier jour entier
    this.api.createDelegation({ positionId: v.positionId, delegateId: v.delegateId, startsAt: v.startsAt, endsAt: new Date(new Date(v.endsAt!).getTime() + 86399000).toISOString(), reason: v.reason || undefined }).subscribe({
      next: () => { this.showDelegation = false; this.ok('Délégation enregistrée'); this.load(); }, error: e => this.fail(e, 'Enregistrement impossible')
    });
  }

  removeDelegation(d: Delegation) {
    this.confirm.confirm({ message: 'Supprimer cette délégation ?', accept: () => this.api.deleteDelegation(d.id).subscribe({ next: () => { this.ok('Délégation supprimée'); this.load(); } }) });
  }
}
