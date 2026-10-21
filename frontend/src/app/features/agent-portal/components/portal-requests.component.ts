import { Component, EventEmitter, OnDestroy, OnInit, Output } from '@angular/core';
import { Subject, Subscription, debounceTime } from 'rxjs';
import { AbsenceTypeOption, LeaveDecisionOption, PortalBalance, PortalRequest, PortalService, PortalService_, PreviewResult } from '../portal.service';

type View = 'home' | 'form' | 'attachments' | 'detail';

const STATUS: Record<string, string> = { DRAFT: 'Brouillon', IN_PROGRESS: 'En cours', RETURNED: 'À corriger', APPROVED: 'Approuvée', REJECTED: 'Rejetée', CANCELLED: 'Annulée' };
const RESULT: Record<string, string> = { PENDING: 'En attente', FAVORABLE: 'Avis favorable', UNFAVORABLE: 'Avis défavorable', APPROVED: 'Approuvé', REJECTED: 'Rejeté', RETURNED: 'Retourné pour correction' };

/** Démarches de l'agent : choix, formulaire pré-rempli, pièces, dépôt, suivi. Mobile d'abord. */
@Component({
  selector: 'app-portal-requests',
  standalone: false,
  template: `
    <div *ngIf="error && view !== 'form'" class="pr-error">{{ error }}</div>

    <!-- ACCUEIL -->
    <div *ngIf="view === 'home'">
      <div class="pr-balance" *ngIf="balance">
        <h3 style="margin-top:6px">Mon solde {{ balance.year }}</h3>
        <div class="pr-warn" *ngIf="!balance.entitlement.eligible">{{ balance.entitlement.reason }}</div>
        <div class="pr-bal-row" *ngIf="balance.entitlement.eligible">
          <div><b>{{ balance.annual.remaining }}</b><small>jours de congé restants</small></div>
          <div><b>{{ balance.annual.consumed }}</b><small>pris</small></div>
          <div><b>{{ balance.annual.takeable }}</b><small>à prendre (décision)</small></div>
        </div>
        <div class="pr-hint" *ngFor="let a of balance.absences">
          <ng-container *ngIf="a.cap !== null">{{ a.name }} : <b>{{ a.remaining }}</b> jour(s) restant(s) sur {{ a.cap }}</ng-container>
        </div>
      </div>

      <h3>Mes démarches</h3>
      <button *ngFor="let s of services" class="pr-service" [disabled]="!s.available" (click)="start(s)">
        <span>{{ s.name }}</span>
        <small *ngIf="!s.available">{{ s.reason }}</small>
        <i class="pi pi-chevron-right" *ngIf="s.available"></i>
      </button>

      <h3 style="margin-top:20px">Mes demandes</h3>
      <p class="pr-hint" *ngIf="!requests.length">Aucune demande pour le moment.</p>
      <button *ngFor="let r of requests" class="pr-request" (click)="open(r)">
        <div><b>{{ r.type.name }}</b><br /><span class="pr-hint">{{ r.reference }}{{ r.submittedAt ? ' · ' + (r.submittedAt | date:'dd/MM/yyyy') : '' }}</span></div>
        <span class="pr-badge" [class.ok]="r.status === 'APPROVED'" [class.warn]="r.status === 'IN_PROGRESS' || r.status === 'RETURNED' || r.status === 'DRAFT'" [class.bad]="r.status === 'REJECTED' || r.status === 'CANCELLED'">{{ statusLabel(r.status) }}</span>
      </button>
    </div>

    <!-- FORMULAIRE -->
    <form *ngIf="view === 'form' && current" (ngSubmit)="save()" (input)="change$.next()" (change)="change$.next()">
      <button type="button" class="pr-back" (click)="home()"><i class="pi pi-arrow-left"></i> Retour</button>
      <h3>{{ typeName() }}</h3>
      <p class="pr-hint">Les informations vous concernant (identité, matricule, affectation, supérieurs) sont reprises automatiquement dans le document.</p>
      <div class="pr-error" *ngIf="error">{{ error }}</div>

      <ng-container [ngSwitch]="typeCode">
        <!-- Décision de congé -->
        <ng-container *ngSwitchCase="'DECISION_CONGE'">
          <label>Année du congé *</label>
          <select name="year" [(ngModel)]="f.year"><option *ngFor="let y of years" [ngValue]="y">{{ y }}</option></select>
          <small class="pr-err" *ngIf="fe.year">{{ fe.year }}</small>
          <label>Destinations *</label>
          <textarea name="destinations" rows="2" [(ngModel)]="f.destinations" placeholder="dans les pays de l'Afrique, aux USA et dans les pays membres de l'Union européenne"></textarea>
          <small class="pr-hint">La phrase sera : « …pour en jouir <i>votre texte</i>. »</small>
          <small class="pr-err" *ngIf="fe.destinations">{{ fe.destinations }}</small>
          <label>N° du timbre électronique (e-timbre) *</label>
          <input name="stamp" inputmode="numeric" [(ngModel)]="f.eStampNumber" placeholder="1790 8872 0082" />
          <small class="pr-err" *ngIf="fe.eStampNumber">{{ fe.eStampNumber }}</small>
          <label>N° de votre dernière décision de congé (facultatif)</label>
          <input name="prevnum" [(ngModel)]="f.previousDecisionNumber" placeholder="2025-14-01049/MEF/SG/DRH" />
          <label *ngIf="f.previousDecisionNumber">Date de cette décision</label>
          <input *ngIf="f.previousDecisionNumber" name="prevdate" type="date" [(ngModel)]="f.previousDecisionDate" />
          <small class="pr-err" *ngIf="fe.previousDecisionDate">{{ fe.previousDecisionDate }}</small>
        </ng-container>

        <!-- Jouissance -->
        <ng-container *ngSwitchCase="'JOUISSANCE_CONGE'">
          <label>Décision de congé *</label>
          <select name="decision" [(ngModel)]="f.leaveDecisionId">
            <option [ngValue]="undefined">— Choisir —</option>
            <option *ngFor="let d of decisions" [ngValue]="d.id">N° {{ d.number }} ({{ d.year }}) — {{ d.remainingDays }} jour(s) restant(s)</option>
          </select>
          <small class="pr-err" *ngIf="fe.leaveDecisionId">{{ fe.leaveDecisionId }}</small>
          <label>Du *</label><input name="start" type="date" [(ngModel)]="f.startDate" [min]="today" />
          <small class="pr-err" *ngIf="fe.startDate">{{ fe.startDate }}</small>
          <label>Au (inclus) *</label><input name="end" type="date" [(ngModel)]="f.endDate" [min]="f.startDate || today" />
          <small class="pr-err" *ngIf="fe.endDate">{{ fe.endDate }}</small>
          <p class="pr-info" *ngIf="days()">Durée : <b>{{ days() }} jour(s)</b> calendaires</p>
          <label>Lieu de jouissance *</label>
          <input name="dest" [(ngModel)]="f.destination" placeholder="au Burkina Faso et en Côte d'Ivoire" />
          <small class="pr-err" *ngIf="fe.destination">{{ fe.destination }}</small>
        </ng-container>

        <!-- Absence -->
        <ng-container *ngSwitchCase="'AUTORISATION_ABSENCE'">
          <label>Type d'absence *</label>
          <select name="abs" [(ngModel)]="f.absenceTypeId" (ngModelChange)="onAbsenceType()">
            <option [ngValue]="undefined">— Choisir —</option>
            <option *ngFor="let a of absenceTypes" [ngValue]="a.id">{{ a.name }}{{ a.annualCap ? ' (' + a.annualCap + ' j/an max)' : '' }}</option>
          </select>
          <small class="pr-err" *ngIf="fe.absenceTypeId">{{ fe.absenceTypeId }}</small>
          <label>Date de début *</label><input name="astart" type="date" [(ngModel)]="f.startDate" [min]="today" />
          <small class="pr-err" *ngIf="fe.startDate">{{ fe.startDate }}</small>
          <label class="pr-check"><input type="checkbox" name="multi" [(ngModel)]="multiDay" /> Sur plusieurs jours</label>
          <ng-container *ngIf="multiDay"><label>Date de fin (incluse)</label><input name="aend" type="date" [(ngModel)]="f.endDate" [min]="f.startDate || today" /></ng-container>
          <small class="pr-err" *ngIf="fe.endDate">{{ fe.endDate }}</small>
          <ng-container *ngIf="unit() !== 'JOUR'">
            <label class="pr-check" *ngIf="unit() === 'BOTH'"><input type="checkbox" name="inhours" [(ngModel)]="inHours" /> Exprimer en heures</label>
            <ng-container *ngIf="unit() === 'HEURE' || inHours"><label>Nombre d'heures *</label><input name="hours" type="number" min="1" [(ngModel)]="f.durationHours" placeholder="24" /></ng-container>
            <small class="pr-err" *ngIf="fe.durationHours">{{ fe.durationHours }}</small>
          </ng-container>
          <label>Motif *</label>
          <input name="motif" [(ngModel)]="f.motif" placeholder="des raisons de famille" />
          <small class="pr-hint">La phrase sera : « …pour <i>votre motif</i>. »</small>
          <small class="pr-err" *ngIf="fe.motif">{{ fe.motif }}</small>
        </ng-container>
      </ng-container>

      <div class="pr-info" *ngFor="let l of pvLines()">{{ l }}</div>
      <div class="pr-error" *ngFor="let m of pvErrors()">{{ m }}</div>
      <button type="submit" class="pr-btn" [disabled]="busy">{{ busy ? 'Vérification…' : 'Continuer' }}</button>
    </form>

    <!-- PIÈCES + RÉCAPITULATIF -->
    <div *ngIf="view === 'attachments' && current">
      <button type="button" class="pr-back" (click)="editCurrent()"><i class="pi pi-arrow-left"></i> Modifier</button>
      <h3>Vérifiez votre demande</h3>
      <dl class="pr-dl"><ng-container *ngFor="let l of summary()"><dt>{{ l.k }}</dt><dd>{{ l.v }}</dd></ng-container></dl>
      <div *ngIf="current.type.attachmentRules.length">
        <h4>Pièces justificatives</h4>
        <div *ngFor="let a of current.type.attachmentRules" class="pr-att">
          <div><b>{{ a.label }}</b> <span class="pr-req" *ngIf="a.required">obligatoire</span></div>
          <div *ngFor="let f of filesFor(a.code)" class="pr-file">{{ f.name }} <button type="button" (click)="removeFile(f.id)">Retirer</button></div>
          <label class="pr-upload">+ Ajouter (PDF, JPG ou PNG, 5 Mo max)<input type="file" accept="application/pdf,image/jpeg,image/png" (change)="upload($event, a.code)" hidden /></label>
        </div>
      </div>
      <div class="pr-info">En déposant, la demande est transmise à vos responsables et le document PDF est généré. Vous pourrez suivre son avancement ici.</div>
      <button type="button" class="pr-btn" [disabled]="busy" (click)="submit()">{{ busy ? 'Dépôt en cours…' : 'Déposer ma demande' }}</button>
    </div>

    <!-- DÉTAIL -->
    <div *ngIf="view === 'detail' && current">
      <button type="button" class="pr-back" (click)="home()"><i class="pi pi-arrow-left"></i> Mes démarches</button>
      <h3>{{ current.type.name }}</h3>
      <p><span class="pr-badge" [class.ok]="current.status === 'APPROVED'" [class.warn]="current.status === 'IN_PROGRESS' || current.status === 'RETURNED'" [class.bad]="current.status === 'REJECTED' || current.status === 'CANCELLED'">{{ statusLabel(current.status) }}</span>
        <span class="pr-hint"> {{ current.reference }}</span></p>
      <div class="pr-ok" *ngIf="justSubmitted">Votre demande a été déposée sous la référence <b>{{ current.reference }}</b>.</div>
      <dl class="pr-dl"><ng-container *ngFor="let l of summary()"><dt>{{ l.k }}</dt><dd>{{ l.v }}</dd></ng-container>
        <ng-container *ngIf="current.issuedDecision"><dt>Décision de congé</dt><dd>N° {{ current.issuedDecision.number }}</dd></ng-container></dl>

      <h4>Avancement</h4>
      <div *ngFor="let s of current.progress" class="pr-step" [class.active]="s.isActive">
        <div>{{ s.label }}</div>
        <div class="pr-hint" *ngIf="s.result !== 'PENDING'">{{ resultLabel(s.result) }} — {{ s.actorName }}, le {{ s.decidedAt | date:'dd/MM/yyyy' }}<span *ngIf="s.comment"><br />« {{ s.comment }} »</span></div>
        <div class="pr-hint" *ngIf="s.result === 'PENDING'">{{ s.isActive ? 'En cours de traitement' : 'En attente' }}</div>
      </div>
      <div class="pr-warn" *ngIf="current.status === 'RETURNED'">Votre demande a été retournée pour correction. Modifiez-la puis déposez-la à nouveau.</div>

      <button type="button" class="pr-btn" *ngIf="current.status === 'RETURNED'" (click)="editCurrent()">Corriger ma demande</button>
      <button type="button" class="pr-btn pr-btn-light" *ngIf="current.documents.length" (click)="download()">Télécharger le document PDF</button>
      <button type="button" class="pr-btn pr-btn-danger" *ngIf="current.status === 'IN_PROGRESS' || current.status === 'RETURNED' || current.status === 'DRAFT'" (click)="cancel()">Annuler ma demande</button>
    </div>
  `,
  styles: [`
    h3 { font-family: var(--ec-font-display); margin: 18px 0 8px; } h4 { margin: 16px 0 6px; }
    label { display: block; font-weight: 600; font-size: .85rem; margin: 12px 0 4px; }
    input, select, textarea { width: 100%; padding: 11px 12px; border: 1px solid var(--ec-line); border-radius: 10px; font-size: 1rem; font-family: inherit; background: #fff; }
    input[type=checkbox] { width: auto; margin-right: 8px; } .pr-check { font-weight: 500; }
    .pr-hint { font-size: .8rem; color: var(--ec-ink-soft); } .pr-err { display: block; color: var(--ec-coral); font-size: .82rem; margin-top: 3px; }
    .pr-service, .pr-request { display: flex; width: 100%; align-items: center; justify-content: space-between; gap: 10px; text-align: left; padding: 14px; margin-bottom: 8px; border: 1px solid var(--ec-line); border-radius: 12px; background: #fff; font-size: .95rem; cursor: pointer; }
    .pr-service small { display: block; color: var(--ec-ink-soft); } .pr-service:disabled { opacity: .55; cursor: not-allowed; flex-wrap: wrap; }
    .pr-btn { width: 100%; margin-top: 16px; padding: 14px; border: none; border-radius: 12px; background: var(--ec-ink); color: #fff; font-size: 1rem; font-weight: 600; cursor: pointer; }
    .pr-btn:disabled { opacity: .5; } .pr-btn-light { background: #fff; color: var(--ec-ink); border: 1px solid var(--ec-line); margin-top: 8px; } .pr-btn-danger { background: #fff; color: var(--ec-coral); border: 1px solid var(--ec-coral); margin-top: 8px; }
    .pr-back { border: none; background: none; color: var(--ec-ink-soft); font-size: .9rem; cursor: pointer; padding: 0; }
    .pr-badge { font-family: var(--ec-font-mono); font-size: .68rem; padding: 3px 9px; border-radius: 999px; background: #EEF0F8; white-space: nowrap; }
    .pr-badge.ok { background: #EAF6F6; color: var(--ec-teal); } .pr-badge.warn { background: #FBF3E3; color: #9A7421; } .pr-badge.bad { background: #FBEAEA; color: var(--ec-coral); }
    .pr-error { padding: 10px 12px; background: #FBEAEA; color: var(--ec-coral); border-radius: 10px; font-size: .88rem; margin: 10px 0; }
    .pr-info { padding: 10px 12px; background: #EAF6F6; color: #0B6B6D; border-radius: 10px; font-size: .85rem; margin: 12px 0; }
    .pr-balance { padding: 4px 14px 10px; background: #FAFAF8; border: 1px solid var(--ec-line); border-radius: 12px; margin-bottom: 8px; }
    .pr-bal-row { display: flex; gap: 8px; margin: 6px 0 8px; } .pr-bal-row div { flex: 1; text-align: center; } .pr-bal-row b { display: block; font-size: 1.5rem; font-family: var(--ec-font-display); } .pr-bal-row small { font-size: .7rem; color: var(--ec-ink-soft); }
    .pr-ok { padding: 10px 12px; background: #EAF6F6; color: #0B6B6D; border-radius: 10px; font-size: .9rem; margin: 10px 0; }
    .pr-warn { padding: 10px 12px; background: #FBF3E3; color: #7a5a16; border-radius: 10px; font-size: .88rem; margin: 10px 0; }
    .pr-dl { display: grid; grid-template-columns: 1fr 1.6fr; gap: 6px 12px; font-size: .88rem; } .pr-dl dt { color: var(--ec-ink-soft); } .pr-dl dd { margin: 0; font-weight: 500; }
    .pr-step { padding: 9px 12px; border-left: 3px solid var(--ec-line); margin-bottom: 8px; font-size: .9rem; } .pr-step.active { border-left-color: var(--ec-brass); background: #fcfaf3; }
    .pr-att { padding: 10px; border: 1px dashed var(--ec-line); border-radius: 10px; margin-bottom: 8px; font-size: .9rem; }
    .pr-req { font-size: .7rem; color: var(--ec-coral); } .pr-file { font-size: .85rem; margin: 4px 0; } .pr-file button { border: none; background: none; color: var(--ec-coral); cursor: pointer; }
    .pr-upload { display: inline-block; margin-top: 6px; color: var(--ec-teal); font-weight: 600; cursor: pointer; font-size: .88rem; }
  `]
})
export class PortalRequestsComponent implements OnInit, OnDestroy {
  @Output() expired = new EventEmitter<void>();

