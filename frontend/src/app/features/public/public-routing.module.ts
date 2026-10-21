import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { PublicCardComponent } from './components/public-card/public-card.component';

const routes: Routes = [{ path: ':slug', component: PublicCardComponent }];
@NgModule({ imports: [RouterModule.forChild(routes)], exports: [RouterModule] })
export class PublicRoutingModule {}
