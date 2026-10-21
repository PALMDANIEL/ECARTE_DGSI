import { Component } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Store } from '@ngrx/store';
import { AppState } from '../../../../core/store';
import { login } from '../../../../core/store/auth/auth.actions';
import { selectAuthLoading, selectAuthError } from '../../../../core/store/auth/auth.selectors';
import { Observable } from 'rxjs';

@Component({
  selector: 'app-login',
  standalone: false,
  template: `
    <div class="ec-auth-stage">
      <div class="ec-auth-panel">
        <div class="ec-brand"><i class="pi pi-id-card"></i><span class="ec-display">ECARTE-DGSI</span></div>
        <p class="ec-mono ec-tagline">VOTRE CARTE, TOUJOURS SUR VOUS</p>
        <form [formGroup]="loginForm" (ngSubmit)="onSubmit()">
          <label class="ec-label">Email</label>
          <input type="email" pInputText formControlName="email" class="w-full" placeholder="vous@entreprise.com" />
          <label class="ec-label">Mot de passe</label>
          <input type="password" pInputText formControlName="password" class="w-full" placeholder="••••••••" />
          <button type="submit" class="ec-submit" [disabled]="(loading$ | async)">
            {{ (loading$ | async) ? 'Connexion…' : 'Se connecter' }}
          </button>
          <div class="ec-error-box" *ngIf="error$ | async as error">{{ error }}</div>
        </form>
      </div>
    </div>
  `,
  styles: [`
    .ec-auth-stage { min-height: 100vh; display: flex; align-items: center; justify-content: center; background: var(--ec-ink); background-image: radial-gradient(circle at 30% 20%, rgba(200,155,60,0.15), transparent 50%); padding: 24px; }
    .ec-auth-panel { width: 100%; max-width: 380px; background: var(--ec-paper-raised); border-radius: 16px; padding: 40px 32px; box-shadow: 0 20px 60px rgba(0,0,0,0.35); }
    .ec-brand { display: flex; align-items: center; gap: 10px; font-size: 1.4rem; font-weight: 600; color: var(--ec-ink); }
    .ec-brand i { color: var(--ec-brass); font-size: 1.5rem; }
    .ec-tagline { font-size: 0.68rem; color: var(--ec-teal); margin: 6px 0 28px; }
    .ec-label { display: block; font-size: 0.8rem; font-weight: 600; color: var(--ec-ink-soft); margin: 16px 0 6px; }
    .ec-submit { width: 100%; margin-top: 24px; padding: 12px; background: var(--ec-ink); color: white; border: none; border-radius: 8px; font-weight: 600; cursor: pointer; }
    .ec-submit:hover { background: var(--ec-ink-soft); }
    .ec-error-box { margin-top: 16px; padding: 10px 12px; background: #FBEAEA; color: var(--ec-coral); border-radius: 8px; font-size: 0.85rem; }
  `]
})
export class LoginComponent {
  loginForm: FormGroup;
  loading$: Observable<boolean>;
  error$: Observable<string | null>;
  constructor(private fb: FormBuilder, private store: Store<AppState>) {
    this.loginForm = this.fb.group({
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required, Validators.minLength(6)]]
    });
    this.loading$ = this.store.select(selectAuthLoading);
    this.error$ = this.store.select(selectAuthError);
  }
  onSubmit() {
    if (this.loginForm.valid) {
      const { email, password } = this.loginForm.value;
      this.store.dispatch(login({ email, password }));
    }
  }
}
