import { Component, OnInit } from '@angular/core';
import { ConfirmationService, MessageService } from 'primeng/api';
import { AdminApiService, HolidayDef } from '../services/admin-api.service';

@Component({
  selector: 'app-holidays',
  standalone: false,
  template: `
    <div class="ec-page">
      <div class="ec-page-header">
        <div>
          <h1 class="ec-display">Jours fériés</h1>
          <p class="ec-mono">UTILISÉS SI LE DÉCOMPTE LES EXCLUT (PARAMÈTRES « RÈGLES »)</p>
        </div>
      </div>
      <div class="ec-info-box">Aucune liste n'est fournie par défaut : saisissez ou importez les jours fériés <b>fixés par les textes en vigueur</b> (les fêtes religieuses mobiles changent chaque année). Ils ne sont retirés du décompte que si l'option correspondante est activée dans « Règles ».</div>

      <div class="ec-toolbar-row">
        <select class="ec-select" style="max-width:140px" [(ngModel)]="year" (ngModelChange)="load()"><option *ngFor="let y of years" [ngValue]="y">{{ y }}</option></select>
        <input pInputText type="date" [(ngModel)]="date" />
        <input pInputText style="flex:1" placeholder="Libellé (ex. Fête du Travail)" [(ngModel)]="label" />
        <button pButton type="button" label="Ajouter" icon="pi pi-plus" class="p-button-success" [disabled]="!date || !label.trim()" (click)="add()"></button>
      </div>
      <div class="ec-error-box" *ngIf="error">{{ error }}</div>

      <div class="ec-panel">
        <table class="ec-table">
          <thead><tr><th>Date</th><th>Jour</th><th>Libellé</th><th></th></tr></thead>
          <tbody>
            <tr *ngFor="let h of items"><td>{{ h.date | date:'dd/MM/yyyy' }}</td><td>{{ h.date | date:'EEEE' }}</td><td>{{ h.label }}</td>
              <td class="ec-cell-actions"><button class="ec-icon-btn danger" (click)="remove(h)" title="Supprimer"><i class="pi pi-trash"></i></button></td></tr>
            <tr *ngIf="!items.length"><td colspan="4" class="ec-empty">Aucun jour férié pour {{ year }}.</td></tr>
          </tbody>
        </table>
      </div>

      <app-csv-import title="Importer des jours fériés (CSV)" help="Colonnes : date (JJ/MM/AAAA ou AAAA-MM-JJ) ; libelle. Une date déjà présente est mise à jour."
        [runImport]="runImport" (download)="template()" (imported)="load()"></app-csv-import>
    </div>
  `
})
export class HolidaysComponent implements OnInit {
  year = new Date().getFullYear();
  years = [this.year - 1, this.year, this.year + 1, this.year + 2];
  items: HolidayDef[] = [];
  date = ''; label = ''; error = '';
  runImport = (csv: string, dryRun: boolean) => this.api.importHolidays(csv, dryRun);

  constructor(private api: AdminApiService, private messages: MessageService, private confirm: ConfirmationService) {}

  ngOnInit() { this.load(); }
  load() { this.api.holidays(this.year).subscribe(h => (this.items = h)); }

  add() {
    this.error = '';
    this.api.createHoliday(this.date, this.label.trim()).subscribe({
      next: () => { this.date = ''; this.label = ''; this.messages.add({ severity: 'success', summary: 'Ajouté', detail: 'Jour férié enregistré' }); this.load(); },
      error: e => { this.error = e.error?.message || 'Ajout impossible'; }
    });
  }

  remove(h: HolidayDef) {
    this.confirm.confirm({ message: `Supprimer « ${h.label} » ?`, accept: () => this.api.deleteHoliday(h.id).subscribe({ next: () => this.load() }) });
  }

  template() {
    const blob = new Blob(['﻿date;libelle\n01/05/' + this.year + ';Fête du Travail\n'], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a'); a.href = window.URL.createObjectURL(blob); a.download = 'modele-jours-feries.csv'; a.click();
  }
}
