import { Component, OnInit } from '@angular/core';
import { ConfirmationService, MessageService } from 'primeng/api';
import { AdminApiService, Agent, OrgUnitType, Position, RequestTypeDef, Simulation, WorkflowDefinition, WorkflowStep } from '../services/admin-api.service';

const KINDS = [{ v: 'AVIS', l: 'Avis' }, { v: 'VISA', l: 'Visa' }, { v: 'TRAITEMENT', l: 'Traitement' }, { v: 'DECISION', l: 'Décision (dernière étape)' }];
const UNIT_TYPES: { v: OrgUnitType; l: string }[] = [{ v: 'SG', l: 'Secrétariat général' }, { v: 'DG', l: 'Direction générale' }, { v: 'DIRECTION', l: 'Direction' }, { v: 'SERVICE', l: 'Service' }, { v: 'UNITE', l: 'Unité' }];
const OPS = [{ v: 'gt', l: 'supérieur à' }, { v: 'gte', l: 'supérieur ou égal à' }, { v: 'lt', l: 'inférieur à' }, { v: 'lte', l: 'inférieur ou égal à' }, { v: 'eq', l: 'égal à' }, { v: 'ne', l: 'différent de' }];
const FIELDS = [{ v: 'durationDays', l: 'Durée (jours)' }, { v: 'durationHours', l: 'Durée (heures)' }, { v: 'year', l: 'Année' }];

interface EditStep extends WorkflowStep { hasCondition: boolean; condField: string; condOp: string; condValue: string; }

