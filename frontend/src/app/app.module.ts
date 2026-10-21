import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { HttpClientModule, HTTP_INTERCEPTORS } from '@angular/common/http';
import { AppRoutingModule } from './app-routing.module';
import { AppComponent } from './app.component';
import { MainLayoutComponent } from './core/layout/main-layout.component';
import { AuthInterceptor } from './core/interceptors/auth.interceptor';
import { ToastModule } from 'primeng/toast';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { MessageService, ConfirmationService } from 'primeng/api';
import { StoreModule } from '@ngrx/store';
import { EffectsModule } from '@ngrx/effects';
import { StoreDevtoolsModule } from '@ngrx/store-devtools';
import { environment } from '../environments/environment';
import { reducers, metaReducers } from './core/store';
import { AuthEffects } from './core/store/auth/effects/auth.effects';
import { DashboardEffects } from './core/store/dashboard/effects/dashboard.effects';
import { CompanyEffects } from './core/store/company/company.effects';
import { TeamEffects } from './core/store/team/team.effects';
import { StatisticsEffects } from './core/store/statistics/statistics.effects';

@NgModule({
  declarations: [AppComponent, MainLayoutComponent],
  imports: [
    BrowserModule,
    BrowserAnimationsModule,
    HttpClientModule,
    ToastModule,
    ConfirmDialogModule,
    AppRoutingModule,
    StoreModule.forRoot(reducers, { metaReducers }),
    EffectsModule.forRoot([AuthEffects, DashboardEffects, CompanyEffects, TeamEffects, StatisticsEffects]),
    !environment.production ? StoreDevtoolsModule.instrument() : []
  ],
  providers: [
    MessageService,
    ConfirmationService,
    { provide: HTTP_INTERCEPTORS, useClass: AuthInterceptor, multi: true }
  ],
  bootstrap: [AppComponent]
})
export class AppModule { }
