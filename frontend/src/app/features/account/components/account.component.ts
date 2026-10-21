import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { AccountService } from '../services/account.service';
import { MessageService } from 'primeng/api';
import { User } from '../../../core/models/user.model';

@Component({
  selector: 'app-account',
  standalone: false,
  template: `
    <div class="ec-page">
      <h1 class="ec-display">Mon compte</h1>

      <div class="ec-account-grid">
        <div class="ec-profile">
          <h2>Profil</h2>
          <form [formGroup]="profileForm" (ngSubmit)="updateProfile()">
            <div class="p-field">
              <label>Email</label>
              <input pInputText formControlName="email" readonly />
            </div>
            <div class="p-field">
              <label>Prénom</label>
              <input pInputText formControlName="firstName" />
            </div>
            <div class="p-field">
              <label>Nom</label>
              <input pInputText formControlName="lastName" />
            </div>
            <div class="p-field">
              <label>Entreprise</label>
              <input pInputText formControlName="companyName" readonly />
            </div>
            <div class="p-field">
              <label>Téléphone</label>
              <input pInputText formControlName="phone" />
            </div>
            <div class="p-field">
              <label>Fonction</label>
              <input pInputText formControlName="jobTitle" />
            </div>
            <button type="submit" pButton label="Enregistrer" icon="pi pi-save"></button>
          </form>
        </div>

        <div class="ec-password">
          <h2>Changer le mot de passe</h2>
          <form [formGroup]="passwordForm" (ngSubmit)="changePassword()">
            <div class="p-field">
              <label>Mot de passe actuel</label>
              <input pPassword formControlName="currentPassword" [feedback]="false" />
            </div>
            <div class="p-field">
              <label>Nouveau mot de passe (8 caractères min.)</label>
              <input pPassword formControlName="newPassword" />
            </div>
            <button type="submit" pButton label="Changer" icon="pi pi-key" [disabled]="passwordForm.invalid"></button>
          </form>
        </div>
      </div>

      <p-messages></p-messages>
    </div>
  `,
  styles: [`
    .ec-page { padding: 24px; max-width: 900px; margin: 0 auto; }
    .ec-account-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 32px;
      margin-top: 20px;
    }
    .ec-profile, .ec-password {
      background: var(--ec-paper-raised);
      padding: 24px;
      border-radius: 14px;
      border: 1px solid var(--ec-line);
    }
    h2 {
      font-family: var(--ec-font-display);
      font-size: 1.2rem;
      margin-top: 0;
    }
    .p-field {
      display: flex;
      flex-direction: column;
      gap: 4px;
      margin-bottom: 16px;
    }
    .p-field label {
      font-weight: 600;
      font-size: 0.85rem;
      color: var(--ec-ink-soft);
    }
    @media (max-width: 700px) {
      .ec-account-grid { grid-template-columns: 1fr; }
    }
  `]
})
export class AccountComponent implements OnInit {
  profileForm: FormGroup;
  passwordForm: FormGroup;

  constructor(
    private fb: FormBuilder,
    private accountService: AccountService,
    private messageService: MessageService
  ) {
    this.profileForm = this.fb.group({
      email: [{ value: '', disabled: true }],
      firstName: [''],
      lastName: [''],
      companyName: [{ value: '', disabled: true }],
      phone: [''],
      jobTitle: ['']
    });
    this.passwordForm = this.fb.group({
      currentPassword: ['', Validators.required],
      newPassword: ['', [Validators.required, Validators.minLength(8)]]
    });
  }

  ngOnInit() {
    this.accountService.getProfile().subscribe({
      next: (user) => this.profileForm.patchValue(user),
      error: () => this.messageService.add({ severity: 'error', summary: 'Erreur', detail: 'Impossible de charger le profil' })
    });
  }

  updateProfile() {
    if (this.profileForm.valid) {
      const { firstName, lastName, phone, jobTitle } = this.profileForm.getRawValue();
      this.accountService.updateProfile({ firstName, lastName, phone, jobTitle } as any).subscribe({
        next: () => this.messageService.add({ severity: 'success', summary: 'Mis à jour', detail: 'Profil modifié' }),
        error: () => this.messageService.add({ severity: 'error', summary: 'Erreur', detail: 'Échec de la mise à jour' })
      });
    }
  }

  changePassword() {
    if (this.passwordForm.valid) {
      const { currentPassword, newPassword } = this.passwordForm.value;
      this.accountService.changePassword(currentPassword, newPassword).subscribe({
        next: () => {
          this.messageService.add({ severity: 'success', summary: 'Mot de passe changé', detail: 'Votre mot de passe a été mis à jour' });
          this.passwordForm.reset();
        },
        error: (err) => this.messageService.add({ severity: 'error', summary: 'Erreur', detail: err.error?.message || 'Mot de passe actuel incorrect' })
      });
    }
  }
}
