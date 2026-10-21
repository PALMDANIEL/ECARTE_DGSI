import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { ReactiveFormsModule } from '@angular/forms';
import { CardListComponent } from './components/card-list/card-list.component';
import { CardFormComponent } from './components/card-form/card-form.component';
import { CardModule } from 'primeng/card';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { MessagesModule } from 'primeng/messages';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { TooltipModule } from 'primeng/tooltip';
import { DialogModule } from 'primeng/dialog';
import { ConfirmationService, MessageService } from 'primeng/api';

@NgModule({
  declarations: [CardListComponent, CardFormComponent],
  imports: [
    CommonModule,
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
  ],
  providers: [ConfirmationService, MessageService]
})
export class CardsModule {}
