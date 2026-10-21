import { createSelector } from '@ngrx/store';
import { AppState } from '..';
export const selectStatisticsState = (state: AppState) => state.statistics;
export const selectStatisticsStats = createSelector(selectStatisticsState, s => s.stats);
export const selectStatisticsLoading = createSelector(selectStatisticsState, s => s.loading);
export const selectStatisticsError = createSelector(selectStatisticsState, s => s.error);
