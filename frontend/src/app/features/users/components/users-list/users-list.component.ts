import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { UserService, AppUser } from '../../services/user.service';
import { ConfirmationService, MessageService } from 'primeng/api';

@Component({
  selector: 'app-users-list',
  standalone: false,
  template: `
    <div class="ec-page">
      <div class="ec-page-header">
        <div>
          <h1 class="ec-display">Utilisateurs</h1>
          <p class="ec-mono">{{ total }} COMPTE(S)</p>
        </div>
        <button pButton label="Nouvel utilisateur" icon="pi pi-plus" class="p-button-success" (click)="openCreate()"></button>
      </div>

      <div class="ec-panel">
        <table class="ec-table">
          <thead>
            <tr><th>Nom</th><th>Email</th><th>Rôle</th><th>Statut</th><th></th></tr>
          </thead>
          <tbody>
            <tr *ngFor="let u of users">
              <td>{{ u.firstName }} {{ u.lastName }}</td>
              <td>{{ u.email }}</td>
              <td><span class="ec-role-badge" [class]="'role-' + u.role">{{ u.role }}</span></td>
              <td>
                <span class="ec-status-dot" [class.active]="u.isActive"></span>
                {{ u.isActive ? 'Actif' : 'Inactif' }}
              </td>
              <td class="ec-actions-cell">
                <button class="ec-icon-btn" (click)="toggleActive(u)" [pTooltip]="u.isActive ? 'Désactiver' : 'Activer'">
                  <i class="pi" [class.pi-lock]="u.isActive" [class.pi-lock-open]="!u.isActive"></i>
                </button>
                <button class="ec-icon-btn danger" (click)="deleteUser(u)" pTooltip="Supprimer"><i class="pi pi-trash"></i></button>
              </td>
            </tr>
            <tr *ngIf="!users.length">
              <td colspan="5" class="ec-empty">Aucun utilisateur pour le moment.</td>
            </tr>
          </tbody>
        </table>
      </div>

      <p-dialog header="Nouvel utilisateur" [(visible)]="showCreateDialog" [modal]="true" styleClass="ec-user-modal">
        <form [formGroup]="userForm" (ngSubmit)="submit()">
          <div class="ec-form-grid">
            <div class="p-field"><label>Prénom *</label><input pInputText formControlName="firstName" /></div>
            <div class="p-field"><label>Nom *</label><input pInputText formControlName="lastName" /></div>
            <div class="p-field"><label>Email *</label><input pInputText formControlName="email" type="email" /></div>
            <div class="p-field"><label>Mot de passe * (8 caractères min.)</label><input pInputText formControlName="password" type="password" /></div>
            <div class="p-field"><label>Téléphone</label><input pInputText formControlName="phone" /></div>
            <div class="p-field"><label>Fonction</label><input pInputText formControlName="jobTitle" /></div>
            <div class="p-field">
              <label>Rôle *</label>
              <select formControlName="role" class="ec-select">
                <option value="EMPLOYEE">Employé</option>
                <option value="MANAGER">Manager</option>
                <option value="ADMIN">Admin</option>
                <option value="SUPER_ADMIN">Super Admin</option>
              </select>
            </div>
          </div>
          <div class="ec-error-box" *ngIf="errorMsg">{{ errorMsg }}</div>
          <div class="ec-form-actions">
            <button type="button" pButton label="Annuler" class="p-button-text" (click)="showCreateDialog = false"></button>
            <button type="submit" pButton label="Créer" icon="pi pi-check" [disabled]="userForm.invalid"></button>
          </div>
        </form>
      </p-dialog>

    </div>
  `,
  styles: [`
    .ec-panel { background: var(--ec-paper-raised); border: 1px solid var(--ec-line); border-radius: 14px; padding: 8px; overflow: hidden; }
    .ec-table { width: 100%; border-collapse: collapse; }
    .ec-table th { text-align: left; font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.05em; color: var(--ec-ink-soft); padding: 12px 16px; border-bottom: 1px solid var(--ec-line); }
    .ec-table td { padding: 12px 16px; border-bottom: 1px solid var(--ec-line); font-size: 0.88rem; color: var(--ec-ink); }
    .ec-table tr:last-child td { border-bottom: none; }
    .ec-role-badge { font-family: var(--ec-font-mono); font-size: 0.68rem; padding: 4px 10px; border-radius: 999px; background: #EEF0F8; color: var(--ec-ink-soft); }
    .ec-role-badge.role-ADMIN, .ec-role-badge.role-SUPER_ADMIN { background: #FBF3E3; color: var(--ec-brass); }
    .ec-role-badge.role-MANAGER { background: #EAF6F6; color: var(--ec-teal); }
    .ec-status-dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: var(--ec-coral); margin-right: 6px; }
    .ec-status-dot.active { background: var(--ec-teal); }
    .ec-actions-cell { display: flex; gap: 6px; }
    .ec-icon-btn { width: 30px; height: 30px; border-radius: 6px; border: none; background: transparent; color: var(--ec-ink-soft); cursor: pointer; }
    .ec-icon-btn:hover { background: var(--ec-paper); color: var(--ec-ink); }
    .ec-icon-btn.danger:hover { background: #FBEAEA; color: var(--ec-coral); }
    .ec-empty { text-align: center; color: var(--ec-ink-soft); padding: 32px; }

    .ec-form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-bottom: 16px; }
    .p-field { display: flex; flex-direction: column; gap: 4px; }
    .p-field label { font-weight: 600; font-size: 0.8rem; color: var(--ec-ink-soft); }
    .ec-select { padding: 8px; border-radius: 8px; border: 1px solid var(--ec-line); font-family: var(--ec-font-body); }
    .ec-form-actions { display: flex; gap: 10px; justify-content: flex-end; }
    .ec-error-box { margin-bottom: 12px; padding: 10px 12px; background: #FBEAEA; color: var(--ec-coral); border-radius: 8px; font-size: 0.85rem; }
    @media (max-width: 600px) { .ec-form-grid { grid-template-columns: 1fr; } }
  `]
})
export class UsersListComponent implements OnInit {
  users: AppUser[] = [];
  total = 0;
  showCreateDialog = false;
  errorMsg = '';
  userForm: FormGroup;

