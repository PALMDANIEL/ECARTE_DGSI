# Phase 1 — Fondations : organisation, agents, cartes sécurisées, audit

Branche : `feature/module-demandes-administratives`
Conception d'ensemble : [CONCEPTION.md](CONCEPTION.md)

## Ce qui est livré

| Domaine | Contenu |
|---|---|
| Organisation | Arbre d'unités (SG › DG › Direction › Service › Unité) rattaché à la société (= ministère / administration). CRUD, contrôle des cycles et des rangs, **import CSV** (vérification à blanc puis écriture tout ou rien). |
| Postes et délégations | Postes (Ministre, Secrétaire Général, Chef du service RH…), titulaires **historisés**, délégations de signature datées. |
| Agents | Profil administratif 1-1 sur `User` (matricule unique par société, grade, corps, dates d'intégration / d'entrée en service, régime, unité, supérieur direct). CRUD, recherche, filtre par unité (sous-arbre inclus), **import CSV**, PIN personnel. |
| Cartes professionnelles | Numéro `CP-AAAA-NNNNNN` continu, validité paramétrable, cycle de vie (émettre, suspendre, réactiver, révoquer, renouveler, remplacer), historique, un seul titre valide par agent. |
| QR et accès | QR = lien opaque (`/q/<jeton>`), **aucune donnée personnelle**. Scan → identification (nom masqué) → **PIN** → session agent courte. |
| Audit | Journal à chaîne d'empreintes SHA-256, vérification d'intégrité, filtres. |
| Paramètres | Valeurs versionnées (jamais réécrites), référence réglementaire, journalisées. |

Tout est **paramétrable depuis l'interface** (menu *Administration*) : aucune donnée d'organisation ou d'agent n'est codée en dur. Les modèles CSV se téléchargent depuis les écrans d'import.

## Modèle de données

Nouvelles tables (migration additive, aucune donnée existante modifiée ni supprimée) :
`org_units`, `positions`, `position_holders`, `delegations`, `agent_profiles`, `card_credentials`, `card_events`, `rule_parameters`, `audit_logs`, plus colonnes nullables sur `business_cards` (`agentId`, `cardNumber`, `status`, `issuedAt`, `expiresAt`, `replacedById`) et `companies.city`, et la séquence `card_number_seq`.

Migrations : `20261021140000_module_demandes_phase1`, `20261021141000_audit_company`.

## API

Toutes les routes sont sous `/api`. Les routes d'administration exigent un rôle `ADMIN` ou `SUPER_ADMIN` et sont cloisonnées par société.

| Méthode et chemin | Rôle |
|---|---|
| `GET/POST /org-units`, `PUT/DELETE /org-units/:id`, `POST /org-units/import`, `GET /org-units/import/template` | lecture : tous ; écriture : admin |
| `GET/POST /positions`, `PUT/DELETE /positions/:id`, `GET/POST /positions/:id/holders`, `POST /positions/:id/holders/end` | idem |
| `GET/POST /delegations`, `DELETE /delegations/:id` | admin |
| `GET/POST /agents`, `GET/PUT /agents/:id`, `GET /agents/:id/cards`, `POST /agents/:id/pin/reset`, `PUT /agents/:id/active`, `POST /agents/import`, `GET /agents/import/template` | admin |
| `POST /cards/:id/issue|renew|reactivate|suspend|revoke|replace`, `GET /cards/:id/lifecycle|history|access-qr` | admin |
| `GET /access/:token`, `POST /access/:token/pin`, `GET /access/me` | **public** (scan) / session agent |
| `GET /audit`, `GET /audit/verify` | admin |
| `GET /settings/rules`, `PUT /settings/rules/:key` | admin |

