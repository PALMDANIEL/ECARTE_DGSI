import { NgModule } from '@angular/core';
import { SharedModule } from '../../shared/shared.module';
import { PublicRoutingModule } from './public-routing.module';
import { PublicCardComponent } from './components/public-card/public-card.component';

@NgModule({
  declarations: [PublicCardComponent],
  imports: [SharedModule, PublicRoutingModule]
})
export class PublicModule {}
