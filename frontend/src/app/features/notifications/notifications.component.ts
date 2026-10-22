import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { AppNotification, NotificationsService } from './notifications.service';

const TYPE_ICON: Record<string, string> = { REQUEST_ASSIGNED: 'pi pi-inbox', REQUEST_UPDATE: 'pi pi-info-circle', REQUEST_OVERDUE: 'pi pi-clock', REQUEST_ESCALATED: 'pi pi-exclamation-triangle' };

@Component({
  selector: 'app-notifications',
  standalone: false,
  template: `
    <div class="ec-page">
      <div class="ec-page-header">
        <div><h1 class="ec-display">Notifications</h1><p class="ec-mono">{{ unread }} NON LUE(S)</p></div>
        <div class="ec-toolbar-row" style="margin:0">
          <button pButton type="button" [label]="unreadOnly ? 'Toutes' : 'Non lues'" icon="pi pi-filter" class="p-button-text" (click)="unreadOnly = !unreadOnly; page = 1; load()"></button>
          <button pButton type="button" label="Tout marquer comme lu" icon="pi pi-check" [disabled]="!unread" (click)="readAll()"></button>
        </div>
      </div>
      <div class="ec-panel">
        <div class="ec-empty" *ngIf="!items.length">Aucune notification.</div>
        <ul class="nt-list">
          <li *ngFor="let n of items" [class.unread]="!n.isRead" (click)="open(n)" (keyup.enter)="open(n)" tabindex="0">
            <i [class]="icon(n.type)"></i>
            <div><div class="nt-msg">{{ n.message }}</div><div class="ec-mono nt-date">{{ n.createdAt | date:'dd/MM/yyyy HH:mm' }}</div></div>
            <span class="ec-badge" *ngIf="!n.isRead">nouveau</span>
          </li>
        </ul>
        <div class="ec-pager" *ngIf="pages > 1">
          <button pButton type="button" icon="pi pi-chevron-left" class="p-button-text" [disabled]="page <= 1" (click)="page = page - 1; load()"></button>
          <span class="ec-mono">{{ page }} / {{ pages }}</span>
          <button pButton type="button" icon="pi pi-chevron-right" class="p-button-text" [disabled]="page >= pages" (click)="page = page + 1; load()"></button>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .nt-list { list-style: none; margin: 0; padding: 0; }
    .nt-list li { display: flex; align-items: center; gap: 14px; padding: 14px 18px; border-bottom: 1px solid var(--ec-line); cursor: pointer; }
    .nt-list li:hover { background: rgba(0,0,0,.025); }
    .nt-list li.unread { background: #fcfaf3; font-weight: 500; }
    .nt-list li > div { flex: 1; }
    .nt-list i { color: var(--ec-brass); font-size: 1.1rem; }
    .nt-date { font-size: .7rem; color: var(--ec-ink-soft); margin-top: 2px; }
    .ec-empty { padding: 32px; text-align: center; color: var(--ec-ink-soft); }
  `]
})
export class NotificationsComponent implements OnInit {
  items: AppNotification[] = [];
  unread = 0; total = 0; page = 1; limit = 20; unreadOnly = false;
  constructor(private api: NotificationsService, private router: Router) {}
  get pages() { return Math.max(1, Math.ceil(this.total / this.limit)); }
  ngOnInit() { this.load(); }
  icon(t: string) { return TYPE_ICON[t] || 'pi pi-bell'; }
  load() { this.api.list(this.page, this.unreadOnly).subscribe(r => { this.items = r.items; this.total = r.total; this.unread = r.unread; }); }
  readAll() { this.api.markAllRead().subscribe(() => this.load()); }
  open(n: AppNotification) {
    const go = () => { if (n.link) this.router.navigateByUrl(n.link); else this.load(); };
    if (n.isRead) go(); else this.api.markRead(n.id).subscribe(go);
  }
}
