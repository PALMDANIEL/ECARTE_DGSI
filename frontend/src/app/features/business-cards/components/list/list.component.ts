import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { BusinessCard } from '../../../../core/models/business-card.model';
import { CardService } from '../../services/card.service';
import { ConfirmationService, MessageService } from 'primeng/api';
import { environment } from '../../../../../environments/environment';

@Component({
  selector: 'app-card-list',
  standalone: false,
  template: `
    <div class="flex flex-column md:flex-row justify-content-between align-items-start md:align-items-center mb-6 gap-4">
      <div><h1 class="text-3xl font-bold text-gray-800 mb-1">Mes cartes de visite</h1><p class="text-gray-500">Gérez vos cartes numériques</p></div>
      <div class="flex gap-2">
        <p-button label="Nouvelle carte" icon="pi pi-plus" (click)="router.navigate(['/cards/create'])" styleClass="p-button-success shadow-lg border-round-xl px-5"></p-button>
        <p-button label="Rafraîchir" icon="pi pi-refresh" (click)="loadCards()" styleClass="p-button-outlined p-button-sm"></p-button>
      </div>
    </div>
    <p-card class="shadow-lg border-round-2xl" styleClass="p-4">
      <div *ngIf="loading" class="flex justify-content-center p-4"><p-progressSpinner></p-progressSpinner></div>
      <div *ngIf="error" class="p-4 bg-red-50 border-round text-red-600"><strong>Erreur :</strong> {{ error }}</div>
      <p-table *ngIf="!loading && !error" [value]="cards" [paginator]="true" [rows]="10" styleClass="p-datatable-striped">
        <ng-template pTemplate="header">
          <tr class="bg-gradient-to-r from-blue-50 to-indigo-50"><th>Nom</th><th>Fonction</th><th>Email</th><th>Téléphone</th><th>Statut</th><th style="width:180px">Actions</th></tr>
        </ng-template>
        <ng-template pTemplate="body" let-card>
          <tr class="hover:bg-blue-50 transition-colors">
            <td>{{ card.fullName }}</td><td>{{ card.jobTitle || '-' }}</td><td>{{ card.email || '-' }}</td><td>{{ card.phoneMobile || '-' }}</td>
            <td><p-tag [severity]="card.isActive ? 'success' : 'danger'" [value]="card.isActive ? 'Actif' : 'Inactif'"></p-tag></td>
            <td>
              <div class="flex justify-content-center gap-1">
                <p-button icon="pi pi-eye" (click)="viewCard(card)" class="p-button-sm p-button-text p-button-rounded" tooltip="Voir"></p-button>
                <p-button icon="pi pi-pencil" (click)="editCard(card.id)" class="p-button-sm p-button-text p-button-rounded" tooltip="Modifier"></p-button>
                <p-button icon="pi pi-trash" (click)="deleteCard(card.id)" class="p-button-sm p-button-text p-button-danger p-button-rounded" tooltip="Supprimer"></p-button>
                <p-button icon="pi pi-qrcode" (click)="showQR(card)" class="p-button-sm p-button-text p-button-rounded" tooltip="QR Code"></p-button>
              </div>
            </td>
          </tr>
        </ng-template>
      </p-table>
      <p *ngIf="!loading && !error && cards.length === 0" class="text-center text-gray-500 mt-4">Aucune carte trouvée.</p>
    </p-card>
    <p-dialog header="QR Code" [(visible)]="showQRDialog" [modal]="true" styleClass="w-25rem border-round-2xl">
      <div class="flex flex-column align-items-center"><img [src]="qrImageUrl" *ngIf="qrImageUrl" class="w-20rem shadow-lg border-round-lg" /><div class="flex gap-3 mt-4"><p-button label="PNG" icon="pi pi-download" (click)="downloadQR()" styleClass="p-button-success p-button-sm"></p-button><p-button label="SVG" icon="pi pi-download" (click)="downloadSVG()" styleClass="p-button-info p-button-sm"></p-button></div></div>
    </p-dialog>
  `
})
export class CardListComponent implements OnInit {
  cards: BusinessCard[] = [];
  loading = false;
  error: string | null = null;
  showQRDialog = false;
  qrImageUrl: string | null = null;
  selectedCard: BusinessCard | null = null;

  constructor(
    private cardService: CardService,
    private confirmationService: ConfirmationService,
    private messageService: MessageService,
    public router: Router
  ) {}

  ngOnInit() {
    this.loadCards();
  }

  loadCards() {
    this.loading = true;
    this.error = null;
    this.cardService.getAll().subscribe({
      next: (data) => {
        this.cards = data;
        this.loading = false;
      },
      error: (error) => {
        console.error(error);
        this.error = "Impossible de charger les cartes";
        this.loading = false;
      }
    });
  }

  viewCard(card: BusinessCard) {
    this.router.navigate(['/card', card.slug]);
  }

  editCard(id: string) {
    this.router.navigate(['/cards/edit', id]);
  }

  deleteCard(id: string) {
    this.confirmationService.confirm({
      message: 'Voulez-vous vraiment supprimer cette carte ?',
      accept: () => {
        this.cardService.delete(id).subscribe({
          next: () => {
            this.messageService.add({ severity: 'success', summary: 'Supprimée', detail: 'Carte supprimée' });
            this.loadCards();
          },
          error: () => this.messageService.add({ severity: 'error', summary: 'Erreur', detail: 'Échec de la suppression' })
        });
      }
    });
  }

  showQR(card: BusinessCard) {
    this.selectedCard = card;
    const url = window.location.origin + '/card/' + card.slug;
    this.qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(url)}&size=300x300`;
    this.showQRDialog = true;
  }

  downloadQR() {
    if (this.qrImageUrl) {
      const link = document.createElement('a');
      link.href = this.qrImageUrl;
      link.download = `qr-${this.selectedCard?.slug}.png`;
      link.click();
    }
  }
  downloadSVG() {
    if (this.selectedCard) {
      const url = window.location.origin + '/card/' + this.selectedCard.slug;
      const svgUrl = `https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(url)}&format=svg`;
      const link = document.createElement('a');
      link.href = svgUrl;
      link.download = `qr-${this.selectedCard.slug}.svg`;
      link.click();
    }
  }
}
