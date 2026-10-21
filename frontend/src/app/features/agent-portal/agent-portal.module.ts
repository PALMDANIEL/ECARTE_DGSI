import { NgModule } from '@angular/core';
import { RouterModule } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { PortalComponent } from './components/portal.component';
import { PortalRequestsComponent } from './components/portal-requests.component';

@NgModule({
  declarations: [PortalComponent, PortalRequestsComponent],
  imports: [CommonModule, FormsModule, RouterModule.forChild([{ path: ':token', component: PortalComponent }])]
})
export class AgentPortalModule {}