  view: View = 'home';
  services: PortalService_[] = [];
  requests: PortalRequest[] = [];
  decisions: LeaveDecisionOption[] = [];
  absenceTypes: AbsenceTypeOption[] = [];
  typeCode = '';
  current: PortalRequest | null = null;
  f: any = {};
  fe: any = {};
  error = ''; busy = false; justSubmitted = false;
  multiDay = false; inHours = false;
  today = new Date().toISOString().slice(0, 10);
  years = [new Date().getFullYear(), new Date().getFullYear() + 1];

  constructor(private portal: PortalService) {}

  balance: PortalBalance | null = null;
  pv: PreviewResult | null = null;
  change$ = new Subject<void>();
  private sub = new Subscription();

  ngOnInit() {
    // Aperçu pendant la saisie : durée décomptée, droit ouvert, plafonds restants (rien n'est enregistré)
    this.sub.add(this.change$.pipe(debounceTime(600)).subscribe(() => this.runPreview()));
    this.home();
  }
  ngOnDestroy() { this.sub.unsubscribe(); }

  private runPreview() {
    if (this.view !== 'form') return;
    const fields = this.cleanFields();
    this.portal.preview(this.typeCode, fields).subscribe({ next: r => (this.pv = r), error: () => (this.pv = null) });
  }

