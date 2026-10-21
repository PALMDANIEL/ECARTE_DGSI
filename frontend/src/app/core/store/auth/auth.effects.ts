import { Injectable } from '@angular/core';
import { Actions, createEffect, ofType } from '@ngrx/effects';
import { of } from 'rxjs';
import { catchError, map, mergeMap, tap } from 'rxjs/operators';
import * as AuthActions from './auth.actions';
import { AuthService } from '../../../features/auth/services/auth.service';
import { Router } from '@angular/router';

@Injectable()
export class AuthEffects {
  login$ = createEffect(() =>
    this.actions$.pipe(
      ofType(AuthActions.login),
      mergeMap(({ email, password }) =>
        this.authService.login(email, password).pipe(
          map(response => AuthActions.loginSuccess({
            user: response.user,
            accessToken: response.accessToken,
            refreshToken: response.refreshToken
          })),
          catchError(error => of(AuthActions.loginFailure({ error: error.message || 'Login failed' })))
        )
      )
    )
  );

  loginSuccess$ = createEffect(() =>
    this.actions$.pipe(
      ofType(AuthActions.loginSuccess),
      tap(({ accessToken }) => {
        localStorage.setItem('accessToken', accessToken);
        this.router.navigate(['/dashboard']);
      })
    ), { dispatch: false }
  );

  logout$ = createEffect(() =>
    this.actions$.pipe(
      ofType(AuthActions.logout),
      tap(() => {
        localStorage.removeItem('accessToken');
        this.router.navigate(['/auth/login']);
      })
    ), { dispatch: false }
  );

  constructor(
    private actions$: Actions,
    private authService: AuthService,
    private router: Router
  ) {}
}
