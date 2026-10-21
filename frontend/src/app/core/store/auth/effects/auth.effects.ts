import { Injectable, inject } from '@angular/core';
import { Actions, createEffect, ofType } from '@ngrx/effects';
import { of } from 'rxjs';
import { catchError, map, mergeMap, tap } from 'rxjs/operators';
import { Router } from '@angular/router';
import { AuthService } from '../../../services/auth.service';
import * as AuthActions from '../auth.actions';

@Injectable()
export class AuthEffects {
  private actions$ = inject(Actions);
  private authService = inject(AuthService);
  private router = inject(Router);

  private static translate(message?: string): string | undefined {
    const messages: Record<string, string> = {
      'Invalid credentials': 'Email ou mot de passe incorrect',
      'Account locked': 'Compte verrouillé après trop de tentatives, réessayez plus tard',
      'Account disabled': 'Ce compte est désactivé'
    };
    return message ? messages[message] || message : undefined;
  }

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
          catchError(error => of(AuthActions.loginFailure({ error: AuthEffects.translate(error.error?.message) || (error.status === 0 ? 'Serveur injoignable' : 'Erreur de connexion') })))
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
        localStorage.removeItem('refreshToken');
        this.router.navigate(['/auth/login']);
      })
    ), { dispatch: false }
  );
}
