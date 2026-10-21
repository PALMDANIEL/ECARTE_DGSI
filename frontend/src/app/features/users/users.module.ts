import { NgModule } from '@angular/core';
import { SharedModule } from '../../shared/shared.module';
import { UsersRoutingModule } from './users-routing.module';
import { UsersListComponent } from './components/users-list/users-list.component';

@NgModule({
  declarations: [UsersListComponent],
  imports: [SharedModule, UsersRoutingModule]
})
export class UsersModule {}
