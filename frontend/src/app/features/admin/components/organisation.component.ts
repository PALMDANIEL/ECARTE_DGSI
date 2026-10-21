import { Component, OnInit, inject } from '@angular/core';
import { FormBuilder, Validators } from '@angular/forms';
import { ConfirmationService, MessageService } from 'primeng/api';
import { AdminApiService, OrgUnit, OrgUnitType } from '../services/admin-api.service';
import { downloadBlob } from '../download';

const RANK: Record<OrgUnitType, number> = { SG: 1, DG: 2, DIRECTION: 3, SERVICE: 4, UNITE: 5 };
const LABELS: Record<OrgUnitType, string> = { SG: 'Secrétariat général', DG: 'Direction générale', DIRECTION: 'Direction', SERVICE: 'Service', UNITE: 'Unité' };

interface Row extends OrgUnit { depth: number; }

@Component({
  selector: 'app-organisation',
  standalone: false,
  template: `
    <div class="ec-page">
      <div class="ec-page-header">
        <div>
          <h1 class="ec-display">Organisation</h1>
          <p class="ec-mono">{{ units.length }} UNITÉ(S) — MINISTÈRE › SG › DG › DIRECTION › SERVICE</p>
        </div>
        <button pButton label="Nouvelle unité" icon="pi pi-plus" class="p-button-success" (click)="openCreate()"></button>
      </div>

      <div class="ec-panel">
        <table class="ec-table">
          <thead><tr><th>Unité</th><th>Code</th><th>Type</th><th>Statut</th><th></th></tr></thead>
          <tbody>
            <tr *ngFor="let u of rows" [style.opacity]="u.isActive ? 1 : 0.55">
              <td [style.padding-left.px]="16 + u.depth * 22">
                <i class="pi pi-angle-right" *ngIf="u.depth" style="color: var(--ec-brass); margin-right: 6px"></i>{{ u.name }}
              </td>
              <td class="ec-mono-text">{{ u.code }}</td>
              <td><span class="ec-badge">{{ label(u.type) }}</span></td>
              <td><span class="ec-badge" [class.ok]="u.isActive" [class.bad]="!u.isActive">{{ u.isActive ? 'Actif' : 'Inactif' }}</span></td>
              <td class="ec-cell-actions">
                <button class="ec-icon-btn" (click)="openEdit(u)" title="Modifier"><i class="pi pi-pencil"></i></button>
                <button class="ec-icon-btn danger" (click)="remove(u)" title="Supprimer"><i class="pi pi-trash"></i></button>
              </td>
            </tr>
            <tr *ngIf="!rows.length"><td colspan="5" class="ec-empty">Aucune unité. Créez-en une ou importez votre organigramme ci-dessous.</td></tr>
          </tbody>
        </table>
      </div>

      <app-csv-import title="Importer l'organigramme (CSV)"
        help="Colonnes : code ; nom ; type (SG, DG, DIRECTION, SERVICE, UNITE) ; code_parent. Les parents peuvent être placés après leurs enfants. Les unités existantes (même code) sont mises à jour."
        [runImport]="runImport" (download)="template()" (imported)="load()"></app-csv-import>

      <p-dialog [header]="editing ? 'Modifier l\\'unité' : 'Nouvelle unité'" [(visible)]="showDialog" [modal]="true" [style]="{ width: '34rem' }">
        <form [formGroup]="form" (ngSubmit)="save()">
          <div class="ec-form-grid">
            <div class="p-field"><label>Code *</label><input pInputText formControlName="code" placeholder="SDA" /></div>
            <div class="p-field">
              <label>Type *</label>
              <select class="ec-select" formControlName="type"><option *ngFor="let t of types" [value]="t">{{ label(t) }}</option></select>
            </div>
            <div class="p-field full"><label>Nom *</label><input pInputText formControlName="name" placeholder="Service Développement des Applications" /></div>
            <div class="p-field full">
              <label>Rattachée à</label>
              <select class="ec-select" formControlName="parentId">
                <option value="">— Aucune (racine) —</option>
                <option *ngFor="let p of parentChoices()" [value]="p.id">{{ '— '.repeat(p.depth) }}{{ p.name }} ({{ p.code }})</option>
              </select>
              <p class="ec-hint">Une unité doit avoir un rang inférieur à celui de son parent (ex. un service sous une direction).</p>
            </div>
            <div class="p-field" *ngIf="editing"><label><input type="checkbox" formControlName="isActive" /> Unité active</label></div>
          </div>
          <div class="ec-error-box" *ngIf="error">{{ error }}</div>
          <div class="ec-form-actions">
            <button type="button" pButton label="Annuler" class="p-button-text" (click)="showDialog = false"></button>
            <button type="submit" pButton label="Enregistrer" icon="pi pi-check" [disabled]="form.invalid"></button>
          </div>
        </form>
      </p-dialog>
    </div>
  `
})
export class OrganisationComponent implements OnInit {
  private fb = inject(FormBuilder);
  units: OrgUnit[] = [];
  rows: Row[] = [];
  types = Object.keys(RANK) as OrgUnitType[];
  showDialog = false;
  editing: OrgUnit | null = null;
  error = '';
  form = this.fb.group({
    code: ['', Validators.required], name: ['', Validators.required],
    type: ['DG' as OrgUnitType, Validators.required], parentId: [''], isActive: [true]
  });

