import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { CardService } from '../../services/card.service';
import { MessageService } from 'primeng/api';
import { Location } from '@angular/common';

@Component({
  selector: 'app-card-create-edit',
  standalone: false,
  template: `
    <div class="ec-page">
      <h1 class="ec-display">{{ isEdit ? 'Modifier' : 'Creer' }} une carte</h1>

      <form [formGroup]="cardForm" (ngSubmit)="onSubmit()">
        <div class="ec-form-grid">
          <div class="p-field">
            <label>Nom complet *</label>
            <input pInputText formControlName="fullName" placeholder="Jean Dupont" />
          </div>
          <div class="p-field">
            <label>Fonction</label>
            <input pInputText formControlName="jobTitle" placeholder="Directeur commercial" />
          </div>
          <div class="p-field">
            <label>Email</label>
            <input pInputText formControlName="email" placeholder="jean@entreprise.com" type="email" />
          </div>
          <div class="p-field">
            <label>Telephone mobile</label>
            <input pInputText formControlName="phoneMobile" placeholder="+33 6 12 34 56 78" />
          </div>
          <div class="p-field">
            <label>Telephone fixe</label>
            <input pInputText formControlName="phoneWork" placeholder="+33 1 23 45 67 89" />
          </div>
          <div class="p-field">
            <label>WhatsApp</label>
            <input pInputText formControlName="whatsapp" placeholder="+33 6 12 34 56 78" />
          </div>
          <div class="p-field">
            <label>Site web</label>
            <input pInputText formControlName="website" placeholder="https://monentreprise.fr" />
          </div>
          <div class="p-field">
            <label>Adresse</label>
            <input pInputText formControlName="address" placeholder="12 rue de la Paix, Paris" />
          </div>
          <div class="p-field">
            <label>LinkedIn</label>
            <input pInputText formControlName="linkedin" placeholder="https://linkedin.com/in/jean" />
          </div>
          <div class="p-field">
            <label>Facebook</label>
            <input pInputText formControlName="facebook" placeholder="https://facebook.com/jean" />
          </div>
          <div class="p-field">
            <label>Instagram</label>
            <input pInputText formControlName="instagram" placeholder="https://instagram.com/jean" />
          </div>
          <div class="p-field">
            <label>Photo (URL)</label>
            <input pInputText formControlName="photo" placeholder="https://example.com/photo.jpg" />
          </div>
        </div>

        <div class="ec-form-actions">
          <button type="button" pButton label="Annuler" class="p-button-text" (click)="cancel()"></button>
          <button type="submit" pButton [label]="isEdit ? 'Mettre a jour' : 'Creer'" [disabled]="cardForm.invalid" icon="pi pi-save"></button>
        </div>
      </form>

      <p-messages></p-messages>
    </div>
  `,
  styles: [`
    .ec-page { padding: 24px; max-width: 800px; margin: 0 auto; }
    .ec-form-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 16px 24px;
      background: var(--ec-paper-raised);
      padding: 24px;
      border-radius: 14px;
      border: 1px solid var(--ec-line);
      margin: 20px 0;
    }
    .p-field {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .p-field label {
      font-weight: 600;
      font-size: 0.85rem;
      color: var(--ec-ink-soft);
    }
    .ec-form-actions {
      display: flex;
      gap: 12px;
      justify-content: flex-end;
    }
    @media (max-width: 600px) {
      .ec-form-grid { grid-template-columns: 1fr; }
    }
  `]
})
export class CardCreateEditComponent implements OnInit {
  cardForm: FormGroup;
  isEdit = false;
  cardId?: string;

  constructor(
    private fb: FormBuilder,
    private cardService: CardService,
    private route: ActivatedRoute,
    private router: Router,
    private messageService: MessageService,
    private location: Location
  ) {
    this.cardForm = this.fb.group({
      fullName: ['', Validators.required],
      jobTitle: [''],
      email: ['', Validators.email],
      phoneMobile: [''],
      phoneWork: [''],
      whatsapp: [''],
      website: [''],
      address: [''],
      linkedin: [''],
      facebook: [''],
      instagram: [''],
      photo: ['']
    });
  }

  ngOnInit() {
    const id = this.route.snapshot.paramMap.get('id');
    if (id) {
      this.isEdit = true;
      this.cardId = id;
      this.cardService.getById(id).subscribe({
        next: (card) => this.cardForm.patchValue(card),
        error: () => this.messageService.add({ severity: 'error', summary: 'Erreur', detail: 'Carte introuvable' })
      });
    }
  }

  onSubmit() {
    if (this.cardForm.invalid) return;
    const data = this.cardForm.value;
    if (this.isEdit && this.cardId) {
      this.cardService.update(this.cardId, data).subscribe({
        next: () => {
          this.messageService.add({ severity: 'success', summary: 'Mis a jour', detail: 'Carte modifiee' });
          this.router.navigate(['/cards']);
        },
        error: () => this.messageService.add({ severity: 'error', summary: 'Erreur', detail: 'Echec de la mise a jour' })
      });
    } else {
      this.cardService.create(data).subscribe({
        next: () => {
          this.messageService.add({ severity: 'success', summary: 'Creee', detail: 'Carte creee avec succes' });
          this.router.navigate(['/cards']);
        },
        error: () => this.messageService.add({ severity: 'error', summary: 'Erreur', detail: 'Echec de la creation' })
      });
    }
  }

  cancel() { this.location.back(); }
}