@Component({
  selector: 'app-circuits',
  standalone: false,
  template: `
    <div class="ec-page">
      <div class="ec-page-header">
        <div>
          <h1 class="ec-display">Circuits de validation</h1>
          <p class="ec-mono">UN CIRCUIT PAR DÉMARCHE — MODIFIABLE SANS TOUCHER AU CODE</p>
        </div>
        <button pButton label="Générer d'après les formulaires" icon="pi pi-bolt" class="p-button-warning" (click)="bootstrap()"></button>
      </div>
      <div class="ec-info-box">Chaque modification crée une <b>nouvelle version</b> du circuit. Les demandes déjà déposées gardent le circuit de leur dépôt. Les postes vacants bloquent le dépôt : pourvoyez-les dans « Postes ».</div>

      <div class="ec-toolbar-row">
        <select class="ec-select" style="max-width:420px" [(ngModel)]="typeCode" (ngModelChange)="load()">
          <option *ngFor="let t of types" [value]="t.code">{{ t.name }}</option>
        </select>
        <button pButton type="button" label="Simuler pour un agent" icon="pi pi-play" class="p-button-text" [disabled]="!current" (click)="openSim()"></button>
      </div>

      <div class="ec-panel ec-panel-pad" *ngIf="current; else none">
        <div class="ec-toolbar-row" style="margin-bottom:8px">
          <strong>Version {{ current.version }} en vigueur</strong>
          <span class="ec-hint">depuis le {{ current.validFrom | date:'dd/MM/yyyy' }}</span>
          <span style="flex:1"></span>
          <button pButton type="button" label="Modifier (nouvelle version)" icon="pi pi-pencil" (click)="startEdit()" *ngIf="!editing"></button>
        </div>
        <table class="ec-table" *ngIf="!editing">
          <thead><tr><th>N°</th><th>Type</th><th>Qui</th><th>Obligatoire</th><th>Délai</th><th>Conditions</th></tr></thead>
          <tbody>
            <tr *ngFor="let s of current.steps">
              <td>{{ s.order }}</td>
              <td><span class="ec-badge" [class.warn]="s.kind === 'DECISION'">{{ kindLabel(s.kind) }}</span></td>
              <td>{{ who(s) }}</td>
              <td>{{ s.isMandatory ? 'Oui' : 'Non' }}</td>
              <td>{{ s.deadlineDays ? s.deadlineDays + ' j' : '—' }}</td>
              <td>{{ s.conditionJson ? condText(s.conditionJson) : '—' }}{{ s.allowReturn ? '' : ' · pas de retour' }}</td>
            </tr>
          </tbody>
        </table>

        <div *ngIf="editing">
          <div *ngFor="let s of draft; let i = index" class="ec-panel ec-panel-pad" style="margin-bottom:10px; background:#fcfcfa">
            <div class="ec-toolbar-row" style="margin-bottom:8px">
              <strong>Étape {{ i + 1 }}</strong><span style="flex:1"></span>
              <button class="ec-icon-btn" type="button" (click)="move(i, -1)" [disabled]="i === 0" title="Monter"><i class="pi pi-arrow-up"></i></button>
              <button class="ec-icon-btn" type="button" (click)="move(i, 1)" [disabled]="i === draft.length - 1" title="Descendre"><i class="pi pi-arrow-down"></i></button>
              <button class="ec-icon-btn danger" type="button" (click)="draft.splice(i, 1)" title="Supprimer"><i class="pi pi-trash"></i></button>
            </div>
            <div class="ec-form-grid">
              <div class="p-field"><label>Nature</label><select class="ec-select" [(ngModel)]="s.kind"><option *ngFor="let k of kinds" [value]="k.v">{{ k.l }}</option></select></div>
              <div class="p-field"><label>Qui intervient</label>
                <select class="ec-select" [(ngModel)]="s.resolution">
                  <option value="POSITION">Un poste précis</option><option value="UNIT_TYPE_HEAD">Le responsable de l'unité de l'agent…</option><option value="SUPERVISOR_LEVEL">Un supérieur hiérarchique de l'agent</option>
                </select></div>
              <div class="p-field" *ngIf="s.resolution === 'POSITION'"><label>Poste</label>
                <select class="ec-select" [(ngModel)]="s.positionId"><option [ngValue]="null">—</option><option *ngFor="let p of positions" [value]="p.id">{{ p.label }}{{ p.holder ? '' : ' (vacant)' }}</option></select></div>
              <div class="p-field" *ngIf="s.resolution === 'UNIT_TYPE_HEAD'"><label>Type d'unité</label>
                <select class="ec-select" [(ngModel)]="s.unitType"><option *ngFor="let u of unitTypes" [value]="u.v">{{ u.l }}</option></select></div>
              <div class="p-field" *ngIf="s.resolution === 'SUPERVISOR_LEVEL'"><label>Niveau (1 = supérieur direct)</label><input pInputText type="number" min="1" max="10" [(ngModel)]="s.level" /></div>
              <div class="p-field"><label>Intitulé du cadre (facultatif)</label><input pInputText [(ngModel)]="s.label" placeholder="Auto : « Avis de Monsieur le … »" /></div>
              <div class="p-field"><label>Délai de traitement (jours)</label><input pInputText type="number" min="1" [(ngModel)]="s.deadlineDays" /></div>
              <div class="p-field" *ngIf="s.deadlineDays"><label>Poste d'escalade en cas de retard</label>
                <select class="ec-select" [(ngModel)]="s.escalatePositionId"><option [ngValue]="null">Aucune escalade</option><option *ngFor="let p of positions" [value]="p.id">{{ p.label }}{{ p.holder ? '' : ' (vacant)' }}</option></select></div>
              <div class="p-field"><label><input type="checkbox" [(ngModel)]="s.isMandatory" /> Étape obligatoire</label></div>
              <div class="p-field"><label><input type="checkbox" [(ngModel)]="s.allowReturn" /> Retour pour correction autorisé</label></div>
              <div class="p-field" *ngIf="s.kind !== 'DECISION'"><label><input type="checkbox" [(ngModel)]="s.rejectOnUnfavorable" /> Un avis défavorable met fin à la demande</label></div>
              <div class="p-field full" *ngIf="s.kind !== 'DECISION'">
                <label><input type="checkbox" [(ngModel)]="s.hasCondition" /> Étape conditionnelle</label>
                <div class="ec-toolbar-row" *ngIf="s.hasCondition" style="margin:6px 0 0">
                  <span>Si</span>
                  <select class="ec-select" style="width:auto" [(ngModel)]="s.condField"><option *ngFor="let f of fields" [value]="f.v">{{ f.l }}</option></select>
                  <select class="ec-select" style="width:auto" [(ngModel)]="s.condOp"><option *ngFor="let o of ops" [value]="o.v">{{ o.l }}</option></select>
                  <input pInputText style="min-width:80px; width:90px" [(ngModel)]="s.condValue" />
                </div>
              </div>
            </div>
          </div>
          <div class="ec-toolbar-row">
            <button pButton type="button" label="Ajouter une étape" icon="pi pi-plus" class="p-button-text" (click)="addStep()"></button>
          </div>
          <div class="ec-error-box" *ngIf="error">{{ error }}</div>
          <div class="ec-form-actions">
            <button pButton type="button" label="Annuler" class="p-button-text" (click)="editing = false"></button>
            <button pButton type="button" label="Publier la nouvelle version" icon="pi pi-check" class="p-button-success" (click)="publish()"></button>
          </div>
        </div>
      </div>
      <ng-template #none><div class="ec-panel ec-panel-pad ec-empty">Aucun circuit défini pour cette démarche. Cliquez sur « Générer d'après les formulaires » ou créez-le à la main.
        <div style="margin-top:12px"><button pButton type="button" label="Créer un circuit" icon="pi pi-plus" (click)="startEdit()"></button></div>
        <div *ngIf="editing" style="text-align:left; margin-top:16px"></div></div></ng-template>

      <h2 class="ec-section-title" *ngIf="history.length > 1">Historique des versions</h2>
      <div class="ec-panel" *ngIf="history.length > 1">
        <table class="ec-table"><thead><tr><th>Version</th><th>Étapes</th><th>Du</th><th>Au</th></tr></thead>
          <tbody><tr *ngFor="let h of history"><td>v{{ h.version }}</td><td>{{ h.steps.length }}</td><td>{{ h.validFrom | date:'dd/MM/yyyy HH:mm' }}</td><td>{{ h.validTo ? (h.validTo | date:'dd/MM/yyyy HH:mm') : 'En vigueur' }}</td></tr></tbody></table>
      </div>

      <h2 class="ec-section-title">Pièces justificatives de la démarche</h2>
      <div class="ec-panel ec-panel-pad" *ngIf="typeDef">
        <div *ngFor="let a of typeDef.attachmentRules; let i = index" class="ec-toolbar-row">
          <input pInputText style="flex:1" [(ngModel)]="a.label" />
          <label><input type="checkbox" [(ngModel)]="a.required" /> Obligatoire</label>
          <button class="ec-icon-btn danger" type="button" (click)="typeDef.attachmentRules.splice(i, 1)"><i class="pi pi-trash"></i></button>
        </div>
        <p class="ec-hint" *ngIf="!typeDef.attachmentRules.length">Aucune pièce demandée.</p>
        <div class="ec-form-actions" style="justify-content:space-between">
          <button pButton type="button" label="Ajouter une pièce" icon="pi pi-plus" class="p-button-text" (click)="addAttachmentRule()"></button>
          <button pButton type="button" label="Enregistrer les pièces" icon="pi pi-save" (click)="saveAttachmentRules()"></button>
        </div>
      </div>

      <p-dialog header="Simulation du circuit" [(visible)]="showSim" [modal]="true" [style]="{ width: '40rem' }">
        <div class="p-field"><label>Agent demandeur</label>
          <select class="ec-select" [(ngModel)]="simAgent" (ngModelChange)="runSim()"><option value="">—</option><option *ngFor="let a of agents" [value]="a.id">{{ a.lastName | uppercase }} {{ a.firstName }} ({{ a.profile.matricule }})</option></select></div>
        <div class="p-field" style="margin-top:8px"><label>Durée simulée (jours)</label><input pInputText type="number" min="1" [(ngModel)]="simDays" (ngModelChange)="runSim()" /></div>
        <div *ngIf="sim" style="margin-top:14px">
          <div class="ec-error-box" *ngIf="sim.unresolved.length"><b>Le dépôt serait bloqué :</b>
            <ul style="margin:6px 0 0 18px; padding:0"><li *ngFor="let u of sim.unresolved">{{ u.label }} — {{ u.reason }}</li></ul></div>
          <div class="ec-info-box" *ngIf="!sim.unresolved.length">Circuit résolu (version {{ sim.workflowVersion }}).</div>
          <ol style="padding-left:18px">
            <li *ngFor="let s of sim.steps" style="margin-bottom:4px">{{ s.heading }} <b>→ {{ s.approverName }}</b></li>
          </ol>
          <p class="ec-hint" *ngFor="let s of sim.skipped">Ignorée : {{ s.label }} ({{ s.reason }})</p>
        </div>
      </p-dialog>
    </div>
  `
})
export class CircuitsComponent implements OnInit {
  types: RequestTypeDef[] = [];
  typeCode = 'DECISION_CONGE';
  typeDef: RequestTypeDef | null = null;
  history: WorkflowDefinition[] = [];
  current: WorkflowDefinition | null = null;
  positions: Position[] = [];
  agents: Agent[] = [];
  editing = false;
  draft: EditStep[] = [];
  error = '';
  kinds = KINDS; unitTypes = UNIT_TYPES; ops = OPS; fields = FIELDS;
  showSim = false; simAgent = ''; simDays = 1; sim: Simulation | null = null;