  /** Champs à envoyer : on retire ceux qui ne s'appliquent pas selon les cases cochées. */
  private cleanFields() {
    const fields = { ...this.f };
    if (this.typeCode === 'AUTORISATION_ABSENCE') {
      if (!this.multiDay) delete fields['endDate'];
      if (!(this.unit() === 'HEURE' || this.inHours)) delete fields['durationHours'];
    }
    return fields;
  }

  /** Messages d'aperçu : uniquement pour les champs déjà renseignés (pas d'erreur sur un formulaire encore vide). */
  pvErrors(): string[] {
    if (!this.pv || this.pv.ok) return [];
    return Object.entries(this.pv.errors).filter(([k]) => this.f[k] !== undefined && this.f[k] !== '' && this.f[k] !== null).map(([, m]) => m);
  }

  pvLines(): string[] {
    if (!this.pv?.ok) return [];
    const i: any = this.pv.info, out: string[] = [];
    if (this.typeCode === 'DECISION_CONGE' && i.entitlementDays) out.push(`Droit ouvert pour ${this.f['year']} : ${i.entitlementDays} jours.`);
    if (this.typeCode === 'JOUISSANCE_CONGE' && i.durationDays) out.push(`Durée décomptée : ${i.durationDays} jour(s) — tranche ${i.fraction}/${i.maxFractions}, il restera ${i.remainingAfter} jour(s) sur la décision.`);
    if (this.typeCode === 'AUTORISATION_ABSENCE' && i.durationDays) {
      out.push(`Durée décomptée : ${i.durationDays} jour(s).`);
      for (const [yr, c] of Object.entries<any>(i.cap || {})) out.push(`Plafond ${yr} : il vous restera ${c.remainingAfter} jour(s) sur ${c.cap}.`);
    }
    return out;
  }

