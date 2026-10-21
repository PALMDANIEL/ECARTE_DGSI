import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { BusinessCard } from '../../../core/models/business-card.model';
import { environment } from '../../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class PublicCardService {
  private apiUrl = `${environment.apiUrl}/cards`;

  constructor(private http: HttpClient) {}

  getVCard(slug: string): Observable<string> {
    return this.http.get(`${this.apiUrl}/public/${slug}/vcard`, { responseType: 'text' });
  }

  getCardBySlug(slug: string): Observable<BusinessCard> {
    return this.http.get<BusinessCard>(`${this.apiUrl}/public/${slug}`);
  }
}
