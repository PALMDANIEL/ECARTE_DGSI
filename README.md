# SmartCard Pro

Plateforme SaaS de cartes de visite numériques.

## Installation

- Backend : `cd backend && npm install`
- Frontend : `cd frontend && npm install`
- Démarrer avec Docker : `docker-compose up -d`

## Base de données (PostgreSQL local)

1. Créer une base `ecarte` (pgAdmin ou `createdb ecarte`).
2. Renseigner `DATABASE_URL` dans `backend/.env`, par ex. `postgresql://postgres:postgres@localhost:5433/ecarte?schema=public`.
3. Depuis `backend/` :

```bash
npx prisma migrate deploy   # crée les tables
npm run seed                # société ECARTE + compte SUPER_ADMIN (admin@ecarte.local)
```

Le mot de passe du seed se change avec `SEED_ADMIN_PASSWORD` (et l'email avec `SEED_ADMIN_EMAIL`).

## Module « Demandes administratives » (en cours)

Gestion des cartes professionnelles à QR code, des agents et de l'organisation, puis des demandes de congé, décisions, jouissances et autorisations d'absence.
Conception : [docs/module-demandes/CONCEPTION.md](docs/module-demandes/CONCEPTION.md) — Phase 1 (livrée) : [docs/module-demandes/PHASE-1.md](docs/module-demandes/PHASE-1.md) · Phase 2 (livrée) : [docs/module-demandes/PHASE-2.md](docs/module-demandes/PHASE-2.md) · Phase 3 (livrée) : [docs/module-demandes/PHASE-3.md](docs/module-demandes/PHASE-3.md).
