import { Injectable, inject } from '@angular/core';
import { Actions, createEffect, ofType } from '@ngrx/effects';
import { of } from 'rxjs';
import { catchError, map, mergeMap } from 'rxjs/operators';
import { DashboardService } from '../../../services/dashboard.service';
import * as DashboardActions from '../dashboard.actions';
@Injectable()
export class DashboardEffects {
  private actions$ = inject(Actions);
  private dashboardService = inject(DashboardService);
  loadStats$ = createEffect(() =>
    this.actions$.pipe(
      ofType(DashboardActions.loadDashboardStats),
      mergeMap(() =>
        this.dashboardService.getStats().pipe(
          map(stats => DashboardActions.loadDashboardStatsSuccess({ stats })),
          catchError(error => of(DashboardActions.loadDashboardStatsFailure({ error: error.message })))
        )
      )
    )
  );
}
