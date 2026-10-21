import { createSelector } from '@ngrx/store';
import { AppState } from '..';
export const selectTeamState = (state: AppState) => state.team;
export const selectAllTeams = createSelector(selectTeamState, team => team.teams);
export const selectTeamsLoading = createSelector(selectTeamState, team => team.loading);
export const selectTeamsError = createSelector(selectTeamState, team => team.error);