  statusLabel(s: string) { return STATUS[s] || s; }
  resultLabel(s: string) { return RESULT[s] || s; }
  typeName() { return this.services.find(s => s.code === this.typeCode)?.name || ''; }

  private fail(e: any) {
    if (e.status === 401 || (e.status === 404 && e.error?.code === 'CARD_INVALID')) { this.expired.emit(); return; }
    this.error = e.error?.message || 'Une erreur est survenue. Réessayez.';
    this.fe = e.error?.errors || {};
    this.busy = false;
  }

  home() {
    this.view = 'home'; this.error = ''; this.current = null; this.justSubmitted = false;
    this.portal.services().subscribe({ next: s => (this.services = s), error: e => this.fail(e) });
    this.portal.balance().subscribe({ next: b => (this.balance = b), error: () => (this.balance = null) });
    this.portal.requests().subscribe({ next: r => (this.requests = r), error: e => this.fail(e) });
  }

  start(s: PortalService_) {
    this.typeCode = s.code; this.current = null; this.fe = {}; this.error = ''; this.multiDay = false; this.inHours = false;
    this.f = s.code === 'DECISION_CONGE' ? { year: this.years[0] } : {};
    if (s.code === 'JOUISSANCE_CONGE') this.portal.decisions().subscribe({ next: d => { this.decisions = d; if (d.length === 1) this.f['leaveDecisionId'] = d[0].id; }, error: e => this.fail(e) });
    if (s.code === 'AUTORISATION_ABSENCE') this.portal.absenceTypes().subscribe({ next: a => (this.absenceTypes = a), error: e => this.fail(e) });
    this.view = 'form'; this.pv = null;
    this.current = { id: '', type: { code: s.code, name: s.name, attachmentRules: s.attachmentRules }, progress: [], previousRounds: [], documents: [], attachments: [], data: {}, reference: '', status: 'DRAFT', round: 1, submittedAt: null };
  }

