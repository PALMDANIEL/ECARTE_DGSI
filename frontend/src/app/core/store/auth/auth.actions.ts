import { createAction, props } from '@ngrx/store';
import { User } from '../../models/user.model';

export const login = createAction('[Auth] Login', props<{ email: string; password: string }>());
export const loginSuccess = createAction('[Auth] Login Success', props<{ user: User; accessToken: string; refreshToken: string }>());
export const loginFailure = createAction('[Auth] Login Failure', props<{ error: string }>());
export const logout = createAction('[Auth] Logout');
export const logoutSuccess = createAction('[Auth] Logout Success');
export const loadUser = createAction('[Auth] Load User');
export const loadUserSuccess = createAction('[Auth] Load User Success', props<{ user: User }>());
export const loadUserFailure = createAction('[Auth] Load User Failure', props<{ error: string }>());
export const refreshToken = createAction('[Auth] Refresh Token');
export const refreshTokenSuccess = createAction('[Auth] Refresh Token Success', props<{ accessToken: string }>());
export const refreshTokenFailure = createAction('[Auth] Refresh Token Failure');
