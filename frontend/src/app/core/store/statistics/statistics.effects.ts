import { Injectable, inject } from '@angular/core';
import { Actions, createEffect, ofType } from '@ngrx/effects';
import { of } from 'rxjs';
import { catchError, map, mergeMap } from 'rxjs/operators';
import { StatisticsService } from '../../../features/statistics/services/statistics.service';
import * as StatisticsActions from './statistics.actions';

@Injectable()
export class StatisticsEffects {
  private actions$ = inject(Actions);
  private statisticsService = inject(StatisticsService);

  loadStatistics$ = createEffect(() =>
    this.actions$.pipe(
      ofType(StatisticsActions.loadStatistics),
      mergeMap(() =>
        this.statisticsService.getStats().pipe(
          map(stats => StatisticsActions.loadStatisticsSuccess({ stats })),
          catchError(error => of(StatisticsActions.loadStatisticsFailure({ error: error.message })))
        )
      )
    )
  );
}
