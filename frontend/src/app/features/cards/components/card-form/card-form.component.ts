import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { CardService } from '../../services/card.service';
import { MessageService } from 'primeng/api';
import { Location } from '@angular/common';
import { BusinessCard } from '../../../../core/models/business-card.model';
import { currentRole } from '../../../../core/auth/role';
import { AdminApiService, Agent } from '../../../admin/services/admin-api.service';

@Component({
  selector: 'app-card-form',
  standalone: false,
  template: `
    <div class="ec-page">
      <h1 class="ec-display">{{isEdit ? 'Modifier' : 'Créer'}} une carte</h1>
      <form [formGroup]="cardForm" (ngSubmit)="onSubmit()">

        <div class="ec-photo-field">
          <div class="ec-photo-preview" [class.empty]="!photoPreview">
            <img *ngIf="photoPreview" [src]="photoPreview" />
            <i *ngIf="!photoPreview" class="pi pi-user"></i>
            <div class="ec-photo-uploading" *ngIf="uploadingPhoto">
              <i class="pi pi-spin pi-spinner"></i>
            </div>
          </div>
          <div class="ec-photo-actions">
            <label class="ec-photo-btn" for="photoInput">
              <i class="pi pi-upload"></i> {{ photoPreview ? 'Changer la photo' : 'Ajouter une photo' }}
            </label>
            <input id="photoInput" type="file" accept="image/png,image/jpeg,image/webp" (change)="onPhotoSelected($event)" hidden />
            <button type="button" class="ec-photo-remove" *ngIf="photoPreview" (click)="removePhoto()">
              <i class="pi pi-trash"></i>
            </button>
          </div>
          <p class="ec-photo-hint">JPG, PNG ou WebP — 5 Mo max</p>
        </div>

        <div class="ec-form-grid">
          <div class="p-field" *ngIf="canChooseAgent" style="grid-column: 1 / -1">
            <label>Agent titulaire de la carte</label>
            <select class="ec-select-agent" formControlName="agentId">
              <option value="">— Aucun (carte de visite simple) —</option>
              <option *ngFor="let a of agents" [value]="a.id">{{ a.lastName | uppercase }} {{ a.firstName }} — {{ a.profile.matricule }}</option>
            </select>
            <small style="color: var(--ec-ink-soft)">Nécessaire pour émettre la carte professionnelle avec QR d'accès. Non modifiable une fois la carte émise.</small>
          </div>
          <div class="p-field"><label>Nom complet *</label><input pInputText
            formControlName="fullName" placeholder="Jean Dupont"/></div>
          <div class="p-field"><label>Fonction</label><input pInputText
            formControlName="jobTitle" placeholder="Directeur commercial"/></div>
          <div class="p-field"><label>Ministère</label><input pInputText
            formControlName="ministry" placeholder="Ministère de l'Économie"/></div>
          <div class="p-field"><label>Direction</label><input pInputText
            formControlName="direction" placeholder="Direction Générale"/></div>
          <div class="p-field"><label>Service</label><input pInputText
            formControlName="service" placeholder="Service Informatique"/></div>
          <div class="p-field"><label>Email</label><input pInputText
            formControlName="email" type="email" placeholder="jean@entreprise.com"/></div>
          <div class="p-field"><label>Téléphone mobile</label><input pInputText formControlName="phoneMobile" placeholder="+225 01 23 45 67"/></div>
          <div class="p-field"><label>Téléphone fixe</label><input pInputText
            formControlName="phoneWork" placeholder="+225 20 21 22 23"/></div>
          <div class="p-field"><label>WhatsApp</label><input pInputText
            formControlName="whatsapp" placeholder="+225 01 23 45 67"/></div>
          <div class="p-field"><label>Site web</label><input pInputText
            formControlName="website" placeholder="https://www.entreprise.com"/></div>
          <div class="p-field"><label>Adresse</label><input pInputText
            formControlName="address" placeholder="Abidjan, Cocody"/></div>
          <div class="p-field"><label>LinkedIn</label><input pInputText
            formControlName="linkedin" placeholder="https://linkedin.com/in/jean"/></div>
          <div class="p-field"><label>Facebook</label><input pInputText
            formControlName="facebook" placeholder="https://facebook.com/jean"/></div>
          <div class="p-field"><label>Instagram</label><input pInputText
            formControlName="instagram" placeholder="https://instagram.com/jean.dupont"/></div>
          <div class="p-field"><label>TikTok</label><input pInputText
            formControlName="tiktok" placeholder="https://tiktok.com/@jean"/></div>
          <div class="p-field"><label>Latitude GPS</label><input pInputText type="number" step="any"
            formControlName="gpsLat" placeholder="5.3600"/></div>
          <div class="p-field"><label>Longitude GPS</label><input pInputText type="number" step="any"
            formControlName="gpsLng" placeholder="-4.0083"/></div>
        </div>
        <div class="ec-form-actions">
          <button type="button" pButton label="Annuler" class="p-button-text"
            (click)="cancel()"></button>
          <button type="submit" pButton [label]="isEdit ? 'Mettre à jour' : 'Créer'"
            [disabled]="cardForm.invalid || submitting || uploadingPhoto" icon="pi pi-save"></button>
        </div>
        <div class="ec-error-box" *ngIf="errorMsg">{{errorMsg}}</div>
      </form>
    </div>
  `,
  styles: [`
    .ec-form-grid {display:grid;grid-template-columns:1fr 1fr;gap:16px 24px;
      background:var(--ec-paper-raised);padding:24px;border-radius:14px;border:1px solid var(--ec-line);margin:20px 0;}
    .p-field {display:flex;flex-direction:column;gap:4px;}
    .ec-select-agent { padding: 8px 10px; border-radius: 8px; border: 1px solid var(--ec-line); font-family: var(--ec-font-body); background: #fff; }
    .p-field label {font-weight:600;font-size:0.85rem;color:var(--ec-ink-soft);}
    .ec-form-actions {display:flex;gap:12px;justify-content:flex-end;}
    .ec-error-box {margin-top:16px;padding:10px 12px;background:#FBEAEA;
      color:var(--ec-coral);border-radius:8px;font-size:0.85rem;}
    @media (max-width:600px){.ec-form-grid {grid-template-columns:1fr;}}

    .ec-photo-field { display: flex; flex-direction: column; align-items: center; gap: 10px; margin-bottom: 8px; }
    .ec-photo-preview {
      position: relative; width: 96px; height: 96px; border-radius: 50%;
      background: var(--ec-paper-raised); border: 2px solid var(--ec-brass-soft);
      display: flex; align-items: center; justify-content: center; overflow: hidden;
    }
    .ec-photo-preview img { width: 100%; height: 100%; object-fit: cover; }
    .ec-photo-preview.empty i { font-size: 2rem; color: var(--ec-ink-soft); }
    .ec-photo-uploading {
      position: absolute; inset: 0; background: rgba(18,23,43,0.55);
      display: flex; align-items: center; justify-content: center; color: #fff; font-size: 1.4rem;
    }
    .ec-photo-actions { display: flex; align-items: center; gap: 8px; }
    .ec-photo-btn {
      display: flex; align-items: center; gap: 6px; padding: 8px 14px; border-radius: 8px;
      background: var(--ec-ink); color: #fff; font-size: 0.82rem; font-weight: 600; cursor: pointer;
    }
    .ec-photo-btn:hover { opacity: 0.9; }
    .ec-photo-remove {
      display: flex; align-items: center; justify-content: center; width: 34px; height: 34px;
      border-radius: 8px; border: 1px solid var(--ec-line); background: transparent; color: var(--ec-coral); cursor: pointer;
    }
    .ec-photo-remove:hover { background: #FBEAEA; }
    .ec-photo-hint { font-size: 0.72rem; color: var(--ec-ink-soft); margin: 0; }
  `]
})
export class CardFormComponent implements OnInit {
  cardForm: FormGroup;
  isEdit = false;
  cardId?: string;
  submitting = false;
  uploadingPhoto = false;
  errorMsg = '';
  photoPreview: string | null = null;
  agents: Agent[] = [];
  canChooseAgent = ['ADMIN', 'SUPER_ADMIN', 'MANAGER'].includes(currentRole() || '');

