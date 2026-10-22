import { NgModule } from '@angular/core';
import { RouterModule } from '@angular/router';
import { SharedModule } from '../../shared/shared.module';
import { NotificationsComponent } from './notifications.component';

@NgModule({ declarations: [NotificationsComponent], imports: [SharedModule, RouterModule.forChild([{ path: '', component: NotificationsComponent }])] })
export class NotificationsModule {}
