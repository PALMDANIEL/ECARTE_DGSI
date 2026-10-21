import { createAction, props } from '@ngrx/store';
export const loadStatistics = createAction('[Statistics] Load Statistics');
export const loadStatisticsSuccess = createAction('[Statistics] Load Statistics Success', props<{ stats: any }>());
export const loadStatisticsFailure = createAction('[Statistics] Load Statistics Failure', props<{ error: string }>());
