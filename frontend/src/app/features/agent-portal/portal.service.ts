import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface ScanResult { valid: boolean; agent: { displayName: string; photo: string | null; unit: string | null }; pinRequired: boolean; pinConfigured: boolean; }
export interface AgentFile {
  agent: {
    civility: string | null; firstName: string; lastName: string; matricule: string; grade: string | null; corps: string | null;
    hireDate: string | null; serviceStartDate: string | null; administration: string; orgChain: { id: string; code: string; name: string; type: string }[]; supervisor: string | null;
  };
  card: { number: string | null; expiresAt: string | null };
  services: { code: string; label: string }[];
}
export interface PinResult extends AgentFile { sessionToken: string; expiresInMinutes: number; }

/** Parcours agent : le jeton agent (QR + PIN) est distinct du jeton d'administration et n'est jamais mélangé avec lui. */
@Injectable({ providedIn: 'root' })
export class PortalService {
  private api = `${environment.apiUrl}/access`;
  constructor(private http: HttpClient) {}

  scan(token: string): Observable<ScanResult> { return this.http.get<ScanResult>(`${this.api}/${encodeURIComponent(token)}`); }
  verifyPin(token: string, pin: string): Observable<PinResult> { return this.http.post<PinResult>(`${this.api}/${encodeURIComponent(token)}/pin`, { pin }); }
  me(sessionToken: string): Observable<AgentFile> {
    return this.http.get<AgentFile>(`${this.api}/me`, { headers: new HttpHeaders({ Authorization: `Bearer ${sessionToken}` }) });
  }
}