  constructor(private api: AdminApiService, private messages: MessageService, private confirm: ConfirmationService) {}

  ngOnInit() {
    this.api.requestTypes().subscribe(t => { this.types = t; this.typeCode = t[0]?.code || this.typeCode; this.load(); });
    this.api.positions().subscribe(p => (this.positions = p.filter(x => x.isActive)));
    this.api.agents({ limit: 200 }).subscribe(r => (this.agents = r.items.filter(a => a.isActive)));
  }

  load() {
    this.editing = false; this.error = '';
    this.typeDef = JSON.parse(JSON.stringify(this.types.find(t => t.code === this.typeCode) || null));
    this.api.workflows(this.typeCode).subscribe(w => { this.history = w; this.current = w.find(x => x.isActive) || null; });
  }

  kindLabel(k: string) { return KINDS.find(x => x.v === k)?.l.replace(' (dernière étape)', '') || k; }
  condText(c: any) { return `si ${FIELDS.find(f => f.v === c.field)?.l || c.field} ${OPS.find(o => o.v === c.op)?.l || c.op} ${c.value}`; }

  who(s: WorkflowStep): string {
    if (s.resolution === 'POSITION') return this.positions.find(p => p.id === s.positionId)?.label || 'Poste';
    if (s.resolution === 'UNIT_TYPE_HEAD') return `Responsable de l'unité de type ${UNIT_TYPES.find(u => u.v === s.unitType)?.l || s.unitType}`;
    return `Supérieur hiérarchique de niveau ${s.level}`;
  }

