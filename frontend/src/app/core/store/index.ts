import { ActionReducerMap, MetaReducer } from '@ngrx/store';
import { environment } from '../../../environments/environment';
import { authReducer, AuthState } from './auth/auth.reducer';
import { dashboardReducer, DashboardState } from './dashboard/dashboard.reducer';
import { companyReducer, CompanyState } from './company/company.reducer';
import { teamReducer, TeamState } from './team/team.reducer';
import { statisticsReducer, StatisticsState } from './statistics/statistics.reducer';

export interface AppState {
  auth: AuthState;
  dashboard: DashboardState;
  company: CompanyState;
  team: TeamState;
  statistics: StatisticsState;
}

export const reducers: ActionReducerMap<AppState> = {
  auth: authReducer,
  dashboard: dashboardReducer,
  company: companyReducer,
  team: teamReducer,
  statistics: statisticsReducer
};

export const metaReducers: MetaReducer<AppState>[] = !environment.production ? [] : [];
