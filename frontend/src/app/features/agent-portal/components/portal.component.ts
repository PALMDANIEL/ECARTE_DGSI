import { Component, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { PortalService, AgentFile, ScanResult } from '../portal.service';

type Step = 'loading' | 'invalid' | 'pin' | 'file';

/**
 * Page ouverte par le scan du QR. Mobile d'abord. Le scan identifie seulement (nom masqué) :
 * rien de confidentiel n'est affiché avant la saisie du PIN personnel.
 */
@Component({
  selector: 'app-portal',
  standalone: false,
  template: `
    <div class="pt-stage">
      <div class="pt-card">
        <div class="pt-brand"><i class="pi pi-id-card"></i> <span>ECARTE</span></div>

        <div *ngIf="step === 'loading'" class="pt-center"><i class="pi pi-spin pi-spinner" style="font-size:1.6rem"></i><p>Vérification de la carte…</p></div>

        <div *ngIf="step === 'invalid'" class="pt-center">
          <i class="pi pi-times-circle pt-bad"></i>
          <h2>Carte invalide</h2>
          <p>{{ message || 'Ce QR code n\\'est pas utilisable. Il a pu être révoqué, expirer ou ne pas être reconnu.' }}</p>
          <p class="pt-hint">Contactez le service des ressources humaines.</p>
        </div>

        <div *ngIf="step === 'pin' && scan">
          <div class="pt-identity">
            <img *ngIf="scan.agent.photo" [src]="scan.agent.photo" alt="" />
            <div class="pt-avatar" *ngIf="!scan.agent.photo">{{ scan.agent.displayName.charAt(0) }}</div>
            <h2>{{ scan.agent.displayName }}</h2>
            <p class="pt-hint" *ngIf="scan.agent.unit">{{ scan.agent.unit }}</p>
          </div>
          <div class="pt-warn" *ngIf="!scan.pinConfigured">Votre code PIN n'a pas encore été remis. Contactez le service des ressources humaines.</div>
          <form (ngSubmit)="submitPin()" *ngIf="scan.pinConfigured">
            <label for="pin">Entrez votre code PIN</label>
            <input id="pin" name="pin" type="password" inputmode="numeric" autocomplete="one-time-code" maxlength="12" [(ngModel)]="pin" class="pt-pin" autofocus />
            <div class="pt-error" *ngIf="message">{{ message }}</div>
            <button type="submit" class="pt-btn" [disabled]="pin.length < 4 || busy || locked">{{ busy ? 'Vérification…' : 'Continuer' }}</button>
          </form>
        </div>

        <div *ngIf="step === 'file' && file">
          <div class="pt-identity">
            <div class="pt-avatar">{{ file.agent.firstName.charAt(0) }}{{ file.agent.lastName.charAt(0) }}</div>
            <h2>{{ civility(file.agent.civility) }}{{ file.agent.firstName }} {{ file.agent.lastName | uppercase }}</h2>
            <p class="pt-hint">Matricule {{ file.agent.matricule }}</p>
          </div>
          <dl class="pt-dl">
            <dt>Administration</dt><dd>{{ file.agent.administration }}</dd>
            <dt *ngIf="file.agent.grade">Grade / emploi</dt><dd *ngIf="file.agent.grade">{{ file.agent.grade }}</dd>
            <ng-container *ngFor="let u of file.agent.orgChain"><dt>{{ typeLabel(u.type) }}</dt><dd>{{ u.name }}</dd></ng-container>
            <dt *ngIf="file.agent.supervisor">Supérieur direct</dt><dd *ngIf="file.agent.supervisor">{{ file.agent.supervisor }}</dd>
            <dt *ngIf="file.card.number">Carte n°</dt><dd *ngIf="file.card.number">{{ file.card.number }} <span class="pt-hint" *ngIf="file.card.expiresAt">(valable jusqu'au {{ file.card.expiresAt | date:'dd/MM/yyyy' }})</span></dd>
          </dl>

          <app-portal-requests (expired)="onExpired()"></app-portal-requests>

          <p class="pt-hint" style="margin-top:14px">Session ouverte pour {{ minutes }} minutes. <a href="javascript:void(0)" (click)="close()">Fermer la session</a></p>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .pt-stage { min-height: 100vh; display: flex; align-items: flex-start; justify-content: center; padding: 20px 14px; background: linear-gradient(160deg, #12172B 0%, #1d2547 100%); }
    .pt-card { width: 100%; max-width: 440px; background: #fff; border-radius: 20px; padding: 22px 20px 26px; box-shadow: 0 20px 60px rgba(0,0,0,.35); font-family: var(--ec-font-body); color: var(--ec-ink); }
    .pt-brand { display: flex; align-items: center; gap: 8px; font-family: var(--ec-font-display); font-size: 1.1rem; font-weight: 600; margin-bottom: 14px; }
    .pt-brand i { color: var(--ec-brass); }
    .pt-center { text-align: center; padding: 28px 8px; }
    .pt-center h2 { margin: 10px 0 6px; }
    .pt-bad { font-size: 2.4rem; color: var(--ec-coral); }
    .pt-hint { font-size: .82rem; color: var(--ec-ink-soft); margin: 4px 0; }
    .pt-identity { text-align: center; margin-bottom: 16px; }
    .pt-identity h2 { margin: 10px 0 2px; font-size: 1.35rem; }
    .pt-identity img, .pt-avatar { width: 84px; height: 84px; border-radius: 50%; object-fit: cover; border: 2px solid var(--ec-brass-soft); }
    .pt-avatar { display: inline-flex; align-items: center; justify-content: center; background: var(--ec-ink); color: var(--ec-brass); font-size: 1.9rem; font-weight: 700; }
    label { display: block; font-weight: 600; font-size: .85rem; margin-bottom: 6px; }
    .pt-pin { width: 100%; font-size: 1.8rem; letter-spacing: .5em; text-align: center; padding: 12px; border: 2px solid var(--ec-line); border-radius: 12px; font-family: var(--ec-font-mono); }
    .pt-pin:focus { outline: none; border-color: var(--ec-brass); }
    .pt-btn { width: 100%; margin-top: 14px; padding: 14px; border: none; border-radius: 12px; background: var(--ec-ink); color: #fff; font-size: 1rem; font-weight: 600; cursor: pointer; }
    .pt-btn:disabled { opacity: .5; cursor: not-allowed; }
    .pt-error { margin-top: 10px; padding: 10px 12px; background: #FBEAEA; color: var(--ec-coral); border-radius: 10px; font-size: .88rem; }
    .pt-warn { padding: 12px; background: #FBF3E3; color: #7a5a16; border-radius: 10px; font-size: .9rem; }
    .pt-dl { display: grid; grid-template-columns: 1fr 1.6fr; gap: 8px 12px; font-size: .88rem; margin: 0 0 16px; }
    .pt-dl dt { color: var(--ec-ink-soft); } .pt-dl dd { margin: 0; font-weight: 500; }
    h3 { font-family: var(--ec-font-display); margin: 18px 0 8px; }
    .pt-soon { text-align: center; padding: 16px; background: #FAFAF8; border: 1px dashed var(--ec-line); border-radius: 12px; color: var(--ec-ink-soft); font-size: .9rem; }
    .pt-soon i { font-size: 1.4rem; color: var(--ec-brass); }
    .pt-service { display: block; width: 100%; text-align: left; padding: 14px; margin-bottom: 8px; border: 1px solid var(--ec-line); border-radius: 12px; background: #fff; font-size: .95rem; }
  `]
})
export class PortalComponent implements OnInit, OnDestroy {
  step: Step = 'loading';
  scan: ScanResult | null = null;
  file: AgentFile | null = null;
  pin = ''; message = ''; busy = false; locked = false; minutes = 0;
  private token = '';
  private timer: any;