  private toEdit(s: WorkflowStep): EditStep {
    const c: any = s.conditionJson;
    return { ...s, hasCondition: !!c, condField: c?.field || 'durationDays', condOp: c?.op || 'gt', condValue: c ? String(c.value) : '' };
  }

  startEdit() {
    this.error = '';
    this.draft = (this.current?.steps || []).map(s => this.toEdit(s));
    if (!this.draft.length) this.addStep('DECISION');
    this.editing = true;
  }

  addStep(kind: any = 'AVIS') {
    const decisionIdx = this.draft.findIndex(s => s.kind === 'DECISION');
    const step = this.toEdit({ kind, resolution: 'POSITION', positionId: null, isMandatory: true, allowReturn: true, rejectOnUnfavorable: kind === 'DECISION', deadlineDays: null, escalatePositionId: null });
    // Une nouvelle étape d'avis s'insère avant la décision finale
    if (kind !== 'DECISION' && decisionIdx >= 0) this.draft.splice(decisionIdx, 0, step); else this.draft.push(step);
  }

  move(i: number, d: number) { const j = i + d; [this.draft[i], this.draft[j]] = [this.draft[j], this.draft[i]]; }

  publish() {
    const steps = this.draft.map(s => ({
      kind: s.kind, label: s.label || null, resolution: s.resolution,
      positionId: s.resolution === 'POSITION' ? s.positionId : null, level: s.resolution === 'SUPERVISOR_LEVEL' ? Number(s.level) || 1 : null, unitType: s.resolution === 'UNIT_TYPE_HEAD' ? s.unitType : null,
      isMandatory: s.isMandatory, deadlineDays: s.deadlineDays ? Number(s.deadlineDays) : null, escalatePositionId: s.deadlineDays ? s.escalatePositionId || null : null, allowReturn: s.allowReturn, rejectOnUnfavorable: s.kind === 'DECISION' ? true : s.rejectOnUnfavorable,
      condition: s.hasCondition && s.kind !== 'DECISION' ? { field: s.condField, op: s.condOp, value: Number.isNaN(Number(s.condValue)) ? s.condValue : Number(s.condValue) } : null
    }));
    this.api.publishWorkflow(this.typeCode, steps).subscribe({
      next: w => { this.editing = false; this.messages.add({ severity: 'success', summary: 'Circuit publié', detail: `Version ${w.version} en vigueur` }); this.load(); },
      error: e => { this.error = e.error?.message || (e.error?.errors ? 'Vérifiez les étapes (postes, niveaux…)' : 'Publication impossible'); }
    });
  }

