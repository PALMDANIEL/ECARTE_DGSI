import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { BusinessCard } from '../../../core/models/business-card.model';

export type CardStatus = 'PENDING' | 'ACTIVE' | 'SUSPENDED' | 'REVOKED' | 'EXPIRED' | 'REPLACED';
export interface CardLifecycle {
  id: string; fullName: string; cardNumber: string | null; status: CardStatus; effectiveStatus: CardStatus;
  issuedAt: string | null; expiresAt: string | null; agentId: string | null;
  agent: { id: string; firstName: string; lastName: string; agentProfile: { matricule: string } | null } | null;
}
export interface CardEvent { id: string; type: string; reason: string | null; createdAt: string; metadata: any; }

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

  // --- Cycle de vie de la carte professionnelle ---
  lifecycle(id: string): Observable<CardLifecycle> { return this.http.get<CardLifecycle>(`${this.apiUrl}/cards/${id}/lifecycle`); }
  cardHistory(id: string): Observable<{ events: CardEvent[]; credentials: { id: string; tokenPrefix: string; createdAt: string; revokedAt: string | null; revokeReason: string | null }[] }> { return this.http.get<any>(`${this.apiUrl}/cards/${id}/history`); }
  issueCard(id: string): Observable<CardLifecycle> { return this.http.post<CardLifecycle>(`${this.apiUrl}/cards/${id}/issue`, {}); }
  renewCard(id: string): Observable<CardLifecycle> { return this.http.post<CardLifecycle>(`${this.apiUrl}/cards/${id}/renew`, {}); }
  reactivateCard(id: string): Observable<CardLifecycle> { return this.http.post<CardLifecycle>(`${this.apiUrl}/cards/${id}/reactivate`, {}); }
  suspendCard(id: string, reason: string): Observable<CardLifecycle> { return this.http.post<CardLifecycle>(`${this.apiUrl}/cards/${id}/suspend`, { reason }); }
  revokeCard(id: string, reason: string): Observable<CardLifecycle> { return this.http.post<CardLifecycle>(`${this.apiUrl}/cards/${id}/revoke`, { reason }); }
  replaceCard(id: string, reason: string): Observable<CardLifecycle> { return this.http.post<CardLifecycle>(`${this.apiUrl}/cards/${id}/replace`, { reason }); }
  accessQr(id: string): Observable<Blob> { return this.http.get(`${this.apiUrl}/cards/${id}/access-qr`, { responseType: 'blob' }); }

  uploadPhoto(file: File): Observable<{ url: string }> {
    const formData = new FormData();
    formData.append('file', file);
    return this.http.post<{ url: string }>(`${this.apiUrl}/files/upload`, formData);
  }
}
