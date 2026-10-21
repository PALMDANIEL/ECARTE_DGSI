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

export interface PortalService_ { code: string; name: string; available: boolean; reason: string | null; attachmentRules: { code: string; label: string; required: boolean }[]; }
export interface PortalRequest {
  id: string; reference: string; status: string; round: number; submittedAt: string | null; data: Record<string, any>;
  type: { code: string; name: string; attachmentRules: { code: string; label: string; required: boolean }[] };
  progress: { id: string; order: number; label: string; result: string; actorName: string | null; comment: string | null; decidedAt: string | null; isActive: boolean }[];
  previousRounds: { round: number; label: string; result: string; comment: string | null }[];
  documents: { version: number; reason: string; createdAt: string }[];
  attachments: { id: string; code: string | null; name: string; size: number }[];
  issuedDecision?: { number: string; year: number; days: number } | null;
}
export interface LeaveDecisionOption { id: string; number: string; year: number; issuedAt: string; days: number; remainingDays: number; }
export interface AbsenceTypeOption { id: string; code: string; name: string; unit: 'JOUR' | 'HEURE' | 'BOTH'; annualCap: number | null; }

export interface PortalBalance {
  year: number;
  entitlement: { eligible: boolean; reason: string | null; eligibleFrom: string | null; days: number };
  annual: { acquired: number; carriedOver: number; adjustments: number; consumed: number; remaining: number; decided: number; takeable: number };
  absences: { code: string; name: string; cap: number | null; consumed: number; reserved: number; remaining: number | null }[];
}
export interface PreviewResult { ok: boolean; errors: Record<string, string>; info: Record<string, any>; }

/** Parcours agent : le jeton agent (QR + PIN) est distinct du jeton d'administration et n'est jamais mélangé avec lui. */
@Injectable({ providedIn: 'root' })
export class PortalService {
  private api = `${environment.apiUrl}/access`;
  constructor(private http: HttpClient) {}

  scan(token: string): Observable<ScanResult> { return this.http.get<ScanResult>(`${this.api}/${encodeURIComponent(token)}`); }
  verifyPin(token: string, pin: string): Observable<PinResult> {
    return this.http.post<PinResult>(`${this.api}/${encodeURIComponent(token)}/pin`, { pin });
  }
  /** Jeton de la session agent (QR + PIN) : conservé en mémoire seulement, jamais dans localStorage. */
  sessionToken: string | null = null;
  private opts() { return { headers: new HttpHeaders({ Authorization: `Bearer ${this.sessionToken}` }) }; }

  balance() { return this.http.get<PortalBalance>(`${this.api}/balance`, this.opts()); }
  preview(typeCode: string, fields: Record<string, any>) { return this.http.post<PreviewResult>(`${this.api}/requests/preview`, { typeCode, fields }, this.opts()); }
  services() { return this.http.get<PortalService_[]>(`${this.api}/services`, this.opts()); }
  decisions() { return this.http.get<LeaveDecisionOption[]>(`${this.api}/decisions`, this.opts()); }
  absenceTypes() { return this.http.get<AbsenceTypeOption[]>(`${this.api}/absence-types`, this.opts()); }
  requests() { return this.http.get<PortalRequest[]>(`${this.api}/requests`, this.opts()); }
  request(id: string) { return this.http.get<PortalRequest>(`${this.api}/requests/${id}`, this.opts()); }
  createRequest(typeCode: string, fields: Record<string, any>) { return this.http.post<PortalRequest>(`${this.api}/requests`, { typeCode, fields }, this.opts()); }
  updateRequest(id: string, fields: Record<string, any>) { return this.http.put<PortalRequest>(`${this.api}/requests/${id}`, { fields }, this.opts()); }
  submitRequest(id: string) { return this.http.post<PortalRequest>(`${this.api}/requests/${id}/submit`, {}, this.opts()); }
  cancelRequest(id: string) { return this.http.post<PortalRequest>(`${this.api}/requests/${id}/cancel`, {}, this.opts()); }
  uploadAttachment(id: string, file: File, code?: string) {
    const fd = new FormData(); fd.append('file', file); if (code) fd.append('code', code);
    return this.http.post<{ id: string; name: string; size: number; code: string | null }>(`${this.api}/requests/${id}/attachments`, fd, this.opts());
  }
  removeAttachment(id: string, attId: string) { return this.http.delete<void>(`${this.api}/requests/${id}/attachments/${attId}`, this.opts()); }
  documentBlob(id: string) { return this.http.get(`${this.api}/requests/${id}/document`, { ...this.opts(), responseType: 'blob' }); }

  me(sessionToken: string): Observable<AgentFile> {
    return this.http.get<AgentFile>(`${this.api}/me`, { headers: new HttpHeaders({ Authorization: `Bearer ${sessionToken}` }) });
  }
}
