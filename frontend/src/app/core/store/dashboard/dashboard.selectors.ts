import { createSelector } from '@ngrx/store';
import { AppState } from '..';
export const selectDashboardState = (state: AppState) => state.dashboard;
export const selectDashboardStats = createSelector(selectDashboardState, dashboard => dashboard.stats);
export const selectDashboardLoading = createSelector(selectDashboardState, dashboard => dashboard.loading);
export const selectDashboardError = createSelector(selectDashboardState, dashboard => dashboard.error);
