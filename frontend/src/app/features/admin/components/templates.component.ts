import { Component, OnInit } from '@angular/core';
import { MessageService } from 'primeng/api';
import { AdminApiService, FormTemplateDef } from '../services/admin-api.service';

const NAMES: Record<string, string> = { DECISION_CONGE: 'Demande de décision de congé', JOUISSANCE_CONGE: 'Demande de jouissance de congé', AUTORISATION_ABSENCE: "Demande d'autorisation d'absence" };

@Component({
  selector: 'app-templates',
  standalone: false,
  template: `
    <div class="ec-page">
      <div class="ec-page-header">
        <div>
          <h1 class="ec-display">Modèles de documents</h1>
          <p class="ec-mono">MODÈLES PDF DES FORMULAIRES — VERSIONNÉS</p>
        </div>
      </div>
      <div class="ec-info-box">Chaque enregistrement crée une <b>nouvelle version</b> : les documents déjà générés ne changent pas. Les données saisies sont insérées avec la syntaxe <code>{{ '{{variable}}' }}</code> (échappées automatiquement). Utilisez l'aperçu avant de publier.</div>

      <div class="ec-toolbar-row">
        <select class="ec-select" style="max-width:380px" [(ngModel)]="typeCode" (ngModelChange)="select()">
          <option *ngFor="let t of codes" [value]="t">{{ name(t) }}</option>
        </select>
        <span class="ec-hint" *ngIf="active">Version active : v{{ active.version }}</span>
      </div>

      <div class="ec-panel ec-panel-pad" *ngIf="active">
        <div class="p-field"><label>HTML du modèle</label><textarea class="ec-textarea" style="min-height:340px" [(ngModel)]="html" spellcheck="false"></textarea></div>
        <div class="p-field" style="margin-top:12px"><label>Feuille de style (CSS)</label><textarea class="ec-textarea" style="min-height:200px" [(ngModel)]="css" spellcheck="false"></textarea></div>
        <div class="ec-error-box" *ngIf="error" style="margin-top:12px">{{ error }}</div>
        <div class="ec-form-actions">
          <button pButton type="button" label="Revenir à la version active" class="p-button-text" (click)="select()"></button>
          <button pButton type="button" label="Aperçu PDF" icon="pi pi-file-pdf" class="p-button-warning" [disabled]="busy" (click)="preview()"></button>
          <button pButton type="button" label="Publier une nouvelle version" icon="pi pi-check" class="p-button-success" [disabled]="busy || !changed" (click)="publish()"></button>
        </div>
      </div>

      <h2 class="ec-section-title">Variables disponibles</h2>
      <div class="ec-panel ec-panel-pad"><span class="ec-badge" style="margin:3px" *ngFor="let v of variables">{{ v }}</span></div>

      <h2 class="ec-section-title">Versions</h2>
      <div class="ec-panel">
        <table class="ec-table"><thead><tr><th>Version</th><th>Créée le</th><th>Statut</th></tr></thead>
          <tbody><tr *ngFor="let t of versions"><td>v{{ t.version }}</td><td>{{ t.createdAt | date:'dd/MM/yyyy HH:mm' }}</td><td><span class="ec-badge" [class.ok]="t.isActive">{{ t.isActive ? 'Active' : 'Archivée' }}</span></td></tr></tbody></table>
      </div>
    </div>
  `
})
export class TemplatesComponent implements OnInit {
  all: FormTemplateDef[] = [];
  codes = Object.keys(NAMES);
  typeCode = 'DECISION_CONGE';
  active: FormTemplateDef | null = null;
  versions: FormTemplateDef[] = [];
  variables: string[] = [];
  html = ''; css = '';
  error = ''; busy = false;

  constructor(private api: AdminApiService, private messages: MessageService) {}

  get changed() { return !!this.active && (this.html !== this.active.html || this.css !== this.active.css); }
  name(c: string) { return NAMES[c] || c; }

  ngOnInit() { this.api.templateVariables().subscribe(v => (this.variables = v)); this.load(); }
  load() { this.api.templates().subscribe(t => { this.all = t; this.select(); }); }

  select() {
    this.error = '';
    this.versions = this.all.filter(t => t.typeCode === this.typeCode);
    this.active = this.versions.find(t => t.isActive) || null;
    this.html = this.active?.html || ''; this.css = this.active?.css || '';
  }

  preview() {
    this.busy = true; this.error = '';
    this.api.previewTemplate(this.typeCode, this.html, this.css).subscribe({
      next: b => { this.busy = false; window.open(window.URL.createObjectURL(b), '_blank'); },
      error: async e => { this.busy = false; this.error = await this.readError(e); }
    });
  }

  publish() {
    this.busy = true; this.error = '';
    this.api.publishTemplate(this.typeCode, this.html, this.css).subscribe({
      next: t => { this.busy = false; this.messages.add({ severity: 'success', summary: 'Modèle publié', detail: `Version ${t.version} active` }); this.load(); },
      error: async e => { this.busy = false; this.error = await this.readError(e); }
    });
  }

  private async readError(e: any): Promise<string> {
    if (e.error instanceof Blob) { try { return JSON.parse(await e.error.text()).message; } catch { return 'Erreur'; } }
    return e.error?.message || 'Erreur';
  }
}
