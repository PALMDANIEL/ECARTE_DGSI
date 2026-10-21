import { Component, EventEmitter, Input, OnChanges, Output } from '@angular/core';
import { MessageService } from 'primeng/api';
import { downloadBlob } from '../../admin/download';
import { RESULT_LABEL, RequestsApiService, RequestView, STATUS_LABEL } from '../requests-api.service';

const FIELD_LABEL: Record<string, string> = {
  year: 'Année', destinations: 'Destinations', destination: 'Lieu de jouissance', eStampNumber: 'E-timbre N°', startDate: 'Du', endDate: 'Au',
  durationDays: 'Durée (jours)', durationHours: 'Durée (heures)', motif: 'Motif', absenceTypeName: "Type d'absence", previousDecisionNumber: 'Décision précédente N°', previousDecisionDate: 'Date de la décision précédente'
};

/** Fiche d'une demande : informations, circuit, pièces, documents, et panneau d'action pour le responsable de l'étape active. */
@Component({
  selector: 'app-request-detail',
  standalone: false,
  template: `
    <p-dialog [header]="req ? req.reference + ' — ' + req.type.name : 'Demande'" [visible]="visible" (visibleChange)="visibleChange.emit($event)" [modal]="true" [style]="{ width: '46rem' }" [draggable]="false">
      <ng-container *ngIf="req">
        <div class="ec-toolbar-row">
          <span class="ec-badge" [class.ok]="req.status === 'APPROVED'" [class.warn]="req.status === 'IN_PROGRESS' || req.status === 'RETURNED'" [class.bad]="req.status === 'REJECTED' || req.status === 'CANCELLED'">{{ statusLabel(req.status) }}</span>
          <span class="ec-hint" *ngIf="req.submittedAt">Déposée le {{ req.submittedAt | date:'dd/MM/yyyy HH:mm' }}</span>
          <span class="ec-hint" *ngIf="req.round > 1">· tour {{ req.round }}</span>
        </div>

        <div *ngIf="req.agent" style="margin: 6px 0 12px">
          <strong>{{ req.agent.lastName | uppercase }} {{ req.agent.firstName }}</strong>
          <span class="ec-mono-text"> — matricule {{ req.agent.agentProfile?.matricule }}</span><br />
          <span class="ec-hint">{{ req.agent.agentProfile?.grade }}{{ req.agent.agentProfile?.orgUnit ? ' · ' + req.agent.agentProfile?.orgUnit?.name : '' }}</span>
        </div>

        <dl class="rd-dl">
          <ng-container *ngFor="let f of fields()"><dt>{{ f.label }}</dt><dd>{{ f.value }}</dd></ng-container>
          <ng-container *ngIf="req.issuedDecision"><dt>Décision de congé</dt><dd>N° {{ req.issuedDecision.number }} ({{ req.issuedDecision.days }} jours)</dd></ng-container>
        </dl>

        <h3 class="ec-section-title" style="margin-top:14px">Circuit de validation</h3>
        <div *ngFor="let s of req.progress" class="rd-step" [class.active]="s.isActive">
          <div><b>{{ s.label }}</b></div>
          <div *ngIf="s.result !== 'PENDING'" class="ec-hint">
            <span class="ec-badge" [class.ok]="s.result === 'FAVORABLE' || s.result === 'APPROVED'" [class.bad]="s.result === 'UNFAVORABLE' || s.result === 'REJECTED'" [class.warn]="s.result === 'RETURNED'">{{ resultLabel(s.result) }}</span>
            par {{ s.actorName }} le {{ s.decidedAt | date:'dd/MM/yyyy HH:mm' }}
            <div *ngIf="s.comment" style="margin-top:3px; color: var(--ec-ink)">« {{ s.comment }} »</div>
          </div>
          <div *ngIf="s.result === 'PENDING'" class="ec-hint">{{ s.isActive ? 'À traiter' : 'En attente' }}{{ s.dueAt ? ' — échéance ' + (s.dueAt | date:'dd/MM/yyyy') : '' }}</div>
        </div>
        <div *ngIf="req.previousRounds.length" class="ec-hint" style="margin-top:6px">
          Historique des tours précédents : <span *ngFor="let p of req.previousRounds; let last = last">{{ p.label }} — {{ resultLabel(p.result) }}{{ p.comment ? ' (« ' + p.comment + ' »)' : '' }}{{ last ? '' : ' ; ' }}</span>
        </div>

        <div *ngIf="canAct && req.status === 'IN_PROGRESS' && activeStep" class="ec-panel ec-panel-pad" style="margin-top:16px; background:#fcfaf3">
          <strong>Votre réponse : {{ activeStep.label }}</strong>
          <div style="margin:10px 0">
            <label *ngFor="let a of actions()" style="display:block; margin-bottom:6px; cursor:pointer">
              <input type="radio" name="act" [value]="a.v" [(ngModel)]="action" /> {{ a.l }}
            </label>
          </div>
          <div class="p-field" *ngIf="needsDecisionNumber()"><label>Numéro de la décision de congé *</label><input pInputText [(ngModel)]="decisionNumber" placeholder="2026-14-01049/MEF/SG/DRH" /></div>
          <div class="p-field" style="margin-top:8px"><label>Commentaire {{ commentRequired() ? '*' : '(facultatif)' }}</label><textarea class="ec-select" rows="3" [(ngModel)]="comment" maxlength="1000"></textarea></div>
          <div class="ec-error-box" *ngIf="error" style="margin-top:8px">{{ error }}</div>
          <div class="ec-form-actions"><button pButton type="button" label="Valider ma réponse" icon="pi pi-check" [disabled]="!action || busy" (click)="submitAct()"></button></div>
        </div>

        <div class="ec-toolbar-row" style="margin-top:14px">
          <button pButton type="button" label="Voir le document PDF" icon="pi pi-file-pdf" class="p-button-text" *ngIf="req.documents.length" (click)="openDocument()"></button>
          <button pButton type="button" *ngFor="let a of req.attachments" [label]="a.name" icon="pi pi-paperclip" class="p-button-text" (click)="openAttachment(a)"></button>
        </div>
        <div class="ec-hint" *ngIf="req.documents.length">Dernière version : v{{ req.documents[0].version }} — {{ req.documents.length }} version(s) conservée(s)</div>
      </ng-container>
    </p-dialog>
  `,
  styles: [`
    .rd-dl { display: grid; grid-template-columns: 1fr 2fr; gap: 6px 12px; margin: 0; font-size: .88rem; }
    .rd-dl dt { color: var(--ec-ink-soft); } .rd-dl dd { margin: 0; font-weight: 500; }
    .rd-step { padding: 9px 12px; border-left: 3px solid var(--ec-line); margin-bottom: 8px; background: #fff; }
    .rd-step.active { border-left-color: var(--ec-brass); background: #fcfaf3; }
  `]
})
export class RequestDetailComponent implements OnChanges {
  @Input() requestId: string | null = null;
  @Input() visible = false;
  @Input() canAct = false;
  @Output() visibleChange = new EventEmitter<boolean>();
  @Output() changed = new EventEmitter<void>();

