import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { AuthGuard } from './core/guards/auth.guard';
import { LoginGuard } from './core/guards/login.guard';
import { MainLayoutComponent } from './core/layout/main-layout.component';

const routes: Routes = [
  { path: '', redirectTo: '/dashboard', pathMatch: 'full' },
  { path: 'auth', loadChildren: () => import('./features/auth/auth.module').then(m => m.AuthModule), canActivate: [LoginGuard] },
  { path: 'card', loadChildren: () => import('./features/public/public.module').then(m => m.PublicModule) },
  {
    path: '',
    component: MainLayoutComponent,
    canActivate: [AuthGuard],
    children: [
      { path: 'dashboard', loadChildren: () => import('./features/dashboard/dashboard.module').then(m => m.DashboardModule) },
      { path: 'cards', loadChildren: () => import('./features/cards/cards.module').then(m => m.CardsModule) },
      { path: 'account', loadChildren: () => import('./features/account/account.module').then(m => m.AccountModule) },
      { path: 'users', loadChildren: () => import('./features/users/users.module').then(m => m.UsersModule) },
      { path: 'companies', loadChildren: () => import('./features/companies/companies.module').then(m => m.CompaniesModule) },
      { path: 'teams', loadChildren: () => import('./features/teams/teams.module').then(m => m.TeamsModule) },
      { path: 'statistics', loadChildren: () => import('./features/statistics/statistics.module').then(m => m.StatisticsModule) },
      // « Paramètres » faisait doublon (et ne fonctionnait pas) : tout est dans « Mon compte »
      { path: 'settings', redirectTo: 'account', pathMatch: 'full' },
      { path: '**', redirectTo: 'dashboard' }
    ]
  }
];

@NgModule({ imports: [RouterModule.forRoot(routes)], exports: [RouterModule] })
export class AppRoutingModule {}
