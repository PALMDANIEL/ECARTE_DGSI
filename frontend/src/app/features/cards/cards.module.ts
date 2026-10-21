import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { CardListComponent } from './components/card-list/card-list.component';
import { CardFormComponent } from './components/card-form/card-form.component';
import { CardLifecycleComponent } from './components/card-lifecycle/card-lifecycle.component';
import { CardModule } from 'primeng/card';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { MessagesModule } from 'primeng/messages';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { TooltipModule } from 'primeng/tooltip';
import { DialogModule } from 'primeng/dialog';

@NgModule({
  declarations: [CardListComponent, CardFormComponent, CardLifecycleComponent],
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    RouterModule.forChild([
      { path: '', component: CardListComponent },
      { path: 'new', component: CardFormComponent },
      { path: ':id/edit', component: CardFormComponent }
    ]),
    CardModule,
    ButtonModule,
    InputTextModule,
    MessagesModule,
    ConfirmDialogModule, TooltipModule, DialogModule
  ]
})
export class CardsModule {}
