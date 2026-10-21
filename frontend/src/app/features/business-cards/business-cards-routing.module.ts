import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { CardListComponent } from './components/list/list.component';
import { CardCreateEditComponent } from './components/create-edit/create-edit.component';
import { CardDetailComponent } from './components/detail/detail.component';

const routes: Routes = [
  { path: '', component: CardListComponent },
  { path: 'create', component: CardCreateEditComponent },
  { path: 'edit/:id', component: CardCreateEditComponent },
  { path: ':id', component: CardDetailComponent }
];
@NgModule({ imports: [RouterModule.forChild(routes)], exports: [RouterModule] })
export class BusinessCardsRoutingModule {}
