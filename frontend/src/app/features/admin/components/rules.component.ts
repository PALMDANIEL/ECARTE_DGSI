import { Component, OnInit } from '@angular/core';
import { MessageService } from 'primeng/api';
import { AdminApiService, RuleParam } from '../services/admin-api.service';

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
      <div class="ec-info-box">Une modification ne réécrit jamais l'historique : la valeur précédente est clôturée et la nouvelle s'applique à partir de la date indiquée. Les droits de congé et plafonds d'absence seront ajoutés avec le module de demandes.</div>

      <div class="ec-panel">
        <table class="ec-table">
          <thead><tr><th>Paramètre</th><th>Valeur en vigueur</th><th>Par défaut</th><th>Référence</th><th></th></tr></thead>
          <tbody>
            <tr *ngFor="let r of rules">
              <td><b>{{ r.description }}</b><br /><span class="ec-mono-text">{{ r.key }}</span></td>
              <td><span class="ec-badge" [class.ok]="r.isCustom">{{ r.value }}</span></td>
              <td>{{ r.defaultValue }}</td>
              <td>{{ r.legalReference || '—' }}</td>
              <td class="ec-cell-actions">
                <button class="ec-icon-btn" (click)="openEdit(r)" title="Modifier"><i class="pi pi-pencil"></i></button>
                <button class="ec-icon-btn" (click)="history = history === r ? null : r" title="Historique"><i class="pi pi-history"></i></button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

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

      <p-dialog header="Modifier le paramètre" [(visible)]="showEdit" [modal]="true" [style]="{ width: '32rem' }">
        <ng-container *ngIf="editing">
          <p><b>{{ editing.description }}</b></p>
          <div class="ec-form-grid">
            <div class="p-field"><label>Nouvelle valeur *</label><input pInputText type="number" min="0" [(ngModel)]="value" /></div>
            <div class="p-field"><label>S'applique à partir du</label><input pInputText type="date" [(ngModel)]="validFrom" /></div>
            <div class="p-field full"><label>Référence légale / réglementaire</label><input pInputText [(ngModel)]="legalReference" placeholder="Ex. Loi 081-2015/CNT, art. 53" /></div>
            <div class="p-field full"><label>Commentaire</label><input pInputText [(ngModel)]="comment" /></div>
          </div>
          <div class="ec-error-box" *ngIf="error">{{ error }}</div>
          <div class="ec-form-actions">
            <button type="button" pButton label="Annuler" class="p-button-text" (click)="showEdit = false"></button>
            <button type="button" pButton label="Enregistrer" icon="pi pi-check" [disabled]="value === null" (click)="save()"></button>
          </div>
        </ng-container>
      </p-dialog>
    </div>
  `
})
export class RulesComponent implements OnInit {
  rules: RuleParam[] = [];
  history: RuleParam | null = null;
  editing: RuleParam | null = null;
  showEdit = false; error = '';
  value: number | null = null; validFrom = ''; legalReference = ''; comment = '';

  constructor(private api: AdminApiService, private messages: MessageService) {}

  ngOnInit() { this.load(); }
  load() { this.api.rules().subscribe(r => { this.rules = r; if (this.history) this.history = r.find(x => x.key === this.history!.key) || null; }); }

  openEdit(r: RuleParam) {
    this.editing = r; this.error = ''; this.value = Number(r.value); this.validFrom = ''; this.legalReference = r.legalReference || ''; this.comment = ''; this.showEdit = true;
  }

  save() {
    if (!this.editing || this.value === null) return;
    this.api.setRule(this.editing.key, { value: Number(this.value), validFrom: this.validFrom ? new Date(this.validFrom).toISOString() : undefined, legalReference: this.legalReference || undefined, comment: this.comment || undefined }).subscribe({
      next: () => { this.showEdit = false; this.messages.add({ severity: 'success', summary: 'Enregistré', detail: 'Paramètre mis à jour' }); this.load(); },
      error: err => { this.error = err.error?.message || 'Enregistrement impossible'; }
    });
  }
}
