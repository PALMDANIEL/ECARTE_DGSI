import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { SharedModule } from '../../shared/shared.module';
import { OrganisationComponent } from './components/organisation.component';
import { PositionsComponent } from './components/positions.component';
import { AgentsComponent } from './components/agents.component';
import { AuditComponent } from './components/audit.component';
import { RulesComponent } from './components/rules.component';
import { CsvImportComponent } from './components/csv-import.component';
import { CircuitsComponent } from './components/circuits.component';
import { AbsenceTypesComponent } from './components/absence-types.component';
import { TemplatesComponent } from './components/templates.component';

const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'agents' },
  { path: 'organisation', component: OrganisationComponent },
  { path: 'postes', component: PositionsComponent },
  { path: 'agents', component: AgentsComponent },
  { path: 'circuits', component: CircuitsComponent },
  { path: 'absences', component: AbsenceTypesComponent },
  { path: 'modeles', component: TemplatesComponent },
  { path: 'audit', component: AuditComponent },
  { path: 'parametres', component: RulesComponent }
];

@NgModule({
  declarations: [OrganisationComponent, PositionsComponent, AgentsComponent, AuditComponent, RulesComponent, CsvImportComponent, CircuitsComponent, AbsenceTypesComponent, TemplatesComponent],
  imports: [SharedModule, RouterModule.forChild(routes)]
})
export class AdminModule {}
