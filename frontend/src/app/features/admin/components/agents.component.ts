import { Component, OnInit, inject } from '@angular/core';
import { FormBuilder, Validators } from '@angular/forms';
import { ConfirmationService, MessageService } from 'primeng/api';
import { Subject, debounceTime } from 'rxjs';
import { AdminApiService, Agent, OrgUnit } from '../services/admin-api.service';
import { downloadBlob } from '../download';

@Component({
  selector: 'app-agents',
  standalone: false,
  template: `
    <div class="ec-page">
      <div class="ec-page-header">
        <div>
          <h1 class="ec-display">Agents</h1>
          <p class="ec-mono">{{ total }} AGENT(S)</p>
        </div>
        <button pButton label="Nouvel agent" icon="pi pi-plus" class="p-button-success" (click)="openCreate()"></button>
      </div>

      <div class="ec-toolbar-row">
        <input pInputText placeholder="Rechercher un nom ou un matricule…" [(ngModel)]="search" (ngModelChange)="search$.next($event)" />
        <select class="ec-select" style="max-width:320px" [(ngModel)]="unitFilter" (ngModelChange)="page = 1; load()">
          <option value="">Toutes les unités</option>
          <option *ngFor="let u of units" [value]="u.id">{{ u.name }} ({{ u.code }})</option>
        </select>
      </div>

      <div class="ec-panel">
        <table class="ec-table">
          <thead><tr><th>Matricule</th><th>Agent</th><th>Grade</th><th>Affectation</th><th>PIN</th><th>Statut</th><th></th></tr></thead>
          <tbody>
            <tr *ngFor="let a of agents" [style.opacity]="a.isActive ? 1 : 0.55">
              <td class="ec-mono-text">{{ a.profile.matricule }}</td>
              <td>{{ a.profile.civility === 'MME' ? 'Mme ' : a.profile.civility === 'MLLE' ? 'Mlle ' : a.profile.civility === 'M' ? 'M. ' : '' }}{{ a.lastName | uppercase }} {{ a.firstName }}</td>
              <td>{{ a.profile.grade || '—' }}</td>
              <td>{{ a.profile.orgUnit?.name || '—' }}</td>
              <td><span class="ec-badge" [class.ok]="a.profile.hasPin" [class.warn]="!a.profile.hasPin">{{ a.profile.hasPin ? 'Défini' : 'À remettre' }}</span></td>
              <td><span class="ec-badge" [class.ok]="a.isActive" [class.bad]="!a.isActive">{{ a.isActive ? 'Actif' : 'Inactif' }}</span></td>
              <td class="ec-cell-actions">
                <button class="ec-icon-btn" (click)="openEdit(a)" title="Modifier"><i class="pi pi-pencil"></i></button>
                <button class="ec-icon-btn" (click)="resetPin(a)" title="Générer un nouveau PIN"><i class="pi pi-key"></i></button>
                <button class="ec-icon-btn" (click)="openCreds(a)" title="Accès de connexion (responsables)"><i class="pi pi-sign-in"></i></button>
                <button class="ec-icon-btn" (click)="toggleActive(a)" [title]="a.isActive ? 'Désactiver' : 'Réactiver'"><i class="pi" [class.pi-lock]="a.isActive" [class.pi-lock-open]="!a.isActive"></i></button>
              </td>
            </tr>
            <tr *ngIf="!agents.length"><td colspan="7" class="ec-empty">Aucun agent. Créez-en un ou importez votre liste ci-dessous.</td></tr>
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

      <app-csv-import title="Importer les agents (CSV)"
        help="Colonnes : matricule ; nom ; prenom ; email ; telephone ; civilite ; grade ; corps ; date_integration ; date_entree_service ; code_unite ; matricule_superieur ; regime. Seuls matricule, nom et prenom sont obligatoires. Importez d'abord l'organigramme pour pouvoir rattacher les agents."
        [runImport]="runImport" (download)="template()" (imported)="load()"></app-csv-import>

      <p-dialog [header]="editing ? 'Modifier l\\'agent' : 'Nouvel agent'" [(visible)]="showDialog" [modal]="true" [style]="{ width: '46rem' }">
        <form [formGroup]="form" (ngSubmit)="save()">
          <div class="ec-form-grid">
            <div class="p-field"><label>Matricule *</label><input pInputText formControlName="matricule" /></div>
            <div class="p-field">
              <label>Civilité</label>
              <select class="ec-select" formControlName="civility"><option value="">—</option><option value="M">Monsieur</option><option value="MME">Madame</option><option value="MLLE">Mademoiselle</option></select>
            </div>
            <div class="p-field"><label>Nom *</label><input pInputText formControlName="lastName" /></div>
            <div class="p-field"><label>Prénom(s) *</label><input pInputText formControlName="firstName" /></div>
            <div class="p-field"><label>Grade / emploi</label><input pInputText formControlName="grade" placeholder="Ingénieur de Travaux en Informatique" /></div>
            <div class="p-field"><label>Corps</label><input pInputText formControlName="corps" /></div>
            <div class="p-field"><label>Date d'intégration</label><input pInputText type="date" formControlName="hireDate" /></div>
            <div class="p-field"><label>Date d'entrée en service</label><input pInputText type="date" formControlName="serviceStartDate" /></div>
            <div class="p-field full">
              <label>Affectation</label>
              <select class="ec-select" formControlName="orgUnitId"><option value="">— Non affecté —</option><option *ngFor="let u of units" [value]="u.id">{{ u.name }} ({{ u.code }})</option></select>
            </div>
            <div class="p-field full">
              <label>Supérieur hiérarchique direct</label>
              <select class="ec-select" formControlName="supervisorId">
                <option value="">— Aucun —</option>
                <option *ngFor="let s of supervisorChoices()" [value]="s.id">{{ s.lastName | uppercase }} {{ s.firstName }} ({{ s.profile.matricule }})</option>
              </select>
            </div>
            <div class="p-field"><label>Email (facultatif)</label><input pInputText type="email" formControlName="email" [readonly]="!!editing" /></div>
            <div class="p-field"><label>Téléphone</label><input pInputText formControlName="phone" /></div>
            <div class="p-field"><label>Fonction</label><input pInputText formControlName="jobTitle" /></div>
            <div class="p-field"><label>Régime</label><select class="ec-select" formControlName="regime"><option value="FONCTIONNAIRE">Fonctionnaire</option><option value="CONTRACTUEL">Contractuel</option><option value="ENSEIGNANT">Enseignant</option></select></div>
          </div>
          <div class="ec-error-box" *ngIf="error">{{ error }}</div>
          <div class="ec-form-actions">
            <button type="button" pButton label="Annuler" class="p-button-text" (click)="showDialog = false"></button>
            <button type="submit" pButton label="Enregistrer" icon="pi pi-check" [disabled]="form.invalid"></button>
          </div>
        </form>
      </p-dialog>

      <p-dialog header="Accès de connexion" [(visible)]="showCreds" [modal]="true" [style]="{ width: '30rem' }">
        <p *ngIf="credAgent">Pour <b>{{ credAgent.firstName }} {{ credAgent.lastName }}</b>. Nécessaire aux responsables qui traitent des demandes (avis, décisions).</p>
        <div class="p-field"><label>Email de connexion *</label><input pInputText type="email" [(ngModel)]="credEmail" /></div>
        <div class="p-field" style="margin-top:8px"><label>Mot de passe (laisser vide pour en générer un)</label><input pInputText type="text" [(ngModel)]="credPassword" placeholder="8 caractères minimum" /></div>
        <div class="ec-error-box" *ngIf="credError" style="margin-top:10px">{{ credError }}</div>
        <div class="ec-info-box" *ngIf="credResult" style="margin-top:10px">Accès créé : <b>{{ credResult.email }}</b><br />Mot de passe temporaire : <span class="ec-mono-text">{{ credResult.temporaryPassword || '(celui que vous avez saisi)' }}</span><br /><small>Affiché une seule fois — à communiquer à l'agent, qui pourra le changer dans « Mon compte ».</small></div>
        <div class="ec-form-actions"><button pButton type="button" label="Fermer" class="p-button-text" (click)="showCreds = false"></button>
          <button pButton type="button" label="Créer l'accès" icon="pi pi-check" [disabled]="!credEmail || !!credResult" (click)="saveCreds()"></button></div>
      </p-dialog>

      <p-dialog header="Nouveau code PIN" [(visible)]="showPin" [modal]="true" [style]="{ width: '26rem' }">
        <p>PIN de <b>{{ pinAgent }}</b> — à remettre en main propre à l'agent :</p>
        <div style="text-align:center; font-family: var(--ec-font-mono); font-size: 2.2rem; letter-spacing: .3em; padding: 16px 0">{{ pin }}</div>
        <div class="ec-info-box">Ce code n'est affiché <b>qu'une seule fois</b> et n'est pas conservé en clair. En cas d'oubli, générez-en un nouveau.</div>
        <div class="ec-form-actions"><button pButton type="button" label="J'ai noté le code" (click)="showPin = false; pin = ''"></button></div>
      </p-dialog>
    </div>
  `
})
export class AgentsComponent implements OnInit {
  private fb = inject(FormBuilder);
  agents: Agent[] = [];
  allAgents: Agent[] = [];
  units: OrgUnit[] = [];
  total = 0; page = 1; limit = 25;
  search = ''; unitFilter = '';
  search$ = new Subject<string>();
  showDialog = false; editing: Agent | null = null; error = '';
  showPin = false; pin = ''; pinAgent = '';
  showCreds = false; credAgent: Agent | null = null; credEmail = ''; credPassword = ''; credError = ''; credResult: { email: string; temporaryPassword: string | null } | null = null;

