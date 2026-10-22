import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { environment } from '../../../environments/environment';

export interface PilotageFilters { from?: string; to?: string; typeCode?: string; status?: string; orgUnitId?: string; }
export interface OverdueItem { requestId: string; reference: string; type: string; applicant: string; step: string; titleSnapshot: string | null; dueAt: string; daysLate: number; reminderSentAt: string | null; escalatedAt: string | null; }
export interface BalanceRow { agentId: string; matricule: string; name: string; unit: string | null; year: number; acquired: number; authorized: number; consumed: number; adjustments: number; remaining: number; absenceDays: number; }

@Injectable({ providedIn: 'root' })
export class PilotageApiService {
  private api = environment.apiUrl;
  constructor(private http: HttpClient) {}

  private params(f: PilotageFilters, extra: Record<string, string | number> = {}) {
    let p = new HttpParams();
    for (const [k, v] of Object.entries({ ...f, ...extra })) if (v !== undefined && v !== null && v !== '') p = p.set(k, String(v));
    return p;
  }
  overview(f: PilotageFilters) { return this.http.get<any>(`${this.api}/stats/overview`, { params: this.params(f) }); }
  requests(f: PilotageFilters) { return this.http.get<any[]>(`${this.api}/stats/requests`, { params: this.params(f) }); }
  requestsCsv(f: PilotageFilters) { return this.http.get(`${this.api}/stats/requests.csv`, { params: this.params(f), responseType: 'blob' }); }
  balances(year: number, orgUnitId?: string) { return this.http.get<BalanceRow[]>(`${this.api}/stats/balances`, { params: this.params({ orgUnitId }, { year }) }); }
  balancesCsv(year: number, orgUnitId?: string) { return this.http.get(`${this.api}/stats/balances.csv`, { params: this.params({ orgUnitId }, { year }), responseType: 'blob' }); }
  overdue() { return this.http.get<OverdueItem[]>(`${this.api}/escalations/overdue`); }
  runSweep() { return this.http.post<{ reminders: number; escalations: number; checked: number }>(`${this.api}/escalations/run`, {}); }
}