  constructor(
    private fb: FormBuilder,
    private cardService: CardService,
    private route: ActivatedRoute,
    private router: Router,
    private messageService: MessageService,
    private location: Location,
    private adminApi: AdminApiService
  ) {
    this.cardForm = this.fb.group({
      fullName: ['', Validators.required],
      jobTitle: [''],
      ministry: [''],
      direction: [''],
      service: [''],
      email: ['', Validators.email],
      phoneMobile: [''],
      phoneWork: [''],
      whatsapp: [''],
      website: [''],
      address: [''],
      linkedin: [''],
      facebook: [''],
      instagram: [''],
      tiktok: [''],
      gpsLat: [null],
      gpsLng: [null],
      photo: [''],
      agentId: ['']
    });
    if (this.canChooseAgent) {
      this.adminApi.agents({ limit: 200 }).subscribe(r => (this.agents = r.items.filter(a => a.isActive)));
    }
  }

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id');
    if (id) {
      this.isEdit = true;
      this.cardId = id;
      this.cardService.getCard(id).subscribe({
        next: (card: BusinessCard) => {
          this.cardForm.patchValue({ ...card, agentId: card.agentId || '' });
          this.photoPreview = card.photo || null;
        },
        error: () => this.messageService.add({severity: 'error', summary: 'Erreur', detail: 'Carte introuvable'})
      });
    }
  }

  onPhotoSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    const maxSizeBytes = 5 * 1024 * 1024;
    if (file.size > maxSizeBytes) {
      this.messageService.add({ severity: 'error', summary: 'Fichier trop lourd', detail: 'La photo doit faire moins de 5 Mo.' });
      input.value = '';
      return;
    }
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
      this.messageService.add({ severity: 'error', summary: 'Format non supporté', detail: 'Utilisez un JPG, PNG ou WebP.' });
      input.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = () => { this.photoPreview = reader.result as string; };
    reader.readAsDataURL(file);

    this.uploadingPhoto = true;
    this.cardService.uploadPhoto(file).subscribe({
      next: (result) => {
        this.cardForm.patchValue({ photo: result.url });
        this.photoPreview = result.url;
        this.uploadingPhoto = false;
      },
      error: () => {
        this.messageService.add({ severity: 'error', summary: 'Erreur', detail: 'Échec de l\'envoi de la photo' });
        this.uploadingPhoto = false;
        input.value = '';
      }
    });
  }

  removePhoto(): void {
    this.cardForm.patchValue({ photo: '' });
    this.photoPreview = null;
  }

  onSubmit(): void {
    if (this.cardForm.invalid) return;
    this.submitting = true;
    this.errorMsg = '';

    const data = { ...this.cardForm.value };
    // Seuls les gestionnaires peuvent désigner le titulaire ; pour les autres le champ n'est pas envoyé
    if (!this.canChooseAgent) delete data.agentId;

    const request$ = this.isEdit && this.cardId
      ? this.cardService.updateCard(this.cardId, data)
      : this.cardService.createCard(data);

    request$.subscribe({
      next: () => {
        this.messageService.add({
          severity: 'success',
          summary: this.isEdit ? 'Mis à jour' : 'Créée',
          detail: 'Carte enregistrée'
        });
        this.router.navigate(['/cards']);
      },
      error: (err: any) => {
        this.submitting = false;
        this.errorMsg = err.error?.message || 'Échec de l\'enregistrement';
        this.messageService.add({severity: 'error', summary: 'Erreur', detail: this.errorMsg});
      }
    });
  }

  cancel(): void {
    this.location.back();
  }
}