  req: RequestView | null = null;
  action = ''; comment = ''; decisionNumber = ''; error = ''; busy = false;

  constructor(private api: RequestsApiService, private messages: MessageService) {}

  statusLabel(s: string) { return STATUS_LABEL[s] || s; }
  resultLabel(s: string) { return RESULT_LABEL[s] || s; }

  get activeStep() { return this.req?.progress.find(s => s.isActive) || null; }

  ngOnChanges() { if (this.visible && this.requestId) this.load(); }

  load() {
    this.error = ''; this.action = ''; this.comment = ''; this.decisionNumber = '';
    this.api.detail(this.requestId!).subscribe({ next: r => (this.req = r), error: e => this.messages.add({ severity: 'error', summary: 'Erreur', detail: e.error?.message || 'Demande introuvable' }) });
  }

  fields(): { label: string; value: string }[] {
    const d = this.req?.data || {};
    const fmt = (k: string, v: any) => (k.toLowerCase().includes('date') && typeof v === 'string' ? v.split('-').reverse().join('/') : String(v));
    return Object.keys(FIELD_LABEL).filter(k => d[k] !== undefined && d[k] !== null && d[k] !== '').map(k => ({ label: FIELD_LABEL[k], value: fmt(k, d[k]) }));
  }

  actions(): { v: string; l: string }[] {
    return this.activeStep?.kind === 'DECISION'
      ? [{ v: 'APPROVE', l: 'Approuver' }, { v: 'REJECT', l: 'Rejeter' }, { v: 'RETURN', l: 'Retourner à l\'agent pour correction' }]
      : [{ v: 'FAVORABLE', l: 'Avis favorable' }, { v: 'UNFAVORABLE', l: 'Avis défavorable' }, { v: 'RETURN', l: 'Retourner à l\'agent pour correction' }];
  }

  needsDecisionNumber() { return this.action === 'APPROVE' && this.req?.type.code === 'DECISION_CONGE'; }
  commentRequired() { return ['UNFAVORABLE', 'REJECT', 'RETURN'].includes(this.action); }

  submitAct() {
    if (!this.req || !this.activeStep) return;
    if (this.commentRequired() && this.comment.trim().length < 3) { this.error = 'Un commentaire est obligatoire pour cette réponse.'; return; }
    if (this.needsDecisionNumber() && !this.decisionNumber.trim()) { this.error = 'Le numéro de la décision est obligatoire.'; return; }
    this.busy = true; this.error = '';
    this.api.act(this.req.id, this.activeStep.id, { action: this.action, comment: this.comment.trim() || undefined, decisionNumber: this.decisionNumber.trim() || undefined }).subscribe({
      next: r => { this.busy = false; this.req = r; this.action = ''; this.comment = ''; this.messages.add({ severity: 'success', summary: 'Réponse enregistrée', detail: this.statusLabel(r.status) }); this.changed.emit(); },
      error: e => { this.busy = false; this.error = e.error?.message || 'Action impossible'; }
    });
  }

  openDocument() { if (this.req) this.api.document(this.req.id).subscribe(b => window.open(window.URL.createObjectURL(b), '_blank')); }
  openAttachment(a: { id: string; name: string }) { if (this.req) this.api.attachment(this.req.id, a.id).subscribe(b => downloadBlob(b, a.name)); }
}
