import { NgModule } from '@angular/core';
import { RouterModule } from '@angular/router';
import { SharedModule } from '../../shared/shared.module';
import { RequestsComponent } from './components/requests.component';
import { RequestDetailComponent } from './components/request-detail.component';

@NgModule({
  declarations: [RequestsComponent, RequestDetailComponent],
  imports: [SharedModule, RouterModule.forChild([{ path: '', component: RequestsComponent }])]
})
export class RequestsModule {}
