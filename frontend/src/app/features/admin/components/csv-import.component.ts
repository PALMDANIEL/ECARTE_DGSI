import { Component, EventEmitter, Input, Output } from '@angular/core';
import { Observable } from 'rxjs';
import { MessageService } from 'primeng/api';
import { ImportReport } from '../services/admin-api.service';

/**
 * Import CSV en deux temps : « Vérifier » (aucune écriture, rapport ligne par ligne) puis « Importer ».
 * L'import n'est proposé que si la vérification ne remonte aucune erreur.
 */
@Component({
  selector: 'app-csv-import',
  standalone: false,
  template: `
    <div class="ec-panel ec-panel-pad">
      <div class="ec-toolbar-row">
        <strong>{{ title }}</strong>
        <span style="flex:1"></span>
        <button pButton type="button" label="Télécharger le modèle" icon="pi pi-download" class="p-button-text" (click)="download.emit()"></button>
      </div>
      <p class="ec-hint" style="margin-bottom:10px">{{ help }}</p>

      <input type="file" accept=".csv,text/csv,.txt" (change)="onFile($event)" />
      <textarea class="ec-textarea" style="margin-top:10px" [(ngModel)]="csv" (ngModelChange)="reset()" placeholder="…ou collez ici le contenu CSV"></textarea>

      <div class="ec-form-actions">
        <button pButton type="button" label="Vérifier" icon="pi pi-search" [disabled]="!csv.trim() || busy" (click)="run(true)"></button>
        <button pButton type="button" label="Importer" icon="pi pi-upload" class="p-button-success" [disabled]="!canImport || busy" (click)="run(false)"></button>
      </div>

      <div *ngIf="report" style="margin-top:14px">
        <div class="ec-info-box" *ngIf="!report.errors.length && report.dryRun">
          Fichier valide : {{ report.total }} ligne(s), <b>{{ report.created }}</b> à créer, <b>{{ report.updated }}</b> à mettre à jour. Cliquez sur « Importer » pour enregistrer.
        </div>
        <div class="ec-info-box" *ngIf="!report.errors.length && !report.dryRun">
          Import terminé : {{ report.created }} créé(s), {{ report.updated }} mis à jour.
        </div>
        <div class="ec-error-box" *ngIf="report.errors.length">
          <b>{{ report.errors.length }} erreur(s) — rien n'a été enregistré :</b>
          <ul style="margin:6px 0 0 18px; padding:0">
            <li *ngFor="let e of report.errors.slice(0, 50)">Ligne {{ e.line }} : {{ e.message }}</li>
          </ul>
          <span *ngIf="report.errors.length > 50">… et {{ report.errors.length - 50 }} autre(s).</span>
        </div>
      </div>
    </div>
  `
})
export class CsvImportComponent {
  @Input() title = 'Import CSV';
  @Input() help = '';
  @Input() runImport!: (csv: string, dryRun: boolean) => Observable<ImportReport>;
  @Output() download = new EventEmitter<void>();
  @Output() imported = new EventEmitter<void>();

  csv = '';
  report: ImportReport | null = null;
  busy = false;

  get canImport() { return !!this.report && this.report.dryRun && !this.report.errors.length && this.report.total > 0; }

  constructor(private messages: MessageService) {}

  reset() { this.report = null; }

  onFile(event: Event) {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => { this.csv = String(reader.result || ''); this.reset(); };
    // Les exports Excel français sont souvent en Windows-1252 : on tente UTF-8, sinon on relit en Latin-1
    reader.readAsText(file, 'utf-8');
  }

  run(dryRun: boolean) {
    this.busy = true;
    this.runImport(this.csv, dryRun).subscribe({
      next: r => {
        this.busy = false;
        this.report = r;
        if (!dryRun && !r.errors.length) { this.messages.add({ severity: 'success', summary: 'Import terminé', detail: `${r.created} créé(s), ${r.updated} mis à jour` }); this.imported.emit(); this.csv = ''; }
      },
      error: err => { this.busy = false; this.messages.add({ severity: 'error', summary: 'Erreur', detail: err.error?.message || 'Import impossible' }); }
    });
  }
}
