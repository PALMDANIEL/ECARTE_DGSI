import { NgModule } from '@angular/core';
import { SharedModule } from '../../shared/shared.module';
import { StatisticsRoutingModule } from './statistics-routing.module';
import { StatisticsComponent } from './components/statistics/statistics.component';
@NgModule({ declarations: [StatisticsComponent], imports: [SharedModule, StatisticsRoutingModule] })
export class StatisticsModule {}
