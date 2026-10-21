import { NgModule } from '@angular/core';
import { RouterModule } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { PortalComponent } from './components/portal.component';

@NgModule({
  declarations: [PortalComponent],
  imports: [CommonModule, FormsModule, RouterModule.forChild([{ path: ':token', component: PortalComponent }])]
})
export class AgentPortalModule {}