  runImport = (csv: string, dryRun: boolean) => this.api.importUnits(csv, dryRun);

  constructor(private api: AdminApiService, private messages: MessageService, private confirm: ConfirmationService) {}

  ngOnInit() { this.load(); }

  label(t: OrgUnitType) { return LABELS[t]; }

  load() {
    this.api.orgUnits().subscribe(units => { this.units = units; this.rows = this.flatten(units); });
  }

  /** Ordre d'affichage en arbre (parent puis enfants), avec la profondeur pour l'indentation. */
  private flatten(units: OrgUnit[]): Row[] {
    const byParent = new Map<string | null, OrgUnit[]>();
    units.forEach(u => byParent.set(u.parentId, [...(byParent.get(u.parentId) || []), u]));
    const out: Row[] = [];
    const walk = (parent: string | null, depth: number) =>
      (byParent.get(parent) || []).sort((a, b) => a.code.localeCompare(b.code)).forEach(u => { out.push({ ...u, depth }); walk(u.id, depth + 1); });
    walk(null, 0);
    return out;
  }

  /** Parents possibles : rang strictement inférieur au type choisi, et jamais l'unité elle-même ni ses descendants. */
  parentChoices(): Row[] {
    const type = this.form.value.type as OrgUnitType;
    const forbidden = new Set<string>();
    if (this.editing) {
      forbidden.add(this.editing.id);
      let changed = true;
      while (changed) { changed = false; this.units.forEach(u => { if (u.parentId && forbidden.has(u.parentId) && !forbidden.has(u.id)) { forbidden.add(u.id); changed = true; } }); }
    }
    return this.rows.filter(r => RANK[r.type] < RANK[type] && !forbidden.has(r.id));
  }

  openCreate() {
    this.editing = null; this.error = '';
    this.form.reset({ code: '', name: '', type: 'DG', parentId: '', isActive: true });
    this.showDialog = true;
  }

  openEdit(u: OrgUnit) {
    this.editing = u; this.error = '';
    this.form.reset({ code: u.code, name: u.name, type: u.type, parentId: u.parentId || '', isActive: u.isActive });
    this.showDialog = true;
  }

  save() {
    if (this.form.invalid) return;
    const v = this.form.value;
    const body: any = { code: v.code, name: v.name, type: v.type, parentId: v.parentId || null };
    const req = this.editing ? this.api.updateUnit(this.editing.id, { ...body, isActive: v.isActive }) : this.api.createUnit(body);
    req.subscribe({
      next: () => { this.showDialog = false; this.messages.add({ severity: 'success', summary: 'Enregistré', detail: 'Unité enregistrée' }); this.load(); },
      error: err => { this.error = err.error?.message || 'Enregistrement impossible'; }
    });
  }

  remove(u: OrgUnit) {
    this.confirm.confirm({
      message: `Supprimer l'unité « ${u.name} » ?`,
      accept: () => this.api.deleteUnit(u.id).subscribe({
        next: () => { this.messages.add({ severity: 'success', summary: 'Supprimée', detail: u.name }); this.load(); },
        error: err => this.messages.add({ severity: 'error', summary: 'Suppression impossible', detail: err.error?.message || 'Erreur', life: 8000 })
      })
    });
  }

  template() { this.api.template('org-units').subscribe(b => downloadBlob(b, 'modele-organigramme.csv')); }
}
