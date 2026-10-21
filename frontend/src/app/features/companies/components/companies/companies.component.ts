import { Component, OnInit, OnDestroy } from '@angular/core';
import { Actions, ofType } from '@ngrx/effects';
import { Subscription } from 'rxjs';
import { Store } from '@ngrx/store';
import { AppState } from '../../../../core/store';
import { Observable } from 'rxjs';
import { Company } from '../../../../core/models/company.model';
import { ConfirmationService, MessageService } from 'primeng/api';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { loadCompanies, createCompany, updateCompany, deleteCompany, createCompanySuccess, createCompanyFailure, updateCompanySuccess, updateCompanyFailure, deleteCompanySuccess, deleteCompanyFailure } from '../../../../core/store/company/company.actions';
import { selectAllCompanies, selectCompaniesLoading } from '../../../../core/store/company/company.selectors';
@Component({
  selector: 'app-companies',
  standalone: false,
  template: `
    <div class="flex flex-column md:flex-row justify-content-between align-items-start md:align-items-center mb-6 gap-4">
      <div><h1 class="text-3xl font-bold text-gray-800 mb-1">Entreprises</h1><p class="text-gray-500">Gérez les entreprises de la plateforme</p></div>
      <p-button label="Nouvelle entreprise" icon="pi pi-plus" (click)="showDialog = true" styleClass="p-button-success shadow-lg border-round-xl px-5"></p-button>
    </div>
    <p-card class="shadow-lg border-round-2xl" styleClass="p-4">
      <p-table [value]="(companies$ | async) || []" [paginator]="true" [rows]="10" [loading]="(loading$ | async) || false">
        <ng-template pTemplate="header">
          <tr class="bg-gradient-to-r from-blue-50 to-indigo-50"><th class="text-600 font-semibold py-3">Nom</th><th class="text-600 font-semibold py-3">Email</th><th class="text-600 font-semibold py-3">Téléphone</th><th class="text-600 font-semibold py-3">Statut</th><th class="text-600 font-semibold py-3 text-center">Actions</th></tr>
        </ng-template>
        <ng-template pTemplate="body" let-company>
          <tr>
            <td class="font-medium">{{ company.name }}</td>
            <td>{{ company.email || '-' }}</td>
            <td>{{ company.phone || '-' }}</td>
            <td><p-tag [severity]="company.isActive ? 'success' : 'danger'" [value]="company.isActive ? 'Actif' : 'Inactif'"></p-tag></td>
            <td><div class="flex justify-content-center gap-1"><p-button icon="pi pi-pencil" (click)="editCompany(company)" class="p-button-sm p-button-text p-button-rounded"></p-button><p-button icon="pi pi-trash" (click)="deleteCompany(company.id)" class="p-button-sm p-button-text p-button-danger p-button-rounded"></p-button></div></td>
          </tr>
        </ng-template>
      </p-table>
    </p-card>
    <p-dialog header="{{ isEdit ? 'Modifier entreprise' : 'Nouvelle entreprise' }}" [(visible)]="showDialog" [modal]="true" styleClass="w-30rem border-round-2xl">
      <form [formGroup]="companyForm" (ngSubmit)="onSubmit()">
        <div class="field mb-3"><label for="name">Nom *</label><input id="name" type="text" pInputText formControlName="name" class="w-full" /></div>
        <div class="field mb-3"><label for="email">Email</label><input id="email" type="email" pInputText formControlName="email" class="w-full" /></div>
        <div class="field mb-3"><label for="phone">Téléphone</label><input id="phone" type="text" pInputText formControlName="phone" class="w-full" /></div>
        <div class="field mb-3"><label for="website">Site web</label><input id="website" type="text" pInputText formControlName="website" class="w-full" /></div>
        <div class="field mb-3"><label for="address">Adresse</label><textarea id="address" pInputTextarea formControlName="address" rows="2" class="w-full"></textarea></div>
        <div class="flex justify-content-end gap-2 mt-4"><p-button label="Annuler" (click)="showDialog = false" styleClass="p-button-text"></p-button><p-button type="submit" label="Enregistrer" icon="pi pi-check" [loading]="submitting"></p-button></div>
      </form>
    </p-dialog>
  `
})
export class CompaniesComponent implements OnInit, OnDestroy {
  private sub = new Subscription();
  companies$: Observable<Company[]>;
  loading$: Observable<boolean>;
  showDialog = false;
  isEdit = false;
  companyForm!: FormGroup;
  submitting = false;
  selectedCompany: Company | null = null;
  constructor(private store: Store<AppState>, private confirmationService: ConfirmationService, private messageService: MessageService, private fb: FormBuilder, private actions$: Actions) {
    this.companies$ = this.store.select(selectAllCompanies);
    this.loading$ = this.store.select(selectCompaniesLoading);
  }
  ngOnInit() {
    this.companyForm = this.fb.group({ name: ['', Validators.required], email: ['', Validators.email], phone: [''], website: [''], address: [''] });
    this.store.dispatch(loadCompanies());
    // Les messages s'affichent selon le résultat réel de l'API (et non au moment du clic)
    const ok = (detail: string) => this.messageService.add({ severity: 'success', summary: 'Succès', detail });
    const ko = (error: string) => this.messageService.add({ severity: 'error', summary: 'Erreur', detail: error || 'Opération impossible' });
    this.sub.add(this.actions$.pipe(ofType(createCompanySuccess)).subscribe(() => ok('Entreprise créée')));
    this.sub.add(this.actions$.pipe(ofType(updateCompanySuccess)).subscribe(() => ok('Entreprise mise à jour')));
    this.sub.add(this.actions$.pipe(ofType(deleteCompanySuccess)).subscribe(() => ok('Entreprise supprimée')));
    this.sub.add(this.actions$.pipe(ofType(createCompanyFailure, updateCompanyFailure, deleteCompanyFailure)).subscribe(a => ko(a.error)));
  }
  editCompany(company: Company) {
    this.isEdit = true;
    this.selectedCompany = company;
    this.companyForm.patchValue(company);
    this.showDialog = true;
  }
  onSubmit() {
    if (this.companyForm.invalid) return;
    this.submitting = true;
    const data = this.companyForm.value;
    if (this.isEdit && this.selectedCompany) {
      this.store.dispatch(updateCompany({ id: this.selectedCompany.id, company: data }));
    } else {
      this.store.dispatch(createCompany({ company: data }));
    }
    this.showDialog = false;
    this.submitting = false;
    this.companyForm.reset();
    this.isEdit = false;
    this.selectedCompany = null;
  }
  deleteCompany(id: string) {
    this.confirmationService.confirm({
      message: 'Voulez-vous vraiment supprimer cette entreprise ?',
      accept: () => {
        this.store.dispatch(deleteCompany({ id }));
      }
    });
  }
  ngOnDestroy() { this.sub.unsubscribe(); }
}