  constructor(private route: ActivatedRoute, private portal: PortalService) {}

  ngOnInit() {
    this.token = this.route.snapshot.params['token'];
    this.portal.scan(this.token).subscribe({
      next: r => { this.scan = r; this.step = 'pin'; },
      error: err => { this.message = err.status === 429 ? 'Trop de requêtes. Réessayez dans quelques minutes.' : ''; this.step = 'invalid'; }
    });
  }

  ngOnDestroy() { clearTimeout(this.timer); }

  civility(c: string | null) { return c === 'MME' ? 'Mme ' : c === 'MLLE' ? 'Mlle ' : c === 'M' ? 'M. ' : ''; }
  typeLabel(t: string) { return ({ SG: 'Secrétariat général', DG: 'Direction générale', DIRECTION: 'Direction', SERVICE: 'Service', UNITE: 'Unité' } as any)[t] || t; }

  submitPin() {
    if (this.pin.length < 4) return;
    this.busy = true; this.message = '';
    this.portal.verifyPin(this.token, this.pin).subscribe({
      next: r => {
        this.busy = false; this.pin = '';
        this.portal.sessionToken = r.sessionToken;
        this.file = r; this.minutes = r.expiresInMinutes; this.step = 'file';
        // La session vit uniquement en mémoire (jamais dans localStorage) et se ferme à l'échéance
        this.timer = setTimeout(() => this.close(), r.expiresInMinutes * 60000);
      },
      error: err => {
        this.busy = false; this.pin = '';
        const body = err.error || {};
        if (body.code === 'PIN_LOCKED') { this.locked = true; this.message = 'Trop de tentatives. Réessayez plus tard.'; }
        else if (body.code === 'PIN_INVALID') this.message = `Code PIN incorrect. Il vous reste ${body.remainingAttempts} essai(s).`;
        else if (body.code === 'CARD_INVALID') this.step = 'invalid';
        else if (err.status === 429) this.message = 'Trop de tentatives. Réessayez dans quelques minutes.';
        else this.message = body.message || 'Vérification impossible.';
      }
    });
  }

  onExpired() { this.close(); this.message = 'Votre session a expiré ou la carte n\'est plus valide. Scannez à nouveau votre carte.'; }

  close() { this.portal.sessionToken = null; this.file = null; this.pin = ''; this.step = 'pin'; clearTimeout(this.timer); }
}