Les imports prennent `{ csv, dryRun }` ; `dryRun` vaut **`true` par défaut** (sécurité : rien n'est écrit sans demande explicite).

## Sécurité mise en œuvre

- **Jeton QR** : 128 bits aléatoires ; stocké **haché** (recherche) et **chiffré AES-256-GCM** (ré-impression du même QR) ; jamais en clair en base ni dans le journal.
- **Réponse uniforme** : jeton inconnu, révoqué, expiré, carte suspendue ou agent désactivé renvoient la même réponse (aucune information pour un fraudeur). Les jetons inconnus ne sont pas journalisés (évite de saturer le journal) ; les tentatives sur une carte connue mais inutilisable le sont.
- **PIN** : haché (bcrypt), 6 chiffres par défaut, verrouillage après 5 échecs pendant 15 min (paramétrables), affiché **une seule fois** à la génération.
- **Session agent** : JWT signé avec un secret **distinct** de celui des administrateurs ; refusé par toute l'API d'administration et réciproquement ; durée 20 min (paramétrable) ; conservée en mémoire côté navigateur.
- **Limitation de débit** dédiée : 60 scans / 10 min et 20 PIN / 10 min par IP (en plus du limiteur global).
- **Le scan ne donne rien** : sans PIN, seuls un nom masqué (« Awa K. ») et l'unité sont renvoyés.
- **Carte de visite publique** : les champs administratifs (numéro, statut, titulaire, validité) ne sont jamais exposés.
- **Cloisonnement** : une société ne voit ni ne modifie les données d'une autre (testé).
- **Audit** : toute action sensible est journalisée avec l'acteur, l'avant/après, l'IP ; le PIN et le jeton n'y figurent jamais (testé).

## Paramètres initiaux

| Clé | Défaut | Rôle |
|---|---|---|
| `card.validity_years` | 5 | Validité d'une carte |
| `access.pin_length` | 6 | Longueur du PIN |
| `access.pin_max_attempts` | 5 | Échecs avant verrouillage |
| `access.pin_lock_minutes` | 15 | Durée du verrouillage |
| `access.session_minutes` | 20 | Durée de la session agent |

Les droits de congé et plafonds d'absence (30 j, 10 j, etc.) arrivent avec la phase 3.

## Mise en route

```bash
cd backend
npx prisma migrate deploy        # applique les migrations
# .env : ajouter CARD_TOKEN_KEY (clé de chiffrement des jetons) et ACCESS_BASE_URL
openssl rand -hex 32             # pour générer CARD_TOKEN_KEY
npm run dev
```

> **Production** : définir `CARD_TOKEN_KEY` et ne plus le modifier (il chiffre les jetons des QR imprimés). Sans lui, la clé est dérivée de `JWT_SECRET`.

Premiers pas dans l'interface : *Administration › Organisation* (importer l'organigramme) → *Agents* (importer la liste, générer les PIN) → *Mes cartes › bouton « carte professionnelle »* (émettre, afficher le QR d'accès).

## Tests

```bash
cd backend && npm test
```

75 tests (unitaires + intégration, base PostgreSQL dédiée `<base>_test`, créée et migrée automatiquement). Ils couvrent notamment : scan valide / révoqué / expiré / inconnu / suspendu, PIN (verrouillage, déverrouillage, règle administrable), jeton agent refusé par l'API admin, cloisonnement entre sociétés, intégrité et altération du journal d'audit, imports CSV (tout ou rien, erreurs par ligne, idempotence), paramètres versionnés, cycle de vie complet de la carte.

> Les tests sont sensibles à la charge de la machine (délais d'attente) : ne lancez **jamais deux exécutions Jest en parallèle** (elles partagent la base de test).

## Décisions retenues (recommandations validées par défaut)

D1 circuits des formulaires (phase 2) · D2 QR administratif opaque, carte de visite publique conservée séparément · D3 PIN personnel · D8 organigramme, agents, postes et délégations **100 % paramétrables** (interface + CSV) · D9 tout agent = un `User` avec profil (compte de connexion facultatif : mot de passe aléatoire inutilisable et email technique `@agents.invalid` tant qu'aucun email n'est saisi) · D10 livraison par phases, un commit par phase.
À trancher avant les phases 2-3 : D4 (signature), D5 (régimes), D6 (moteur PDF), D7 (heures par jour, jours fériés).

## Limites connues

- Les **démarches** (congé, jouissance, absence) ne sont **pas encore disponibles** : le portail agent l'indique explicitement. Elles font l'objet des phases 2 et 3.
- Le PIN est remis par l'administration (affichage unique) ; aucun envoi SMS/email automatique.
- La session agent n'est pas encore renouvelable sans nouveau scan.
