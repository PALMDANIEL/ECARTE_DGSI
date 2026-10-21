import { Component, OnInit, OnDestroy } from '@angular/core';
import { Actions, ofType } from '@ngrx/effects';
import { Subscription } from 'rxjs';
import { Store } from '@ngrx/store';
import { AppState } from '../../../../core/store';
import { Observable } from 'rxjs';
import { Team } from '../../../../core/models/team.model';
import { ConfirmationService, MessageService } from 'primeng/api';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { loadTeams, createTeam, updateTeam, deleteTeam, createTeamSuccess, createTeamFailure, updateTeamSuccess, updateTeamFailure, deleteTeamSuccess, deleteTeamFailure } from '../../../../core/store/team/team.actions';
import { selectAllTeams, selectTeamsLoading } from '../../../../core/store/team/team.selectors';
@Component({
  selector: 'app-teams',
  standalone: false,
  template: `
    <div class="flex flex-column md:flex-row justify-content-between align-items-start md:align-items-center mb-6 gap-4">
      <div><h1 class="text-3xl font-bold text-gray-800 mb-1">Équipes</h1><p class="text-gray-500">Gérez les équipes de votre entreprise</p></div>
      <p-button label="Nouvelle équipe" icon="pi pi-plus" (click)="showDialog = true" styleClass="p-button-success shadow-lg border-round-xl px-5"></p-button>
    </div>
    <p-card class="shadow-lg border-round-2xl" styleClass="p-4">
      <p-table [value]="(teams$ | async) || []" [paginator]="true" [rows]="10" [loading]="(loading$ | async) || false">
        <ng-template pTemplate="header"><tr class="bg-gradient-to-r from-blue-50 to-indigo-50"><th class="text-600 font-semibold py-3">Nom</th><th class="text-600 font-semibold py-3 text-center">Actions</th></tr></ng-template>
        <ng-template pTemplate="body" let-team>
          <tr><td class="font-medium">{{ team.name }}</td><td><div class="flex justify-content-center gap-1"><p-button icon="pi pi-pencil" (click)="editTeam(team)" class="p-button-sm p-button-text p-button-rounded"></p-button><p-button icon="pi pi-trash" (click)="deleteTeam(team.id)" class="p-button-sm p-button-text p-button-danger p-button-rounded"></p-button></div></td></tr>
        </ng-template>
      </p-table>
    </p-card>
    <p-dialog header="{{ isEdit ? 'Modifier équipe' : 'Nouvelle équipe' }}" [(visible)]="showDialog" [modal]="true" styleClass="w-25rem border-round-2xl">
      <form [formGroup]="teamForm" (ngSubmit)="onSubmit()">
        <div class="field mb-3"><label for="name">Nom *</label><input id="name" type="text" pInputText formControlName="name" class="w-full" /></div>
        <div class="flex justify-content-end gap-2 mt-4"><p-button label="Annuler" (click)="showDialog = false" styleClass="p-button-text"></p-button><p-button type="submit" label="Enregistrer" icon="pi pi-check" [loading]="submitting"></p-button></div>
      </form>
    </p-dialog>
  `
})
export class TeamsComponent implements OnInit, OnDestroy {
  private sub = new Subscription();
  teams$: Observable<Team[]>;
  loading$: Observable<boolean>;
  showDialog = false;
  isEdit = false;
  teamForm!: FormGroup;
  submitting = false;
  selectedTeam: Team | null = null;
  constructor(private store: Store<AppState>, private confirmationService: ConfirmationService, private messageService: MessageService, private fb: FormBuilder, private actions$: Actions) {
    this.teams$ = this.store.select(selectAllTeams);
    this.loading$ = this.store.select(selectTeamsLoading);
  }
  ngOnInit() {
    this.teamForm = this.fb.group({ name: ['', Validators.required] });
    this.store.dispatch(loadTeams());
    // Les messages s'affichent selon le résultat réel de l'API (et non au moment du clic)
    const ok = (detail: string) => this.messageService.add({ severity: 'success', summary: 'Succès', detail });
    const ko = (error: string) => this.messageService.add({ severity: 'error', summary: 'Erreur', detail: error || 'Opération impossible' });
    this.sub.add(this.actions$.pipe(ofType(createTeamSuccess)).subscribe(() => ok('Équipe créée')));
    this.sub.add(this.actions$.pipe(ofType(updateTeamSuccess)).subscribe(() => ok('Équipe mise à jour')));
    this.sub.add(this.actions$.pipe(ofType(deleteTeamSuccess)).subscribe(() => ok('Équipe supprimée')));
    this.sub.add(this.actions$.pipe(ofType(createTeamFailure, updateTeamFailure, deleteTeamFailure)).subscribe(a => ko(a.error)));
  }
  editTeam(team: Team) {
    this.isEdit = true;
    this.selectedTeam = team;
    this.teamForm.patchValue(team);
    this.showDialog = true;
  }
  onSubmit() {
    if (this.teamForm.invalid) return;
    this.submitting = true;
    const data = this.teamForm.value;
    if (this.isEdit && this.selectedTeam) {
      this.store.dispatch(updateTeam({ id: this.selectedTeam.id, team: data }));
    } else {
      this.store.dispatch(createTeam({ team: data }));
    }
    this.showDialog = false;
    this.submitting = false;
    this.teamForm.reset();
    this.isEdit = false;
    this.selectedTeam = null;
  }
  deleteTeam(id: string) {
    this.confirmationService.confirm({
      message: 'Voulez-vous vraiment supprimer cette équipe ?',
      accept: () => {
        this.store.dispatch(deleteTeam({ id }));
      }
    });
  }
  ngOnDestroy() { this.sub.unsubscribe(); }
}
