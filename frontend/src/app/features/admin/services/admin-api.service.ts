import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';

export type OrgUnitType = 'SG' | 'DG' | 'DIRECTION' | 'SERVICE' | 'UNITE';

export interface OrgUnit { id: string; code: string; name: string; type: OrgUnitType; parentId: string | null; isActive: boolean; }
export interface Position {
  id: string; code: string; label: string; civility?: string | null; level: number; isActive: boolean;
  orgUnitId?: string | null; orgUnit?: { id: string; code: string; name: string } | null;
  holder?: { id: string; firstName: string; lastName: string } | null;
  activeDelegations?: { id: string; delegate: { firstName: string; lastName: string }; endsAt: string }[];
}
export interface Delegation {
  id: string; startsAt: string; endsAt: string; requestTypes: string[]; reason?: string;
  position: { id: string; code: string; label: string }; delegate: { id: string; firstName: string; lastName: string };
}
export interface AgentProfile {
  matricule: string; civility?: string | null; grade?: string | null; corps?: string | null; hireDate?: string | null; serviceStartDate?: string | null;
  regime: string; orgUnitId?: string | null; supervisorId?: string | null; hasPin: boolean; pinLocked?: boolean;
  orgUnit?: { id: string; code: string; name: string } | null; supervisor?: { id: string; firstName: string; lastName: string } | null;
}
export interface Agent {
  id: string; firstName: string; lastName: string; email: string; phone?: string | null; jobTitle?: string | null; isActive: boolean;
  profile: AgentProfile; orgChain?: { id: string; code: string; name: string; type: OrgUnitType }[];
  heldCards?: { id: string; cardNumber: string | null; status: string; expiresAt: string | null }[];
}
export interface ImportReport { dryRun: boolean; total: number; created: number; updated: number; errors: { line: number; message: string }[]; }
export interface AuditEntry { id: string; seq: number; actorEmail: string | null; action: string; entity: string; entityId: string | null; before: unknown; after: unknown; ip: string | null; createdAt: string; }
export interface RuleParam { key: string; description: string; defaultValue: number | string | boolean; value: number | string | boolean; isCustom: boolean; legalReference: string | null; history: { id: string; value: unknown; validFrom: string; validTo: string | null; legalReference?: string; comment?: string }[]; }

@Injectable({ providedIn: 'root' })
export class AdminApiService {
  private api = environment.apiUrl;
  constructor(private http: HttpClient) {}

  // Organisation
  orgUnits(): Observable<OrgUnit[]> { return this.http.get<OrgUnit[]>(`${this.api}/org-units`); }
  createUnit(body: Partial<OrgUnit>) { return this.http.post<OrgUnit>(`${this.api}/org-units`, body); }
  updateUnit(id: string, body: Partial<OrgUnit>) { return this.http.put<OrgUnit>(`${this.api}/org-units/${id}`, body); }
  deleteUnit(id: string) { return this.http.delete<void>(`${this.api}/org-units/${id}`); }
  importUnits(csv: string, dryRun: boolean) { return this.http.post<ImportReport>(`${this.api}/org-units/import`, { csv, dryRun }); }

  // Postes et délégations
  positions(): Observable<Position[]> { return this.http.get<Position[]>(`${this.api}/positions`); }
  createPosition(body: any) { return this.http.post<Position>(`${this.api}/positions`, body); }
  updatePosition(id: string, body: any) { return this.http.put<Position>(`${this.api}/positions/${id}`, body); }
  deletePosition(id: string) { return this.http.delete<void>(`${this.api}/positions/${id}`); }
  assignHolder(id: string, userId: string, startsAt?: string) { return this.http.post(`${this.api}/positions/${id}/holders`, { userId, startsAt }); }
  endHolder(id: string) { return this.http.post<void>(`${this.api}/positions/${id}/holders/end`, {}); }
  delegations(): Observable<Delegation[]> { return this.http.get<Delegation[]>(`${this.api}/delegations`); }
  createDelegation(body: any) { return this.http.post(`${this.api}/delegations`, body); }
  deleteDelegation(id: string) { return this.http.delete<void>(`${this.api}/delegations/${id}`); }

  // Agents
  agents(params: { search?: string; orgUnitId?: string; page?: number; limit?: number }): Observable<{ items: Agent[]; total: number; page: number; limit: number }> {
    let p = new HttpParams();
    Object.entries(params).forEach(([k, v]) => { if (v !== undefined && v !== null && v !== '') p = p.set(k, String(v)); });
    return this.http.get<any>(`${this.api}/agents`, { params: p });
  }
  agent(id: string) { return this.http.get<Agent>(`${this.api}/agents/${id}`); }
  createAgent(body: any) { return this.http.post<Agent>(`${this.api}/agents`, body); }
  updateAgent(id: string, body: any) { return this.http.put<Agent>(`${this.api}/agents/${id}`, body); }
  resetPin(id: string) { return this.http.post<{ pin: string }>(`${this.api}/agents/${id}/pin/reset`, {}); }
  setAgentActive(id: string, isActive: boolean) { return this.http.put<void>(`${this.api}/agents/${id}/active`, { isActive }); }
  importAgents(csv: string, dryRun: boolean) { return this.http.post<ImportReport>(`${this.api}/agents/import`, { csv, dryRun }); }
  template(kind: 'agents' | 'org-units') { return this.http.get(`${this.api}/${kind}/import/template`, { responseType: 'blob' }); }

  // Audit et règles
  audit(params: Record<string, any>) {
    let p = new HttpParams();
    Object.entries(params).forEach(([k, v]) => { if (v !== undefined && v !== null && v !== '') p = p.set(k, String(v)); });
    return this.http.get<{ items: AuditEntry[]; total: number; page: number; limit: number }>(`${this.api}/audit`, { params: p });
  }
  verifyAudit() { return this.http.get<{ ok: boolean; checked: number; brokenAtSeq?: number }>(`${this.api}/audit/verify`); }
  rules() { return this.http.get<RuleParam[]>(`${this.api}/settings/rules`); }
  setRule(key: string, body: { value: unknown; validFrom?: string; legalReference?: string; comment?: string }) { return this.http.put(`${this.api}/settings/rules/${key}`, body); }
}