  form = this.fb.group({
    matricule: ['', Validators.required], civility: [''], lastName: ['', Validators.required], firstName: ['', Validators.required],
    grade: [''], corps: [''], hireDate: [''], serviceStartDate: [''], orgUnitId: [''], supervisorId: [''],
    email: ['', Validators.email], phone: [''], jobTitle: [''], regime: ['FONCTIONNAIRE']
  });

  runImport = (csv: string, dryRun: boolean) => this.api.importAgents(csv, dryRun);

  constructor(private api: AdminApiService, private messages: MessageService, private confirm: ConfirmationService) {}

  get pages() { return Math.max(1, Math.ceil(this.total / this.limit)); }

  ngOnInit() {
    this.api.orgUnits().subscribe(u => (this.units = u.filter(x => x.isActive).sort((a, b) => a.code.localeCompare(b.code))));
    this.search$.pipe(debounceTime(300)).subscribe(() => { this.page = 1; this.load(); });
    this.load();
  }

  load() {
    this.api.agents({ search: this.search, orgUnitId: this.unitFilter, page: this.page, limit: this.limit }).subscribe(r => {
      this.agents = r.items; this.total = r.total;
    });
    // Liste complète (limitée) pour le choix du supérieur
    this.api.agents({ limit: 200 }).subscribe(r => (this.allAgents = r.items));
  }

