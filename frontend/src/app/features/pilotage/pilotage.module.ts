import { NgModule } from '@angular/core';
import { RouterModule } from '@angular/router';
import { SharedModule } from '../../shared/shared.module';
import { PilotageComponent } from './pilotage.component';

@NgModule({ declarations: [PilotageComponent], imports: [SharedModule, RouterModule.forChild([{ path: '', component: PilotageComponent }])] })
export class PilotageModule {}
