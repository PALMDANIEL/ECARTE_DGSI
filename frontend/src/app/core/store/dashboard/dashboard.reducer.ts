import { createReducer, on } from '@ngrx/store';
import * as DashboardActions from './dashboard.actions';
export interface DashboardState {
  stats: any;
  loading: boolean;
  error: string | null;
}
export const initialDashboardState: DashboardState = {
  stats: null,
  loading: false,
  error: null
};
export const dashboardReducer = createReducer(
  initialDashboardState,
  on(DashboardActions.loadDashboardStats, state => ({ ...state, loading: true })),
  on(DashboardActions.loadDashboardStatsSuccess, (state, { stats }) => ({ ...state, stats, loading: false })),
  on(DashboardActions.loadDashboardStatsFailure, (state, { error }) => ({ ...state, error, loading: false }))
);
