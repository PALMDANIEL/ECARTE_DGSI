import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { Company } from '../../../core/models/company.model';
@Injectable({ providedIn: 'root' })
export class CompanyService {
  private apiUrl = environment.apiUrl;
  constructor(private http: HttpClient) {}
  getAll(): Observable<Company[]> { return this.http.get<Company[]>(`${this.apiUrl}/companies`); }
  getById(id: string): Observable<Company> { return this.http.get<Company>(`${this.apiUrl}/companies/${id}`); }
  create(company: any): Observable<Company> { return this.http.post<Company>(`${this.apiUrl}/companies`, company); }
  update(id: string, company: any): Observable<Company> { return this.http.put<Company>(`${this.apiUrl}/companies/${id}`, company); }
  delete(id: string): Observable<void> { return this.http.delete<void>(`${this.apiUrl}/companies/${id}`); }
}
