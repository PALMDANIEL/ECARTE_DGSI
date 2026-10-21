import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { User } from '../../../core/models/user.model';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private apiUrl = `${environment.apiUrl}/auth`;

  constructor(private http: HttpClient) {}

  login(email: string, password: string): Observable<{ user: User; accessToken: string; refreshToken: string }> {
    return this.http.post<{ user: User; accessToken: string; refreshToken: string }>(`${this.apiUrl}/login`, { email, password });
  }

  logout(): Observable<void> {
    return this.http.post<void>(`${this.apiUrl}/logout`, {});
  }

  refreshToken(refreshToken: string): Observable<{ accessToken: string }> {
    return this.http.post<{ accessToken: string }>(`${this.apiUrl}/refresh`, { refreshToken });
  }

  getProfile(): Observable<User> {
    return this.http.get<User>(`${this.apiUrl}/me`);
  }
}
