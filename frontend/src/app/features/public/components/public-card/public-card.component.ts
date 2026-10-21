import { Component, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { MessageService } from 'primeng/api';
import { PublicCardService } from '../../services/public-card.service';
import { BusinessCard } from '../../../../core/models/business-card.model';
import { environment } from '../../../../../environments/environment';
import * as QRCode from 'qrcode';

@Component({
  selector: 'app-public-card',
  standalone: false,
  template: `
    <p-toast position="top-center"></p-toast>

    <div class="ec-stage">
      <div class="ec-card" *ngIf="card; else loadingOrError">
        <div class="ec-card-foil"></div>
        <div class="ec-card-body">
          <img [src]="card.photo || 'https://ui-avatars.com/api/?name=' + card.fullName + '&background=12172B&color=C89B3C&bold=true'" class="ec-avatar" />
          <h1 class="ec-name">{{ card.fullName }}</h1>
          <p class="ec-title" *ngIf="card.jobTitle">{{ card.jobTitle | uppercase }}</p>
          <p class="ec-org" *ngIf="orgLine">{{ orgLine }}</p>

          <div class="ec-divider"></div>

          <div class="ec-details">
            <a class="ec-detail" [href]="'tel:' + card.phoneMobile" *ngIf="card.phoneMobile">
              <i class="pi pi-phone"></i><span>{{ card.phoneMobile }}</span>
            </a>
            <a class="ec-detail" [href]="'mailto:' + card.email" *ngIf="card.email">
              <i class="pi pi-envelope"></i><span>{{ card.email }}</span>
            </a>
            <a class="ec-detail" [href]="link(card.website)" target="_blank" rel="noopener" *ngIf="card.website">
              <i class="pi pi-globe"></i><span>{{ card.website }}</span>
            </a>
            <a class="ec-detail" *ngIf="card.address || (card.gpsLat != null && card.gpsLng != null)" [href]="mapUrl()" target="_blank" rel="noopener">
              <i class="pi pi-map-marker"></i><span>{{ card.address || 'Voir sur la carte' }}</span>
            </a>
          </div>

          <div class="ec-actions">
            <button class="ec-btn ec-btn-primary" (click)="call()" *ngIf="card.phoneMobile"><i class="pi pi-phone"></i> Appeler</button>
            <button class="ec-btn" (click)="whatsapp()" *ngIf="card.whatsapp"><i class="pi pi-whatsapp"></i> WhatsApp</button>
            <button class="ec-btn" (click)="email()" *ngIf="card.email"><i class="pi pi-envelope"></i> Email</button>
            <button class="ec-btn ec-btn-outline" [disabled]="isExportingPdf" (click)="exportPDF()">
              <i class="pi" [ngClass]="isExportingPdf ? 'pi-spin pi-spinner' : 'pi-file-pdf'"></i>
              {{ isExportingPdf ? 'Génération…' : 'Carte imprimable (PDF)' }}
            </button>
            <button class="ec-btn ec-btn-outline" (click)="downloadVCard()"><i class="pi pi-user-plus"></i> Ajouter aux contacts</button>
          </div>

          <div class="ec-social" *ngIf="card.linkedin || card.facebook || card.instagram || card.tiktok">
            <a *ngIf="card.linkedin" [href]="link(card.linkedin)" target="_blank" rel="noopener"><i class="pi pi-linkedin"></i></a>
            <a *ngIf="card.facebook" [href]="link(card.facebook)" target="_blank" rel="noopener"><i class="pi pi-facebook"></i></a>
            <a *ngIf="card.instagram" [href]="link(card.instagram)" target="_blank" rel="noopener"><i class="pi pi-instagram"></i></a>
            <a *ngIf="card.tiktok" [href]="link(card.tiktok)" target="_blank" rel="noopener"><i class="pi pi-tiktok"></i></a>
          </div>
        </div>

        <div class="ec-seal" *ngIf="qrImageUrl">
          <img [src]="qrImageUrl" alt="QR code du contact" />
          <span>Scanner pour enregistrer</span>
        </div>
      </div>
    </div>

    <ng-template #loadingOrError>
      <div class="ec-stage">
        <div class="ec-loading" *ngIf="isLoading; else errorTpl">
          <div class="ec-spinner"></div>
          <p class="ec-mono">Chargement…</p>
        </div>
        <ng-template #errorTpl>
          <div class="ec-error">
            <i class="pi pi-exclamation-triangle"></i>
            <p>{{ errorMessage || 'Carte introuvable' }}</p>
          </div>
        </ng-template>
      </div>
    </ng-template>
  `,
  styles: [`
    :host { display: block; font-family: 'Inter', sans-serif; }
    .ec-stage {
      min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 24px;
      background: radial-gradient(circle at 20% 10%, rgba(200,155,60,0.10), transparent 45%),
                  radial-gradient(circle at 80% 90%, rgba(15,139,141,0.10), transparent 45%), #FAFAF8;
    }
    .ec-card { position: relative; width: 100%; max-width: 420px; background: #FFFFFF; border-radius: 20px; box-shadow: 0 20px 60px rgba(18,23,43,0.16); overflow: hidden; }
    .ec-card-foil { height: 6px; background: linear-gradient(90deg, #C89B3C, #0F8B8D, #C89B3C); }
    .ec-card-body { padding: 40px 32px 32px; display: flex; flex-direction: column; align-items: center; text-align: center; }
    .ec-avatar { width: 96px; height: 96px; border-radius: 50%; object-fit: cover; border: 3px solid #E8D5A0; }
    .ec-name { font-family: 'Fraunces', serif; font-style: italic; font-weight: 600; font-size: 1.9rem; margin: 16px 0 2px; color: #12172B; }
    .ec-title { font-family: 'IBM Plex Mono', monospace; letter-spacing: 0.04em; font-size: 0.72rem; color: #0F8B8D; margin: 0; font-weight: 500; }
    .ec-org { font-size: 0.8rem; color: #2A3150; margin: 6px 0 0; }
    .ec-divider { width: 48px; height: 2px; background: #C89B3C; margin: 20px 0; border-radius: 1px; }
    .ec-details { width: 100%; display: flex; flex-direction: column; gap: 10px; margin-bottom: 24px; }
    .ec-detail { display: flex; align-items: center; gap: 10px; font-size: 0.9rem; color: #2A3150; text-decoration: none; padding: 8px 12px; border-radius: 8px; background: #FAFAF8; justify-content: center; }
    .ec-detail i { color: #C89B3C; width: 16px; }
    .ec-detail:hover { background: #E8D5A0; color: #12172B; }
    .ec-actions { width: 100%; display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
    .ec-btn { display: flex; align-items: center; justify-content: center; gap: 8px; padding: 12px; border-radius: 10px; border: none; font-weight: 600; font-size: 0.85rem; cursor: pointer; background: #12172B; color: white; transition: transform .15s ease; }
    .ec-btn:hover:not(:disabled) { transform: translateY(-2px); }
    .ec-btn:disabled { opacity: 0.65; cursor: default; }
    .ec-btn-primary { background: #0F8B8D; }
    .ec-btn-outline { background: transparent; color: #12172B; border: 1.5px solid #E4E1D8; grid-column: span 2; }
    .ec-social { display: flex; gap: 16px; margin-top: 20px; }
    .ec-social a { color: #2A3150; font-size: 1.2rem; }
    .ec-social a:hover { color: #C89B3C; }
    .ec-seal { display: flex; flex-direction: column; align-items: center; gap: 6px; width: 150px; margin: 4px auto 24px; text-align: center; padding: 8px 8px 6px; border-radius: 12px; background: #FFFFFF; border: 1px solid #E4E1D8; }
    .ec-seal span { font-size: 0.65rem; color: #5B6070; letter-spacing: .04em; text-transform: uppercase; }
    .ec-seal img { width: 100%; height: auto; display: block; }
    .ec-loading, .ec-error { display: flex; flex-direction: column; align-items: center; gap: 12px; color: #2A3150; }
    .ec-spinner { width: 32px; height: 32px; border: 3px solid #E4E1D8; border-top-color: #C89B3C; border-radius: 50%; animation: ec-spin 0.8s linear infinite; }
    @keyframes ec-spin { to { transform: rotate(360deg); } }
    .ec-error i { font-size: 2rem; color: #D64545; }
    @media (max-width: 480px) { .ec-card-body { padding: 32px 20px 28px; } .ec-name { font-size: 1.6rem; } }
  `]
})
export class PublicCardComponent implements OnInit {
  card: BusinessCard | null = null;
  qrImageUrl: string | null = null;
  isLoading = true;
  isExportingPdf = false;
  errorMessage: string | null = null;
  orgLine = '';

  constructor(
    private route: ActivatedRoute,
    private publicCardService: PublicCardService,
    private http: HttpClient,
    private messageService: MessageService
  ) {}

  ngOnInit() {
    const slug = this.route.snapshot.params['slug'];
    if (slug) {
      this.publicCardService.getCardBySlug(slug).subscribe({
        next: data => {
          this.card = data;
          const orgParts = [(data as any).ministry, (data as any).direction, (data as any).service].filter(Boolean);
          this.orgLine = orgParts.join(' · ');
          // QR généré localement à partir du même vCard que le téléchargement (rien n'est envoyé à un service tiers)
          this.publicCardService.getVCard(slug).subscribe({
            next: vcard => QRCode.toDataURL(vcard, { width: 220, margin: 1 }).then(url => (this.qrImageUrl = url)).catch(() => (this.qrImageUrl = null)),
            error: () => (this.qrImageUrl = null)
          });
          this.isLoading = false;
        },
        error: () => { this.errorMessage = 'Carte introuvable'; this.isLoading = false; }
      });
    }
  }

  // Ajoute https:// si l'URL saisie n'a pas de schéma (sinon le lien serait relatif au site)
  link(url?: string): string { return !url ? '' : /^https?:\/\//i.test(url) ? url : 'https://' + url; }
  mapUrl(): string {
    const c = this.card;
    const q = c && c.gpsLat != null && c.gpsLng != null ? `${c.gpsLat},${c.gpsLng}` : c?.address || '';
    return 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(q);
  }
  call() { if (this.card?.phoneMobile) window.location.href = 'tel:' + this.card.phoneMobile; }
  email() { if (this.card?.email) window.location.href = 'mailto:' + this.card.email; }
  whatsapp() { if (this.card?.whatsapp) window.open('https://wa.me/' + this.card.whatsapp.replace(/[^0-9]/g,''), '_blank'); }

  downloadVCard() {
    if (!this.card) return;
    const slug = this.card.slug;
    this.publicCardService.getVCard(slug).subscribe({
      next: vcard => {
        const url = window.URL.createObjectURL(new Blob([vcard], { type: 'text/vcard' }));
        const a = document.createElement('a');
        a.href = url;
        a.download = (slug || 'contact') + '.vcf';
        a.click();
        window.URL.revokeObjectURL(url);
      },
      error: () => this.messageService.add({ severity: 'error', summary: 'Erreur', detail: 'Impossible de télécharger le contact.' })
    });
  }

  exportPDF() {
    if (!this.card || this.isExportingPdf) return;
    this.isExportingPdf = true;
    const url = `${environment.apiUrl}/cards/public/${this.card.slug}/pdf`;

    this.http.get(url, { responseType: 'blob', observe: 'response' }).subscribe({
      next: (response) => {
        const blob = response.body;
        if (!blob || blob.size === 0) {
          this.messageService.add({ severity: 'error', summary: 'Erreur', detail: 'Le PDF généré est vide.' });
          this.isExportingPdf = false;
          return;
        }
        const blobUrl = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = blobUrl;
        a.download = `carte-${this.card?.slug || 'contact'}.pdf`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(blobUrl);
        this.isExportingPdf = false;
      },
      error: (err) => {
        console.error('❌ Erreur export PDF:', err);
        this.messageService.add({
          severity: 'error',
          summary: 'Échec de la génération du PDF',
          detail: `Code ${err.status || '?'} — regardez les logs du serveur backend pour le détail.`
        });
        this.isExportingPdf = false;
      }
    });
  }
}