  open(r: PortalRequest) {
    this.portal.request(r.id).subscribe({ next: x => { this.current = x; this.typeCode = x.type.code; this.view = 'detail'; this.error = ''; }, error: e => this.fail(e) });
  }

  unit() { return this.absenceTypes.find(a => a.id === this.f['absenceTypeId'])?.unit || 'BOTH'; }
  onAbsenceType() { this.inHours = this.unit() === 'HEURE'; if (this.unit() === 'JOUR') delete this.f['durationHours']; }
  days(): number | null {
    const s = this.f['startDate'], e = this.f['endDate'];
    if (!s || !e || e < s) return null;
    return Math.round((Date.parse(e) - Date.parse(s)) / 86400000) + 1;
  }

  /** Crée le brouillon (ou met à jour la demande en cours de correction) après validation par le serveur. */
  save() {
    this.busy = true; this.error = ''; this.fe = {};
    const fields = { ...this.f };
    if (this.typeCode === 'AUTORISATION_ABSENCE') {
      if (!this.multiDay) delete fields['endDate'];
      if (!(this.unit() === 'HEURE' || this.inHours)) delete fields['durationHours'];
    }
    const id = this.current?.id;
    const req = id ? this.portal.updateRequest(id, fields) : this.portal.createRequest(this.typeCode, fields);
    req.subscribe({
      next: r => { this.busy = false; this.current = r; this.view = 'attachments'; },
      error: e => this.fail(e)
    });
  }

