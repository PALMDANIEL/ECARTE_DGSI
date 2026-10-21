import { Component, OnInit } from '@angular/core';
import { MessageService } from 'primeng/api';
import { AdminApiService, RuleOverride, RuleParam } from '../services/admin-api.service';

@Component({
  selector: 'app-rules',
  standalone: false,
  template: `
    <div class="ec-page">
      <div class="ec-page-header">
        <div>
          <h1 class="ec-display">Paramètres et règles</h1>
          <p class="ec-mono">TOUTE MODIFICATION EST VERSIONNÉE ET JOURNALISÉE</p>
        </div>
      </div>
      <div class="ec-info-box">Une modification ne réécrit jamais l'historique : la valeur précédente est clôturée et la nouvelle s'applique à partir de la date indiquée. Les droits déjà inscrits au registre et les décisions déjà rendues ne sont pas modifiés. Les paramètres portant une référence réglementaire reprennent un texte officiel vérifié.</div>

      <ng-container *ngFor="let g of groups()">
        <h2 class="ec-section-title">{{ g }}</h2>
        <div class="ec-panel">
          <table class="ec-table">
            <thead><tr><th>Paramètre</th><th>Valeur en vigueur</th><th>Par défaut</th><th>Référence</th><th></th></tr></thead>
            <tbody>
              <tr *ngFor="let r of byGroup(g)">
                <td style="max-width:360px"><b>{{ r.description }}</b><br /><span class="ec-mono-text">{{ r.key }}</span></td>
                <td><span class="ec-badge" [class.ok]="r.isCustom">{{ show(r, r.value) }}</span></td>
                <td>{{ show(r, r.defaultValue) }}</td>
                <td style="max-width:200px">{{ r.legalReference || '—' }}</td>
                <td class="ec-cell-actions">
                  <button class="ec-icon-btn" (click)="openEdit(r)" title="Modifier"><i class="pi pi-pencil"></i></button>
                  <button class="ec-icon-btn" (click)="history = history === r ? null : r" title="Historique"><i class="pi pi-history"></i></button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </ng-container>

      <div class="ec-panel ec-panel-pad" *ngIf="history">
        <strong>Historique — {{ history.description }}</strong>
        <table class="ec-table" style="margin-top:8px">
          <thead><tr><th>Valeur</th><th>Début</th><th>Fin</th><th>Référence</th><th>Commentaire</th></tr></thead>
          <tbody>
            <tr *ngFor="let h of history.history"><td>{{ h.value }}</td><td>{{ h.validFrom | date:'dd/MM/yyyy HH:mm' }}</td><td>{{ h.validTo ? (h.validTo | date:'dd/MM/yyyy HH:mm') : 'En vigueur' }}</td><td>{{ h.legalReference || '—' }}</td><td>{{ h.comment || '—' }}</td></tr>
            <tr *ngIf="!history.history.length"><td colspan="5" class="ec-empty">Valeur par défaut, jamais modifiée.</td></tr>
          </tbody>
        </table>
      </div>

      <h2 class="ec-section-title">Surcharges par régime</h2>
      <div class="ec-info-box">Pour un régime autre que « Fonctionnaire » (contractuel, enseignant), les droits ne sont pas calculés tant que le droit annuel du régime n'est pas paramétré ici (art. 54 : régime des enseignants fixé à part).</div>
      <div class="ec-panel">
        <table class="ec-table">
          <thead><tr><th>Régime</th><th>Paramètre</th><th>Valeur</th><th></th></tr></thead>
          <tbody>
            <tr *ngFor="let o of overrides"><td><span class="ec-badge">{{ o.regime }}</span></td><td>{{ o.description }}</td><td>{{ o.value === null ? '(retirée)' : o.value }}</td>
              <td class="ec-cell-actions"><button class="ec-icon-btn danger" *ngIf="o.value !== null" (click)="clear(o)" title="Retirer la surcharge"><i class="pi pi-trash"></i></button></td></tr>
            <tr *ngIf="!overrides.length"><td colspan="4" class="ec-empty">Aucune surcharge.</td></tr>
          </tbody>
        </table>
        <div class="ec-form-actions" style="padding: 8px 16px 12px"><button pButton type="button" label="Ajouter une surcharge" icon="pi pi-plus" class="p-button-text" (click)="openOverride()"></button></div>
      </div>

      <p-dialog header="Modifier le paramètre" [(visible)]="showEdit" [modal]="true" [style]="{ width: '34rem' }">
        <ng-container *ngIf="editing">
          <p><b>{{ editing.description }}</b></p>
          <div class="ec-form-grid">
            <div class="p-field full"><label>Nouvelle valeur *</label>
              <input *ngIf="editing.type === 'number'" pInputText type="number" [attr.min]="editing.min" [(ngModel)]="value" />
              <input *ngIf="editing.type === 'string'" pInputText [(ngModel)]="value" />
              <select *ngIf="editing.type === 'boolean'" class="ec-select" [(ngModel)]="value"><option [ngValue]="true">Oui</option><option [ngValue]="false">Non</option></select>
              <select *ngIf="editing.type === 'enum'" class="ec-select" [(ngModel)]="value"><option *ngFor="let o of editing.options" [ngValue]="o.value">{{ o.label }}</option></select>
            </div>
            <div class="p-field"><label>S'applique à partir du</label><input pInputText type="date" [(ngModel)]="validFrom" /></div>
            <div class="p-field"><label>Référence réglementaire</label><input pInputText [(ngModel)]="legalReference" placeholder="Ex. Décret n°…, art. …" /></div>
            <div class="p-field full"><label>Commentaire</label><input pInputText [(ngModel)]="comment" /></div>
          </div>
          <div class="ec-error-box" *ngIf="error">{{ error }}</div>
          <div class="ec-form-actions">
            <button type="button" pButton label="Annuler" class="p-button-text" (click)="showEdit = false"></button>
            <button type="button" pButton label="Enregistrer" icon="pi pi-check" (click)="save()"></button>
          </div>
        </ng-container>
      </p-dialog>

      <p-dialog header="Surcharge par régime" [(visible)]="showOverride" [modal]="true" [style]="{ width: '34rem' }">
        <div class="ec-form-grid">
          <div class="p-field"><label>Régime *</label><select class="ec-select" [(ngModel)]="ovRegime"><option *ngFor="let r of regimes" [value]="r">{{ r }}</option></select></div>
          <div class="p-field"><label>Paramètre *</label><select class="ec-select" [(ngModel)]="ovKey" (ngModelChange)="pickOverride()"><option *ngFor="let r of overridable()" [value]="r.key">{{ r.description }}</option></select></div>
          <div class="p-field full" *ngIf="ovParam"><label>Valeur *</label>
            <input *ngIf="ovParam.type === 'number'" pInputText type="number" [(ngModel)]="ovValue" />
            <input *ngIf="ovParam.type === 'string'" pInputText [(ngModel)]="ovValue" />
            <select *ngIf="ovParam.type === 'boolean'" class="ec-select" [(ngModel)]="ovValue"><option [ngValue]="true">Oui</option><option [ngValue]="false">Non</option></select>
            <select *ngIf="ovParam.type === 'enum'" class="ec-select" [(ngModel)]="ovValue"><option *ngFor="let o of ovParam.options" [ngValue]="o.value">{{ o.label }}</option></select>
          </div>
          <div class="p-field full"><label>Référence réglementaire</label><input pInputText [(ngModel)]="ovLegal" placeholder="Ex. Code du travail, art. …" /></div>
        </div>
        <div class="ec-error-box" *ngIf="error">{{ error }}</div>
        <div class="ec-form-actions"><button type="button" pButton label="Annuler" class="p-button-text" (click)="showOverride = false"></button>
          <button type="button" pButton label="Enregistrer" icon="pi pi-check" [disabled]="!ovParam" (click)="saveOverride()"></button></div>
      </p-dialog>
    </div>
  `
})
export class RulesComponent implements OnInit {
  rules: RuleParam[] = []; overrides: RuleOverride[] = []; regimes: string[] = [];
  history: RuleParam | null = null;
  editing: RuleParam | null = null;
  showEdit = false; showOverride = false; error = '';
  value: any = null; validFrom = ''; legalReference = ''; comment = '';
  ovRegime = 'CONTRACTUEL'; ovKey = 'leave.annual_days'; ovParam: RuleParam | null = null; ovValue: any = null; ovLegal = '';