  bootstrap() {
    this.confirm.confirm({
      message: "Générer les circuits des trois formulaires officiels ? Les postes manquants seront créés vacants. Aucun circuit existant n'est remplacé.",
      accept: () => this.api.bootstrapWorkflows().subscribe({
        next: r => {
          this.messages.add({ severity: 'success', summary: 'Circuits générés', detail: `${r.published.length} circuit(s), ${r.createdPositions.length} poste(s) créé(s) — pensez à pourvoir les postes`, life: 8000 });
          this.api.positions().subscribe(p => (this.positions = p.filter(x => x.isActive)));
          this.load();
        },
        error: e => this.messages.add({ severity: 'error', summary: 'Erreur', detail: e.error?.message || 'Impossible de générer les circuits' })
      })
    });
  }

  openSim() { this.sim = null; this.showSim = true; }
  runSim() {
    if (!this.simAgent) { this.sim = null; return; }
    this.api.simulate(this.typeCode, this.simAgent, { durationDays: Number(this.simDays) || 1 }).subscribe({ next: s => (this.sim = s), error: e => this.messages.add({ severity: 'error', summary: 'Simulation impossible', detail: e.error?.message || 'Erreur' }) });
  }

  addAttachmentRule() { this.typeDef?.attachmentRules.push({ code: 'PIECE_' + (this.typeDef.attachmentRules.length + 1), label: '', required: false }); }
  saveAttachmentRules() {
    if (!this.typeDef) return;
    const rules = this.typeDef.attachmentRules.filter(a => a.label.trim()).map((a, i) => ({ code: (a.code || 'PIECE_' + (i + 1)).toUpperCase().replace(/[^A-Z0-9_]/g, '_'), label: a.label.trim(), required: a.required }));
    this.api.updateRequestType(this.typeDef.id, { attachmentRules: rules } as any).subscribe({
      next: t => { this.messages.add({ severity: 'success', summary: 'Enregistré', detail: 'Pièces justificatives mises à jour' }); const i = this.types.findIndex(x => x.id === t.id); if (i >= 0) this.types[i] = t; this.typeDef = JSON.parse(JSON.stringify(t)); },
      error: e => this.messages.add({ severity: 'error', summary: 'Erreur', detail: e.error?.message || 'Enregistrement impossible' })
    });
  }
}