  supervisorChoices() { return this.allAgents.filter(a => a.id !== this.editing?.id && a.isActive); }

  openCreate() {
    this.editing = null; this.error = '';
    this.form.reset({ matricule: '', civility: '', lastName: '', firstName: '', grade: '', corps: '', hireDate: '', serviceStartDate: '', orgUnitId: '', supervisorId: '', email: '', phone: '', jobTitle: '', regime: 'FONCTIONNAIRE' });
    this.form.controls.email.enable();
    this.showDialog = true;
  }

  openEdit(a: Agent) {
    this.editing = a; this.error = '';
    const p = a.profile;
    this.form.reset({
      matricule: p.matricule, civility: p.civility || '', lastName: a.lastName, firstName: a.firstName, grade: p.grade || '', corps: p.corps || '',
      hireDate: p.hireDate ? p.hireDate.substring(0, 10) : '', serviceStartDate: p.serviceStartDate ? p.serviceStartDate.substring(0, 10) : '',
      orgUnitId: p.orgUnitId || '', supervisorId: p.supervisorId || '', email: a.email.endsWith('@agents.invalid') ? '' : a.email,
      phone: a.phone || '', jobTitle: a.jobTitle || '', regime: p.regime
    });
    this.showDialog = true;
  }

  save() {
    if (this.form.invalid) return;
    const v = this.form.value;
    const common: any = { matricule: v.matricule, firstName: v.firstName, lastName: v.lastName, phone: v.phone || undefined, jobTitle: v.jobTitle || undefined, regime: v.regime };
    const req = this.editing
      ? this.api.updateAgent(this.editing.id, { ...common, civility: v.civility || null, grade: v.grade || null, corps: v.corps || null, hireDate: v.hireDate || null, serviceStartDate: v.serviceStartDate || null, orgUnitId: v.orgUnitId || null, supervisorId: v.supervisorId || null })
      : this.api.createAgent({ ...common, email: v.email || undefined, civility: v.civility || undefined, grade: v.grade || undefined, corps: v.corps || undefined, hireDate: v.hireDate || undefined, serviceStartDate: v.serviceStartDate || undefined, orgUnitId: v.orgUnitId || undefined, supervisorId: v.supervisorId || undefined });
    req.subscribe({
      next: () => { this.showDialog = false; this.messages.add({ severity: 'success', summary: 'Enregistré', detail: 'Agent enregistré' }); this.load(); },
      error: err => { this.error = err.error?.message || 'Enregistrement impossible'; }
    });
  }

  resetPin(a: Agent) {
    this.confirm.confirm({
      message: `Générer un nouveau PIN pour ${a.firstName} ${a.lastName} ? L'ancien code ne fonctionnera plus.`,
      accept: () => this.api.resetPin(a.id).subscribe({
        next: r => { this.pin = r.pin; this.pinAgent = `${a.firstName} ${a.lastName}`; this.showPin = true; this.load(); },
        error: err => this.messages.add({ severity: 'error', summary: 'Erreur', detail: err.error?.message || 'Impossible de générer le PIN' })
      })
    });
  }

  openCreds(a: Agent) {
    this.credAgent = a; this.credEmail = a.email.endsWith('@agents.invalid') ? '' : a.email; this.credPassword = ''; this.credError = ''; this.credResult = null; this.showCreds = true;
  }

  saveCreds() {
    if (!this.credAgent) return;
    this.credError = '';
    this.api.setCredentials(this.credAgent.id, this.credEmail, this.credPassword || undefined).subscribe({
      next: r => { this.credResult = r; this.load(); },
      error: err => { this.credError = err.error?.message || (err.error?.errors ? 'Email invalide' : 'Création impossible'); }
    });
  }

  toggleActive(a: Agent) {
    this.api.setAgentActive(a.id, !a.isActive).subscribe({
      next: () => { this.messages.add({ severity: 'success', summary: 'Mis à jour', detail: a.isActive ? 'Agent désactivé' : 'Agent réactivé' }); this.load(); },
      error: err => this.messages.add({ severity: 'error', summary: 'Erreur', detail: err.error?.message || 'Action impossible' })
    });
  }

  template() { this.api.template('agents').subscribe(b => downloadBlob(b, 'modele-agents.csv')); }
}