  constructor(private api: AdminApiService, private messages: MessageService) {}

  ngOnInit() { this.load(); }
  load() {
    this.api.rules().subscribe(p => { this.rules = p.rules; this.overrides = p.overrides; this.regimes = p.regimes.filter(r => r !== 'FONCTIONNAIRE'); if (this.history) this.history = p.rules.find(x => x.key === this.history!.key) || null; });
  }

  groups() { return [...new Set(this.rules.map(r => r.group))]; }
  byGroup(g: string) { return this.rules.filter(r => r.group === g); }
  overridable() { return this.rules.filter(r => r.group === 'Congé annuel' || r.group === "Autorisations d'absence"); }

  show(r: RuleParam, v: any): string {
    if (r.type === 'boolean') return v ? 'Oui' : 'Non';
    if (r.type === 'enum') return r.options?.find(o => o.value === v)?.label.split(' (')[0] || String(v);
    return String(v);
  }

  openEdit(r: RuleParam) { this.editing = r; this.error = ''; this.value = r.value; this.validFrom = ''; this.legalReference = r.legalReference || ''; this.comment = ''; this.showEdit = true; }

  private payload(value: any, legal: string, validFrom = '', comment = '') {
    return { value, validFrom: validFrom ? new Date(validFrom).toISOString() : undefined, legalReference: legal || undefined, comment: comment || undefined };
  }

  save() {
    if (!this.editing) return;
    const value = this.editing.type === 'number' ? Number(this.value) : this.value;
    this.api.setRule(this.editing.key, this.payload(value, this.legalReference, this.validFrom, this.comment)).subscribe({
      next: () => { this.showEdit = false; this.messages.add({ severity: 'success', summary: 'Enregistré', detail: 'Paramètre mis à jour' }); this.load(); },
      error: err => { this.error = err.error?.message || 'Enregistrement impossible'; }
    });
  }

  openOverride() { this.error = ''; this.ovKey = 'leave.annual_days'; this.pickOverride(); this.ovLegal = ''; this.showOverride = true; }
  pickOverride() { this.ovParam = this.rules.find(r => r.key === this.ovKey) || null; this.ovValue = this.ovParam?.value ?? null; }

  saveOverride() {
    if (!this.ovParam) return;
    const value = this.ovParam.type === 'number' ? Number(this.ovValue) : this.ovValue;
    this.api.setRule(`${this.ovKey}@${this.ovRegime}`, this.payload(value, this.ovLegal)).subscribe({
      next: () => { this.showOverride = false; this.messages.add({ severity: 'success', summary: 'Enregistré', detail: 'Surcharge enregistrée' }); this.load(); },
      error: err => { this.error = err.error?.message || 'Enregistrement impossible'; }
    });
  }

  clear(o: RuleOverride) {
    this.api.clearOverride(o.key).subscribe({ next: () => { this.messages.add({ severity: 'success', summary: 'Retirée', detail: 'Surcharge retirée' }); this.load(); }, error: e => this.messages.add({ severity: 'error', summary: 'Erreur', detail: e.error?.message || 'Impossible' }) });
  }
}
