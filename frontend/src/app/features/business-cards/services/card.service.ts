import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { BusinessCard } from '../../../core/models/business-card.model';

@Injectable({ providedIn: 'root' })
export class CardService {
  private apiUrl = environment.apiUrl;

  constructor(private http: HttpClient) {}

  private getHeaders(): HttpHeaders {
    const token = localStorage.getItem('accessToken');
    return new HttpHeaders({
      'Authorization': token ? 'Bearer ' + token : '',
      'Content-Type': 'application/json'
    });
  }

  getAll(): Observable<BusinessCard[]> {
    const url = `${this.apiUrl}/cards`;
    console.log('🔍 CardService.getAll() ->', url);
    return this.http.get<BusinessCard[]>(url, {
      headers: this.getHeaders()
    });
  }

  getById(id: string): Observable<BusinessCard> {
    return this.http.get<BusinessCard>(`${this.apiUrl}/cards/${id}`, {
      headers: this.getHeaders()
    });
  }

  create(card: any): Observable<BusinessCard> {
    return this.http.post<BusinessCard>(`${this.apiUrl}/cards`, card, {
      headers: this.getHeaders()
    });
  }

  update(id: string, card: any): Observable<BusinessCard> {
    return this.http.put<BusinessCard>(`${this.apiUrl}/cards/${id}`, card, {
      headers: this.getHeaders()
    });
  }

  delete(id: string): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/cards/${id}`, {
      headers: this.getHeaders()
    });
  }

  exportPDF(id: string): Observable<Blob> {
    return this.http.get(`${this.apiUrl}/cards/${id}/pdf`, {
      headers: this.getHeaders(),
      responseType: 'blob'
    });
  }

  exportVCard(id: string): Observable<string> {
    return this.http.get(`${this.apiUrl}/cards/${id}/vcard`, {
      headers: this.getHeaders(),
      responseType: 'text'
    });
  }
}
