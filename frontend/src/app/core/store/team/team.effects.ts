import { Injectable, inject } from '@angular/core';
import { Actions, createEffect, ofType } from '@ngrx/effects';
import { of } from 'rxjs';
import { catchError, map, mergeMap } from 'rxjs/operators';
import { TeamService } from '../../../features/teams/services/team.service';
import * as TeamActions from './team.actions';

@Injectable()
export class TeamEffects {
  private actions$ = inject(Actions);
  private teamService = inject(TeamService);

  loadTeams$ = createEffect(() =>
    this.actions$.pipe(
      ofType(TeamActions.loadTeams),
      mergeMap(() =>
        this.teamService.getAll().pipe(
          map(teams => TeamActions.loadTeamsSuccess({ teams })),
          catchError(error => of(TeamActions.loadTeamsFailure({ error: error.error?.message || error.message })))
        )
      )
    )
  );

  createTeam$ = createEffect(() =>
    this.actions$.pipe(
      ofType(TeamActions.createTeam),
      mergeMap(({ team }) =>
        this.teamService.create(team).pipe(
          map(created => TeamActions.createTeamSuccess({ team: created })),
          catchError(error => of(TeamActions.createTeamFailure({ error: error.error?.message || error.message })))
        )
      )
    )
  );

  updateTeam$ = createEffect(() =>
    this.actions$.pipe(
      ofType(TeamActions.updateTeam),
      mergeMap(({ id, team }) =>
        this.teamService.update(id, team).pipe(
          map(updated => TeamActions.updateTeamSuccess({ team: updated })),
          catchError(error => of(TeamActions.updateTeamFailure({ error: error.error?.message || error.message })))
        )
      )
    )
  );

  deleteTeam$ = createEffect(() =>
    this.actions$.pipe(
      ofType(TeamActions.deleteTeam),
      mergeMap(({ id }) =>
        this.teamService.delete(id).pipe(
          map(() => TeamActions.deleteTeamSuccess({ id })),
          catchError(error => of(TeamActions.deleteTeamFailure({ error: error.error?.message || error.message })))
        )
      )
    )
  );
}
