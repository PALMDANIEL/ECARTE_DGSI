import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { BusinessCard } from '../../../core/models/business-card.model';

@Injectable({ providedIn: 'root' })
export class CardService {
  private apiUrl = environment.apiUrl;
  constructor(private http: HttpClient) {}
  getUserCards(): Observable<BusinessCard[]> { return this.http.get<BusinessCard[]>(`${this.apiUrl}/cards`); }
  getCard(id: string): Observable<BusinessCard> { return this.http.get<BusinessCard>(`${this.apiUrl}/cards/${id}`); }
  getCardBySlug(slug: string): Observable<BusinessCard> { return this.http.get<BusinessCard>(`${this.apiUrl}/cards/public/${slug}`); }
  createCard(data: any): Observable<BusinessCard> { return this.http.post<BusinessCard>(`${this.apiUrl}/cards`, data); }
  updateCard(id: string, data: any): Observable<BusinessCard> { return this.http.put<BusinessCard>(`${this.apiUrl}/cards/${id}`, data); }
  deleteCard(id: string): Observable<void> { return this.http.delete<void>(`${this.apiUrl}/cards/${id}`); }
  exportPDF(id: string): Observable<Blob> { return this.http.get(`${this.apiUrl}/cards/${id}/pdf`, { responseType: 'blob' }); }
  getQrCode(id: string): Observable<Blob> { return this.http.get(`${this.apiUrl}/cards/${id}/qrcode`, { responseType: 'blob' }); }

  uploadPhoto(file: File): Observable<{ url: string }> {
    const formData = new FormData();
    formData.append('file', file);
    return this.http.post<{ url: string }>(`${this.apiUrl}/files/upload`, formData);
  }
}
