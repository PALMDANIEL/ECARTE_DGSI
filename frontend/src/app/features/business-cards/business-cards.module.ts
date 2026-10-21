import { NgModule } from '@angular/core';
import { SharedModule } from '../../shared/shared.module';
import { BusinessCardsRoutingModule } from './business-cards-routing.module';
import { CardListComponent } from './components/list/list.component';
import { CardCreateEditComponent } from './components/create-edit/create-edit.component';
import { CardDetailComponent } from './components/detail/detail.component';

@NgModule({
  declarations: [CardListComponent, CardCreateEditComponent, CardDetailComponent],
  imports: [SharedModule, BusinessCardsRoutingModule]
})
export class BusinessCardsModule {}
