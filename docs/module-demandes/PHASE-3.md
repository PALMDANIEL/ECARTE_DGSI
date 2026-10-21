# Phase 3 — Droits de congé, soldes, plafonds et règles de calcul

Branche : `feature/module-demandes-administratives` · Phases précédentes : [PHASE-1](PHASE-1.md), [PHASE-2](PHASE-2.md) · Conception : [CONCEPTION.md](CONCEPTION.md)

## Ce qui est livré

| Domaine | Contenu |
|---|---|
| Registre des droits | Table `leave_ledger` en **écriture seule** : un déclencheur PostgreSQL interdit `UPDATE` et `DELETE` (testé, même en SQL direct). Une correction = une **écriture de régularisation** datée, motivée et journalisée. Idempotence garantie par index uniques (un droit acquis par agent/type/année, une consommation par demande/type/année). |
| Droit annuel | Calcul automatique : **30 jours** après **11 mois de services accomplis** (loi 081-2015/CNT, art. 53), date d'ouverture du droit affichée, période de référence paramétrable, report paramétrable (0 par défaut), prorata **désactivé par défaut**. Le droit acquis est inscrit **une fois** avec un instantané des règles. |
| Décision de congé | Les jours ouverts viennent du droit réel de l'agent (plus d'une valeur fixe) ; demande refusée si le droit n'est pas ouvert, avec la date d'ouverture. |
| Jouissance | Décompte selon les règles (calendaire consécutif par défaut), éligibilité exigée au **début** du congé, **fractionnement** (art. 56) : 2 tranches maximum, 15 jours par tranche si le congé est fractionné, ou congé entier ; consommation inscrite au registre **à l'approbation**. |
| Absences | Plafond annuel **par type** (10 jours pour les événements familiaux, art. 58 ; aucun plafond pour l'activité syndicale et les missions, art. 57), réservations des demandes en cours incluses, ventilation sur les années civiles, heures → jours, jours ouvrés / calendaires, jours fériés. |
| Paramétrage | Paramètres **typés** (nombre, booléen, choix, texte), groupés, versionnés, avec **référence réglementaire** ; **surcharge par régime** (`leave.annual_days@CONTRACTUEL`). |
| Administration | Écrans *Droits et soldes* (vue d'ensemble, historique, régularisation, annulation de décision, contrôles, import d'ajustements CSV), *Jours fériés* (saisie + import CSV), *Règles* enrichi. |
| Agent | Solde sur l'accueil du portail ; **aperçu en direct** pendant la saisie (durée décomptée, droit ouvert, plafond restant) sans rien enregistrer. |

## Règles : ce qui est confirmé, ce qui est paramétré

| Règle | Statut |
|---|---|
| 30 jours consécutifs pour 11 mois de services, congé obligatoire, pas d'indemnité compensatrice (art. 53, 55) | **Confirmé** (texte lu) — valeurs par défaut |
| Fractionnement : « pas plus de deux tranches de quinze jours chacune » (art. 56) | **Confirmé** ; l'interprétation (2 tranches max ; 15 j max par tranche sauf congé entier) est **paramétrable** (`leave.max_fractions`, `leave.fraction_max_days`) — à valider avec votre DRH |
| Absences pour événements familiaux : 10 jours/an, non déduits du congé (art. 58) | **Confirmé** — plafond du type, modifiable |
| Absences syndicales / missions (art. 57) | **Confirmé** : hors plafond |
| Moment d'appréciation des 11 mois (fin d'année de référence ou date de la demande) | **Non tranché par le texte** : `leave.eligibility_basis` (défaut : fin de période) + contrôle systématique au début du congé |
| Report des jours non pris | **Non retrouvé** dans les textes lus : `leave.carry_over_max_days` = 0 |
| Jours ouvrables ou calendaires, jours fériés | « Consécutifs » (art. 53) → calendaires par défaut ; fériés exclus **désactivé** ; **aucune liste de jours fériés fournie** (à saisir selon les textes) |
| Heures → jours | Le formulaire officiel emploie « 24 heures » pour une journée → **24 h = 1 jour par défaut** (mettre 8 si vos journées de travail comptent 8 h) |
| Régimes contractuel et enseignant | **Non configurés** : aucun droit calculé tant que `leave.annual_days@RÉGIME` n'est pas défini (art. 54 : enseignants à part) |

## Non-rétroactivité

Modifier un paramètre n'altère **ni** un droit déjà inscrit **ni** une décision déjà rendue : le registre est figé et chaque écriture conserve l'instantané des règles. Seuls les calculs à venir changent. Pour corriger le passé : **régularisation** (écriture compensatoire, motif obligatoire, journalisée).

## API (nouveautés)

| Chemin | Rôle |
|---|---|
| `GET /leave/agents/:id/overview?year=`, `GET /leave/agents/:id/ledger` | admin |
| `POST /leave/regularisations`, `POST /leave/adjustments/import`, `GET /leave/adjustments/template` | admin |
| `POST /leave/decisions/:id/cancel` | admin (impossible si des jouissances y sont liées) |
| `GET /leave/controls` | admin : dates de service manquantes, régimes non paramétrés, soldes négatifs |
| `GET/POST/DELETE /holidays`, `POST /holidays/import` | lecture : tous ; écriture : admin |
| `GET/PUT/DELETE /settings/rules[/:key]` | format enrichi `{ rules, overrides, regimes }` ; `DELETE` retire une surcharge de régime |
| `GET /access/balance`, `POST /access/requests/preview` | session agent |

## Mise en route

```bash
cd backend
npx prisma migrate deploy     # migration 20261022100000_droits_et_soldes (registre, jours fériés, déclencheur)
npm run dev
```

À faire par l'administration : renseigner la **date d'entrée en service** de chaque agent (sans elle, aucun droit n'est calculé — voir « Contrôles »), saisir les **jours fériés** si le décompte doit les exclure, et **reprendre les soldes** existants par l'import d'ajustements.

## Tests

`npm test` : calendrier (mois, éligibilité, jours ouvrés, fériés, années à cheval), droits (éligibilité, prorata, régimes, report), fractionnement, plafonds, heures, immuabilité du registre (y compris en SQL direct), idempotence, régularisations, imports, jours fériés, contrôles, vue agent, aperçu.

## Limites connues

- Les **notifications**, les **escalades de délais** et les **statistiques** : phase 4.
- Les demandes **déjà approuvées avant** cette phase n'ont pas d'écriture de consommation : utiliser l'import d'ajustements.
- L'annulation d'une jouissance **approuvée** n'a pas de bouton dédié : on la corrige par une régularisation positive.
- Le décompte des jours (calendaire/ouvré, fériés) est **figé à la saisie** de la demande ; modifier les règles ensuite ne recompte pas les demandes en cours.
