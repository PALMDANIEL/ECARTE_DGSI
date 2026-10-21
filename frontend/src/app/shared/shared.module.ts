import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { CardModule } from 'primeng/card';
import { TableModule } from 'primeng/table';
import { ToastModule } from 'primeng/toast';
import { DialogModule } from 'primeng/dialog';
import { DropdownModule } from 'primeng/dropdown';
import { InputMaskModule } from 'primeng/inputmask';
import { InputSwitchModule } from 'primeng/inputswitch';
import { InputTextareaModule } from 'primeng/inputtextarea';
import { FileUploadModule } from 'primeng/fileupload';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { MenuModule } from 'primeng/menu';
import { ToolbarModule } from 'primeng/toolbar';
import { AvatarModule } from 'primeng/avatar';
import { TagModule } from 'primeng/tag';
import { ChartModule } from 'primeng/chart';
import { MessagesModule } from 'primeng/messages';
import { MessageModule } from 'primeng/message';
import { TooltipModule } from 'primeng/tooltip';

const PRIME_MODULES = [
  ButtonModule, InputTextModule, CardModule, TableModule, ToastModule,
  DialogModule, DropdownModule, InputMaskModule, InputSwitchModule,
  InputTextareaModule, FileUploadModule, ProgressSpinnerModule,
  ConfirmDialogModule, MenuModule, ToolbarModule, AvatarModule,
  TagModule, ChartModule, MessagesModule, MessageModule, TooltipModule
];

@NgModule({
  imports: [CommonModule, FormsModule, ReactiveFormsModule, RouterModule, ...PRIME_MODULES],
  exports: [CommonModule, FormsModule, ReactiveFormsModule, RouterModule, ...PRIME_MODULES],
  // MessageService / ConfirmationService sont fournis à la racine (AppModule) pour partager un seul toast et une seule boîte de confirmation
})
export class SharedModule {}
