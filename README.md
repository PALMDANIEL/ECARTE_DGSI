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
