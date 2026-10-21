import { Injectable } from '@angular/core';
import { CanActivate, Router } from '@angular/router';
import { Store } from '@ngrx/store';
import { Observable, map, take } from 'rxjs';
import { AppState } from '../store';
import { selectIsAuthenticated } from '../store/auth/auth.selectors';
@Injectable({ providedIn: 'root' })
export class LoginGuard implements CanActivate {
  constructor(private store: Store<AppState>, private router: Router) {}
  canActivate(): Observable<boolean> {
    return this.store.select(selectIsAuthenticated).pipe(
      take(1),
      map(storeAuth => {
        // Après un rechargement le store est vide : le jeton en localStorage fait foi
        const isAuth = storeAuth || !!localStorage.getItem('accessToken');
        if (isAuth) {
          this.router.navigate(['/dashboard']);
          return false;
        }
        return true;
      })
    );
  }
}
