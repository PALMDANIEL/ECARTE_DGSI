import { createReducer, on } from '@ngrx/store';
import * as StatisticsActions from './statistics.actions';
export interface StatisticsState {
  stats: any;
  loading: boolean;
  error: string | null;
}
export const initialStatisticsState: StatisticsState = {
  stats: null,
  loading: false,
  error: null
};
export const statisticsReducer = createReducer(
  initialStatisticsState,
  on(StatisticsActions.loadStatistics, state => ({ ...state, loading: true })),
  on(StatisticsActions.loadStatisticsSuccess, (state, { stats }) => ({ ...state, stats, loading: false })),
  on(StatisticsActions.loadStatisticsFailure, (state, { error }) => ({ ...state, error, loading: false }))
);
