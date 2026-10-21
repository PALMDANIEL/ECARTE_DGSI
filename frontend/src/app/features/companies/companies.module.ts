import { NgModule } from '@angular/core';
import { SharedModule } from '../../shared/shared.module';
import { CompaniesRoutingModule } from './companies-routing.module';
import { CompaniesComponent } from './components/companies/companies.component';
@NgModule({ declarations: [CompaniesComponent], imports: [SharedModule, CompaniesRoutingModule] })
export class CompaniesModule {}
