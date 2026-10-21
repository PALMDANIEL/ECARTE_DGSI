import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { AuthGuard } from './core/guards/auth.guard';
import { LoginGuard } from './core/guards/login.guard';
import { RoleGuard } from './core/guards/role.guard';
import { MainLayoutComponent } from './core/layout/main-layout.component';

const routes: Routes = [
  { path: '', redirectTo: '/dashboard', pathMatch: 'full' },
  { path: 'auth', loadChildren: () => import('./features/auth/auth.module').then(m => m.AuthModule), canActivate: [LoginGuard] },
  // Page ouverte par le scan du QR de la carte professionnelle (publique : l'accès aux données exige le PIN)
  { path: 'q', loadChildren: () => import('./features/agent-portal/agent-portal.module').then(m => m.AgentPortalModule) },
  { path: 'card', loadChildren: () => import('./features/public/public.module').then(m => m.PublicModule) },
  {
    path: '',
    component: MainLayoutComponent,
    canActivate: [AuthGuard],
    children: [
      { path: 'dashboard', loadChildren: () => import('./features/dashboard/dashboard.module').then(m => m.DashboardModule) },
      { path: 'cards', loadChildren: () => import('./features/cards/cards.module').then(m => m.CardsModule) },
      { path: 'account', loadChildren: () => import('./features/account/account.module').then(m => m.AccountModule) },
      { path: 'admin', canActivate: [RoleGuard], data: { roles: ['ADMIN', 'SUPER_ADMIN'] }, loadChildren: () => import('./features/admin/admin.module').then(m => m.AdminModule) },
      { path: 'requests', loadChildren: () => import('./features/requests/requests.module').then(m => m.RequestsModule) },
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