  editCurrent() {
    if (!this.current) return;
    this.f = { ...this.current.data }; this.typeCode = this.current.type.code; this.fe = {}; this.error = '';
    this.multiDay = !!this.f['endDate'] && this.f['endDate'] !== this.f['startDate'];
    this.inHours = !!this.f['durationHours'];
    if (this.typeCode === 'JOUISSANCE_CONGE') this.portal.decisions().subscribe(d => (this.decisions = d));
    if (this.typeCode === 'AUTORISATION_ABSENCE') this.portal.absenceTypes().subscribe(a => (this.absenceTypes = a));
    this.view = 'form';
  }

  summary(): { k: string; v: string }[] {
    const d = this.current?.data || {};
    const fmt = (s: string) => s.split('-').reverse().join('/');
    const out: { k: string; v: string }[] = [];
    const add = (k: string, v: any) => { if (v !== undefined && v !== null && v !== '') out.push({ k, v: String(v) }); };
    add('Année', d['year']); add('Destinations', d['destinations']); add('E-timbre N°', d['eStampNumber']);
    add('Du', d['startDate'] && fmt(d['startDate'])); add('Au', d['endDate'] && d['endDate'] !== d['startDate'] ? fmt(d['endDate']) : null);
    add('Durée', d['durationHours'] ? d['durationHours'] + ' heure(s)' : d['durationDays'] ? d['durationDays'] + ' jour(s)' : null);
    add('Lieu', d['destination']); add("Type d'absence", d['absenceTypeName']); add('Motif', d['motif']);
    return out;
  }

