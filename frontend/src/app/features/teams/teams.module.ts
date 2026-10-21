import { NgModule } from '@angular/core';
import { SharedModule } from '../../shared/shared.module';
import { TeamsRoutingModule } from './teams-routing.module';
import { TeamsComponent } from './components/teams/teams.component';
@NgModule({ declarations: [TeamsComponent], imports: [SharedModule, TeamsRoutingModule] })
export class TeamsModule {}
