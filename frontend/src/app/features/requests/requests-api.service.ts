import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export type RequestStatus = 'DRAFT' | 'IN_PROGRESS' | 'RETURNED' | 'APPROVED' | 'REJECTED' | 'CANCELLED';

export interface ProgressStep { id: string; order: number; kind: string; label: string; result: string; actorName: string | null; comment: string | null; decidedAt: string | null; dueAt: string | null; isActive: boolean; }
export interface RequestView {
  id: string; reference: string; status: RequestStatus; round: number; submittedAt: string | null; closedAt: string | null; createdAt: string;
  type: { code: string; name: string; attachmentRules?: { code: string; label: string; required: boolean }[] };
  data: Record<string, any>;
  agent?: { id: string; firstName: string; lastName: string; agentProfile?: { matricule: string; grade?: string | null; orgUnit?: { name: string; code: string } | null } | null };
  progress: ProgressStep[];
  previousRounds: { round: number; label: string; result: string; actorName: string | null; comment: string | null; decidedAt: string | null }[];
  documents: { id: string; version: number; reason: string; createdAt: string; size: number }[];
  attachments: { id: string; code: string | null; name: string; mime: string; size: number; createdAt: string }[];
  issuedDecision?: { number: string; year: number; days: number } | null;
  activeStep?: { id: string; label: string; kind: string; dueAt: string | null; overdue: boolean };
}

export const STATUS_LABEL: Record<string, string> = { DRAFT: 'Brouillon', IN_PROGRESS: 'En cours', RETURNED: 'À corriger', APPROVED: 'Approuvée', REJECTED: 'Rejetée', CANCELLED: 'Annulée' };
export const RESULT_LABEL: Record<string, string> = { PENDING: 'En attente', FAVORABLE: 'Avis favorable', UNFAVORABLE: 'Avis défavorable', APPROVED: 'Approuvé', REJECTED: 'Rejeté', RETURNED: 'Retourné pour correction' };

@Injectable({ providedIn: 'root' })
export class RequestsApiService {
  private api = `${environment.apiUrl}/requests`;
  constructor(private http: HttpClient) {}

  inbox(): Observable<RequestView[]> { return this.http.get<RequestView[]>(`${this.api}/inbox`); }
  search(f: Record<string, any>): Observable<{ items: RequestView[]; total: number; page: number; limit: number }> {
    let p = new HttpParams();
    Object.entries(f).forEach(([k, v]) => { if (v !== undefined && v !== null && v !== '') p = p.set(k, String(v)); });
    return this.http.get<any>(this.api, { params: p });
  }
  detail(id: string): Observable<RequestView> { return this.http.get<RequestView>(`${this.api}/${id}`); }
  act(id: string, stepId: string, body: { action: string; comment?: string; decisionNumber?: string }): Observable<RequestView> { return this.http.post<RequestView>(`${this.api}/${id}/steps/${stepId}/act`, body); }
  document(id: string, version?: number): Observable<Blob> { return this.http.get(`${this.api}/${id}/${version ? 'documents/' + version : 'document'}`, { responseType: 'blob' }); }
  attachment(id: string, attId: string): Observable<Blob> { return this.http.get(`${this.api}/${id}/attachments/${attId}`, { responseType: 'blob' }); }
  regenerate(id: string) { return this.http.post(`${this.api}/${id}/regenerate`, {}); }
}
