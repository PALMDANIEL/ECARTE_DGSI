import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';

export interface AppUser {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  jobTitle?: string;
  department?: string;
  role: string;
  isActive: boolean;
  isVerified: boolean;
}

@Injectable({ providedIn: 'root' })
export class UserService {
  private apiUrl = `${environment.apiUrl}/users`;
  constructor(private http: HttpClient) {}

  getAll(page = 1, limit = 20): Observable<{ users: AppUser[]; total: number }> {
    return this.http.get<{ users: AppUser[]; total: number }>(`${this.apiUrl}?page=${page}&limit=${limit}`);
  }
  create(data: any): Observable<AppUser> { return this.http.post<AppUser>(this.apiUrl, data); }
  update(id: string, data: any): Observable<AppUser> { return this.http.put<AppUser>(`${this.apiUrl}/${id}`, data); }
  delete(id: string): Observable<void> { return this.http.delete<void>(`${this.apiUrl}/${id}`); }
}
