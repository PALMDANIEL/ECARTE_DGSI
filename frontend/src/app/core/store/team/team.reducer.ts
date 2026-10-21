import { createReducer, on } from '@ngrx/store';
import { Team } from '../../models/team.model';
import * as TeamActions from './team.actions';
export interface TeamState {
  teams: Team[];
  loading: boolean;
  error: string | null;
}
export const initialTeamState: TeamState = {
  teams: [],
  loading: false,
  error: null
};
export const teamReducer = createReducer(
  initialTeamState,
  on(TeamActions.loadTeams, state => ({ ...state, loading: true })),
  on(TeamActions.loadTeamsSuccess, (state, { teams }) => ({ ...state, teams, loading: false })),
  on(TeamActions.loadTeamsFailure, (state, { error }) => ({ ...state, error, loading: false })),
  on(TeamActions.createTeamSuccess, (state, { team }) => ({ ...state, teams: [...state.teams, team] })),
  on(TeamActions.updateTeamSuccess, (state, { team }) => ({
    ...state,
    teams: state.teams.map(t => t.id === team.id ? team : t)
  })),
  on(TeamActions.deleteTeamSuccess, (state, { id }) => ({
    ...state,
    teams: state.teams.filter(t => t.id !== id)
  }))
);
