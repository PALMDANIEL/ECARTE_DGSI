import { Component, OnInit, inject } from '@angular/core';
import { FormBuilder, Validators } from '@angular/forms';
import { MessageService } from 'primeng/api';
import { AbsenceTypeDef, AdminApiService } from '../services/admin-api.service';

@Component({
  selector: 'app-absence-types',
  standalone: false,
  template: `
    <div class="ec-page">
      <div class="ec-page-header">
        <div>
          <h1 class="ec-display">Types d'autorisation d'absence</h1>
          <p class="ec-mono">MOTIFS PROPOSÉS AUX AGENTS — PLAFONDS ET RÉFÉRENCES RÉGLEMENTAIRES</p>
        </div>
        <button pButton label="Nouveau type" icon="pi pi-plus" class="p-button-success" (click)="open()"></button>
      </div>
      <div class="ec-info-box">Le plafond de 10 jours par an de la loi 081-2015/CNT (art. 58) ne concerne que les <b>événements familiaux</b> ; les absences syndicales et de mission (art. 57) sont hors plafond. Le contrôle des plafonds sera appliqué avec le calcul des droits (phase 3).</div>
      <div class="ec-panel">
        <table class="ec-table">
          <thead><tr><th>Type</th><th>Saisie</th><th>Plafond annuel</th><th>Référence</th><th>Statut</th><th></th></tr></thead>
          <tbody>
            <tr *ngFor="let t of types" [style.opacity]="t.isActive ? 1 : 0.55">
              <td><b>{{ t.name }}</b><br /><span class="ec-mono-text">{{ t.code }}</span></td>
              <td>{{ unitLabel(t.unit) }}</td>
              <td>{{ t.annualCap ? t.annualCap + ' jours' : 'Aucun' }}</td>
              <td style="max-width:320px">{{ t.legalReference || '—' }}</td>
              <td><span class="ec-badge" [class.ok]="t.isActive" [class.bad]="!t.isActive">{{ t.isActive ? 'Actif' : 'Inactif' }}</span></td>
              <td class="ec-cell-actions"><button class="ec-icon-btn" (click)="open(t)" title="Modifier"><i class="pi pi-pencil"></i></button></td>
            </tr>
          </tbody>
        </table>
      </div>

      <p-dialog [header]="editing ? 'Modifier le type' : 'Nouveau type d\\'absence'" [(visible)]="show" [modal]="true" [style]="{ width: '36rem' }">
        <form [formGroup]="form" (ngSubmit)="save()">
          <div class="ec-form-grid">
            <div class="p-field"><label>Code *</label><input pInputText formControlName="code" [readonly]="!!editing" placeholder="EVENEMENT_FAMILIAL" /></div>
            <div class="p-field"><label>Saisie *</label>
              <select class="ec-select" formControlName="unit"><option value="JOUR">En jours entiers</option><option value="HEURE">En heures</option><option value="BOTH">Jours ou heures</option></select></div>
            <div class="p-field full"><label>Libellé *</label><input pInputText formControlName="name" /></div>
            <div class="p-field"><label>Plafond annuel (jours)</label><input pInputText type="number" min="1" formControlName="annualCap" placeholder="Aucun" /></div>
            <div class="p-field"><label><input type="checkbox" formControlName="deductsFromLeave" /> Déduit du congé annuel</label></div>
            <div class="p-field full"><label>Référence réglementaire</label><input pInputText formControlName="legalReference" placeholder="Loi 081-2015/CNT, art. 58" /></div>
            <div class="p-field" *ngIf="editing"><label><input type="checkbox" formControlName="isActive" /> Type actif</label></div>
          </div>
          <div class="ec-error-box" *ngIf="error">{{ error }}</div>
          <div class="ec-form-actions"><button type="button" pButton label="Annuler" class="p-button-text" (click)="show = false"></button>
            <button type="submit" pButton label="Enregistrer" icon="pi pi-check" [disabled]="form.invalid"></button></div>
        </form>
      </p-dialog>
    </div>
  `
})
export class AbsenceTypesComponent implements OnInit {
  private fb = inject(FormBuilder);
  types: AbsenceTypeDef[] = [];
  show = false; editing: AbsenceTypeDef | null = null; error = '';
  form = this.fb.group({ code: ['', Validators.required], name: ['', Validators.required], unit: ['BOTH'], annualCap: [null as number | null], deductsFromLeave: [false], legalReference: [''], isActive: [true] });

  constructor(private api: AdminApiService, private messages: MessageService) {}
  ngOnInit() { this.load(); }
  load() { this.api.absenceTypes().subscribe(t => (this.types = t)); }
  unitLabel(u: string) { return u === 'JOUR' ? 'Jours entiers' : u === 'HEURE' ? 'Heures' : 'Jours ou heures'; }

  open(t?: AbsenceTypeDef) {
    this.editing = t || null; this.error = '';
    this.form.reset(t ? { code: t.code, name: t.name, unit: t.unit, annualCap: t.annualCap, deductsFromLeave: t.deductsFromLeave, legalReference: t.legalReference || '', isActive: t.isActive } : { code: '', name: '', unit: 'BOTH', annualCap: null, deductsFromLeave: false, legalReference: '', isActive: true });
    this.show = true;
  }

  save() {
    const v = this.form.value;
    const body: any = { code: v.code, name: v.name, unit: v.unit, annualCap: v.annualCap ? Number(v.annualCap) : null, deductsFromLeave: !!v.deductsFromLeave, legalReference: v.legalReference || null, isActive: v.isActive };
    (this.editing ? this.api.updateAbsenceType(this.editing.id, body) : this.api.createAbsenceType(body)).subscribe({
      next: () => { this.show = false; this.messages.add({ severity: 'success', summary: 'Enregistré', detail: 'Type d\'absence enregistré' }); this.load(); },
      error: e => { this.error = e.error?.message || 'Enregistrement impossible'; }
    });
  }
}
