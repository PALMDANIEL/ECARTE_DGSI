import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, tap } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface AppNotification { id: string; type: string; message: string; link: string | null; requestId: string | null; isRead: boolean; createdAt: string; }
export interface NotificationPage { items: AppNotification[]; total: number; unread: number; page: number; limit: number; }

@Injectable({ providedIn: 'root' })
export class NotificationsService {
  private api = `${environment.apiUrl}/notifications`;
  private unread$ = new BehaviorSubject<number>(0);
  readonly unread = this.unread$.asObservable();
  private timer: any;
  constructor(private http: HttpClient) {}

  /** Interroge le serveur toutes les 60 s tant que l'utilisateur est connecté. */
  startPolling() {
    this.refreshCount();
    if (!this.timer) this.timer = setInterval(() => this.refreshCount(), 60_000);
  }
  stopPolling() { clearInterval(this.timer); this.timer = null; this.unread$.next(0); }
  refreshCount() { this.http.get<{ unread: number }>(`${this.api}/unread-count`).subscribe({ next: r => this.unread$.next(r.unread), error: () => {} }); }

  list(page = 1, unreadOnly = false): Observable<NotificationPage> {
    return this.http.get<NotificationPage>(this.api, { params: { page, limit: 20, unread: unreadOnly } }).pipe(tap(r => this.unread$.next(r.unread)));
  }
  markRead(id: string) { return this.http.post<void>(`${this.api}/${id}/read`, {}).pipe(tap(() => this.refreshCount())); }
  markAllRead() { return this.http.post<{ updated: number }>(`${this.api}/read-all`, {}).pipe(tap(() => this.unread$.next(0))); }
}
