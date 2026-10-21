import { createReducer, on } from '@ngrx/store';
import { initialAuthState } from './auth.state';
import * as AuthActions from './auth.actions';

export const authReducer = createReducer(
  initialAuthState,
  on(AuthActions.login, state => ({ ...state, loading: true, error: null })),
  on(AuthActions.loginSuccess, (state, { user, accessToken, refreshToken }) => {
    localStorage.setItem('accessToken', accessToken);
    localStorage.setItem('refreshToken', refreshToken);
    return {
      ...state,
      user,
      accessToken,
      refreshToken,
      loading: false,
      error: null
    };
  }),
  on(AuthActions.loginFailure, (state, { error }) => ({ ...state, loading: false, error })),
  on(AuthActions.logoutSuccess, () => {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    return { ...initialAuthState };
  }),
  on(AuthActions.loadUserSuccess, (state, { user }) => ({ ...state, user })),
  on(AuthActions.refreshTokenSuccess, (state, { accessToken }) => ({ ...state, accessToken }))
);
export type AuthState = typeof initialAuthState;
