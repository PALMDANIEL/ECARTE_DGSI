import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Store } from '@ngrx/store';
import { AppState } from '../../../../core/store';
import { User } from '../../../../core/models/user.model';
import { Observable } from 'rxjs';
import { MessageService } from 'primeng/api';
import { selectUser } from '../../../../core/store/auth/auth.selectors';
@Component({
  selector: 'app-settings',
  standalone: false,
  template: `
    <div class="grid">
      <div class="col-12"><h1 class="text-3xl font-bold text-gray-800 mb-1">Paramètres</h1><p class="text-gray-500">Gérez votre profil et les paramètres de l'application</p></div>
      <div class="col-12 lg:col-6"><p-card header="Profil utilisateur" class="shadow-lg border-round-2xl" styleClass="p-4"><form [formGroup]="profileForm" (ngSubmit)="saveProfile()"><div class="field mb-3"><label for="firstName">Prénom</label><input id="firstName" type="text" pInputText formControlName="firstName" class="w-full" /></div><div class="field mb-3"><label for="lastName">Nom</label><input id="lastName" type="text" pInputText formControlName="lastName" class="w-full" /></div><div class="field mb-3"><label for="email">Email</label><input id="email" type="email" pInputText formControlName="email" class="w-full" /></div><div class="field mb-3"><label for="phone">Téléphone</label><input id="phone" type="text" pInputText formControlName="phone" class="w-full" /></div><p-button type="submit" label="Enregistrer" icon="pi pi-check" styleClass="p-button-primary w-full shadow-lg border-round-xl"></p-button></form></p-card></div>
      <div class="col-12 lg:col-6"><p-card header="Changer mot de passe" class="shadow-lg border-round-2xl" styleClass="p-4"><form [formGroup]="passwordForm" (ngSubmit)="changePassword()"><div class="field mb-3"><label for="currentPassword">Mot de passe actuel</label><input id="currentPassword" type="password" pInputText formControlName="currentPassword" class="w-full" /></div><div class="field mb-3"><label for="newPassword">Nouveau mot de passe</label><input id="newPassword" type="password" pInputText formControlName="newPassword" class="w-full" /></div><div class="field mb-3"><label for="confirmPassword">Confirmer</label><input id="confirmPassword" type="password" pInputText formControlName="confirmPassword" class="w-full" /></div><p-button type="submit" label="Changer" icon="pi pi-key" styleClass="p-button-warning w-full shadow-lg border-round-xl"></p-button></form></p-card></div>
    </div>
  `
})
export class SettingsComponent implements OnInit {
  profileForm!: FormGroup;
  passwordForm!: FormGroup;
  user$: Observable<User | null>;
  constructor(private fb: FormBuilder, private store: Store<AppState>, private messageService: MessageService) {
    this.user$ = this.store.select(selectUser);
  }
  ngOnInit() {
    this.profileForm = this.fb.group({ firstName: ['', Validators.required], lastName: ['', Validators.required], email: ['', [Validators.required, Validators.email]], phone: [''] });
    this.passwordForm = this.fb.group({ currentPassword: ['', Validators.required], newPassword: ['', [Validators.required, Validators.minLength(6)]], confirmPassword: ['', Validators.required] });
    this.user$.subscribe(user => { if (user) this.profileForm.patchValue(user); });
  }
  saveProfile() { if (this.profileForm.invalid) return; this.messageService.add({ severity: 'success', summary: 'Succès', detail: 'Profil mis à jour' }); }
  changePassword() {
    if (this.passwordForm.invalid) return;
    if (this.passwordForm.value.newPassword !== this.passwordForm.value.confirmPassword) {
      this.messageService.add({ severity: 'error', summary: 'Erreur', detail: 'Les mots de passe ne correspondent pas' });
      return;
    }
    this.messageService.add({ severity: 'success', summary: 'Succès', detail: 'Mot de passe changé' });
  }
}
