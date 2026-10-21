import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { Team } from '../../../core/models/team.model';
@Injectable({ providedIn: 'root' })
export class TeamService {
  private apiUrl = environment.apiUrl;
  constructor(private http: HttpClient) {}
  getAll(): Observable<Team[]> { return this.http.get<Team[]>(`${this.apiUrl}/teams`); }
  getById(id: string): Observable<Team> { return this.http.get<Team>(`${this.apiUrl}/teams/${id}`); }
  create(team: any): Observable<Team> { return this.http.post<Team>(`${this.apiUrl}/teams`, team); }
  update(id: string, team: any): Observable<Team> { return this.http.put<Team>(`${this.apiUrl}/teams/${id}`, team); }
  delete(id: string): Observable<void> { return this.http.delete<void>(`${this.apiUrl}/teams/${id}`); }
}
