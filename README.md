# ECARTE

Cartes professionnelles à QR code sécurisé et **demandes administratives** des agents publics : décision de congé, jouissance de congé, autorisation d'absence — avec circuits de validation paramétrables, documents PDF officiels, droits et soldes (loi 081-2015/CNT), notifications, escalades de délais et pilotage. Les cartes de visite numériques d'origine restent disponibles.

## Démarrage rapide

```bash
cd backend && npm install && cp .env.example .env   # compléter .env
npx prisma migrate deploy && npm run seed && npm run dev
cd ../frontend && npm install && npx ng serve
```

Base PostgreSQL locale : créer `ecarte` (pgAdmin ou `createdb ecarte`) et renseigner `DATABASE_URL`, par ex. `postgresql://postgres:postgres@localhost:5433/ecarte?schema=public`. Le seed crée un compte SUPER_ADMIN (`SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD`). Démarrer avec Docker : `docker-compose up -d`.

## Documentation

- [Guide d'utilisation](docs/GUIDE-UTILISATION.md) — administrateur, responsable, agent
- [Installation, exploitation et sécurité](docs/EXPLOITATION.md) — variables, migrations, sauvegarde, mise en production, base de démonstration
- Module « Demandes administratives » : [conception](docs/module-demandes/CONCEPTION.md) · phases [1](docs/module-demandes/PHASE-1.md) (organisation, agents, cartes, audit) · [2](docs/module-demandes/PHASE-2.md) (circuits, demandes, PDF) · [3](docs/module-demandes/PHASE-3.md) (droits et soldes) · [4](docs/module-demandes/PHASE-4.md) (notifications, escalades, pilotage) · [5](docs/module-demandes/PHASE-5.md) (bout en bout, non-régression, traçabilité)

## Tests

```bash
cd backend && npx jest --forceExit   # base de test créée et migrée automatiquement
cd frontend && npx ng build
```