  constructor(
    private userService: UserService,
    private fb: FormBuilder,
    private confirmationService: ConfirmationService,
    private messageService: MessageService
  ) {
    this.userForm = this.fb.group({
      firstName: ['', Validators.required],
      lastName: ['', Validators.required],
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required, Validators.minLength(8)]],
      phone: [''],
      jobTitle: [''],
      role: ['EMPLOYEE', Validators.required]
    });
  }

  ngOnInit() { this.refresh(); }

  refresh() {
    this.userService.getAll().subscribe({
      next: res => { this.users = res.users; this.total = res.total; },
      error: () => this.messageService.add({ severity: 'error', summary: 'Erreur', detail: 'Impossible de charger les utilisateurs' })
    });
  }

  openCreate() { this.errorMsg = ''; this.userForm.reset({ role: 'EMPLOYEE' }); this.showCreateDialog = true; }

  submit() {
    if (this.userForm.invalid) return;
    this.userService.create(this.userForm.value).subscribe({
      next: () => {
        this.messageService.add({ severity: 'success', summary: 'Créé', detail: 'Utilisateur créé' });
        this.showCreateDialog = false;
        this.refresh();
      },
      error: (err) => { this.errorMsg = err.error?.message || (err.error?.errors ? 'Données invalides : vérifiez l\'email et le mot de passe (8 caractères min.)' : 'Échec de la création'); }
    });
  }

  toggleActive(u: AppUser) {
    this.userService.update(u.id, { isActive: !u.isActive }).subscribe({
      next: () => { this.messageService.add({ severity: 'success', summary: 'Mis à jour', detail: 'Statut modifié' }); this.refresh(); },
      error: () => this.messageService.add({ severity: 'error', summary: 'Erreur', detail: 'Échec de la mise à jour' })
    });
  }

  deleteUser(u: AppUser) {
    this.confirmationService.confirm({
      message: `Désactiver le compte de ${u.firstName} ${u.lastName} ?`,
      accept: () => {
        this.userService.delete(u.id).subscribe({
          next: () => { this.messageService.add({ severity: 'success', summary: 'Désactivé', detail: 'Compte désactivé' }); this.refresh(); },
          error: () => this.messageService.add({ severity: 'error', summary: 'Erreur', detail: 'Échec' })
        });
      }
    });
  }
}
