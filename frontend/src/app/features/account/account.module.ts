import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { ReactiveFormsModule } from '@angular/forms';
import { AccountComponent } from './components/account.component';
import { AccountService } from './services/account.service';

import { InputTextModule } from 'primeng/inputtext';
import { PasswordModule } from 'primeng/password';
import { ButtonModule } from 'primeng/button';
import { MessagesModule } from 'primeng/messages';
import { MessageService } from 'primeng/api';

@NgModule({
  declarations: [AccountComponent],
  imports: [
    CommonModule,
    ReactiveFormsModule,
    RouterModule.forChild([
      { path: '', component: AccountComponent }
    ]),
    InputTextModule,
    PasswordModule,
    ButtonModule,
    MessagesModule
  ],
  providers: [AccountService, MessageService]
})
export class AccountModule { }
