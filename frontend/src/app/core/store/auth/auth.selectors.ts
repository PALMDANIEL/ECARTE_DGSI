import { createSelector } from '@ngrx/store';
import { AppState } from '..';

export const selectAuth = (state: AppState) => state.auth;

export const selectUser = createSelector(selectAuth, auth => auth.user);
export const selectAccessToken = createSelector(selectAuth, auth => auth.accessToken);
export const selectRefreshToken = createSelector(selectAuth, auth => auth.refreshToken);
export const selectAuthLoading = createSelector(selectAuth, auth => auth.loading);
export const selectAuthError = createSelector(selectAuth, auth => auth.error);
export const selectIsAuthenticated = createSelector(selectAccessToken, token => !!token);
