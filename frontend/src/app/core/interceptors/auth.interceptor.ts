import { Injectable } from '@angular/core';
import { HttpInterceptor, HttpRequest, HttpHandler, HttpEvent, HttpErrorResponse, HttpBackend, HttpClient } from '@angular/common/http';
import { Observable, BehaviorSubject, throwError } from 'rxjs';
import { catchError, filter, switchMap, take } from 'rxjs/operators';
import { Router } from '@angular/router';
import { environment } from '../../../environments/environment';

@Injectable()
export class AuthInterceptor implements HttpInterceptor {
  private refreshing = false;
  private newToken$ = new BehaviorSubject<string | null>(null);
  // HttpClient construit sur HttpBackend : ne repasse pas par cet intercepteur (évite la boucle sur /auth/refresh)
  private rawHttp: HttpClient;

  constructor(private router: Router, backend: HttpBackend) {
    this.rawHttp = new HttpClient(backend);
  }

  intercept(req: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {
    return next.handle(this.withToken(req)).pipe(
      catchError((error: HttpErrorResponse) => {
        const isAuthCall = req.url.includes('/auth/login') || req.url.includes('/auth/refresh');
        if (error.status === 401 && !isAuthCall) return this.handle401(req, next, error);
        return throwError(() => error);
      })
    );
  }

  private withToken(req: HttpRequest<any>, token = localStorage.getItem('accessToken')) {
    return token ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : req;
  }

  private handle401(req: HttpRequest<any>, next: HttpHandler, original: HttpErrorResponse): Observable<HttpEvent<any>> {
    const refreshToken = localStorage.getItem('refreshToken');
    if (!refreshToken) return this.logout(original);

    if (!this.refreshing) {
      this.refreshing = true;
      this.newToken$.next(null);
      return this.rawHttp.post<{ accessToken: string }>(`${environment.apiUrl}/auth/refresh`, { refreshToken }).pipe(
        switchMap(({ accessToken }) => {
          localStorage.setItem('accessToken', accessToken);
          this.refreshing = false;
          this.newToken$.next(accessToken);
          return next.handle(this.withToken(req, accessToken));
        }),
        catchError(() => { this.refreshing = false; return this.logout(original); })
      );
    }
    // Un rafraîchissement est déjà en cours : on attend son résultat puis on rejoue la requête
    return this.newToken$.pipe(
      filter((t): t is string => t !== null),
      take(1),
      switchMap(token => next.handle(this.withToken(req, token)))
    );
  }

  private logout(error: HttpErrorResponse): Observable<never> {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    this.router.navigate(['/auth/login']);
    return throwError(() => error);
  }
}