  filesFor(code: string) { return (this.current?.attachments || []).filter(a => a.code === code); }

  upload(event: Event, code: string) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file || !this.current) return;
    this.error = '';
    this.portal.uploadAttachment(this.current.id, file, code).subscribe({
      next: () => { input.value = ''; this.refreshCurrent(); },
      error: e => { input.value = ''; this.fail(e); }
    });
  }

  removeFile(id: string) { if (this.current) this.portal.removeAttachment(this.current.id, id).subscribe({ next: () => this.refreshCurrent(), error: e => this.fail(e) }); }
  private refreshCurrent() { if (this.current) this.portal.request(this.current.id).subscribe({ next: r => (this.current = r), error: e => this.fail(e) }); }

  submit() {
    if (!this.current) return;
    this.busy = true; this.error = '';
    this.portal.submitRequest(this.current.id).subscribe({
      next: r => { this.busy = false; this.current = r; this.view = 'detail'; this.justSubmitted = true; },
      error: e => this.fail(e)
    });
  }

  cancel() {
    if (!this.current || !window.confirm('Annuler cette demande ?')) return;
    this.portal.cancelRequest(this.current.id).subscribe({ next: r => (this.current = r), error: e => this.fail(e) });
  }

  download() {
    if (!this.current) return;
    this.portal.documentBlob(this.current.id).subscribe({
      next: b => { const a = document.createElement('a'); a.href = window.URL.createObjectURL(b); a.download = `${this.current!.reference}.pdf`; document.body.appendChild(a); a.click(); a.remove(); },
      error: e => this.fail(e)
    });
  }
}
