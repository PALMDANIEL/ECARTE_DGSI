# Phase 2 — Moteur de circuits, demandes et documents PDF

Branche : `feature/module-demandes-administratives` · Phase précédente : [PHASE-1.md](PHASE-1.md) · Conception : [CONCEPTION.md](CONCEPTION.md)

## Ce qui est livré

| Domaine | Contenu |
|---|---|
| Moteur de circuits | Circuits **versionnés** par type de demande, étapes d'avis / visa / traitement / décision, résolution des approbateurs par **poste**, **responsable de l'unité** de l'agent ou **supérieur hiérarchique**, étapes obligatoires ou conditionnelles, délais, retour pour correction, rejet sur avis défavorable (option). Simulation « qui validerait quoi ». |
| Les 3 démarches | Décision de congé · Jouissance de congé · Autorisation d'absence, avec **validation métier** (voir ci-dessous). |
| Circuits des formulaires | Bouton « Générer d'après les formulaires » : crée les 3 circuits **tels qu'ils figurent sur les documents officiels** et les postes manquants (vacants), sans jamais remplacer un circuit existant. |
| Documents PDF | Un modèle HTML/CSS par démarche reprenant fidèlement les formulaires fournis (A4, marges 2,5 cm, Arial 14 pt / Trebuchet MS, en-têtes, cadres d'avis et de décision). **Une version du PDF à chaque événement**, avec empreinte SHA-256, numéro de référence unique et pied de page « référence — version — page x/y ». |
| Signatures (D4) | Mention électronique (nom, titre, date, **empreinte vérifiable**) + espace réservé à la signature manuscrite sur le document imprimé. |
| Modèles administrables | Écran « Modèles PDF » : variables disponibles, aperçu PDF avec données d'exemple, publication d'une **nouvelle version** (les anciens documents ne changent pas). |
| Pièces justificatives | Types de pièces et caractère obligatoire **paramétrables**, contrôle du contenu réel (signature binaire PDF/JPG/PNG), 5 Mo, stockage **privé**. |
| Portail agent | Après QR + PIN : démarches disponibles, formulaires pré-remplis, récapitulatif, pièces, dépôt, suivi du circuit, téléchargement du PDF, annulation, correction après retour. |
| Responsables | Menu « Demandes » : boîte **À traiter**, recherche multicritère, fiche détaillée avec les actions (avis, décision, retour) et délégations prises en compte. |
| Administration | Écrans *Circuits*, *Types d'absence*, *Modèles PDF* ; création d'un **accès de connexion** pour les agents qui traitent des demandes. |

## Règles métier appliquées

**Décision de congé** — année valide ; destinations ; n° de timbre électronique (8 à 20 chiffres) ; une seule demande en cours par année ; refus si une décision valide existe déjà. À l'approbation, le décideur saisit le **numéro de décision** (unique) et une `LeaveDecision` de 30 jours (`leave.annual_days`, loi 081-2015 art. 53) est créée.
**Jouissance** — exige une décision **valide, de l'agent**, avec des jours restants ; dates cohérentes, pas dans le passé ; durée ≤ jours restants de la décision ; **aucun chevauchement** avec une autre demande ; les jours se consomment dès le dépôt.
**Absence** — type actif ; heures autorisées ou non selon le type ; durée ≤ période ; dates ; motif ; **aucun chevauchement**.
**Circuit** — une demande ne peut être déposée que si **tous les postes obligatoires sont pourvus** ; seule l'**étape active** est traitable (pas de saut, pas de double validation, verrou de ligne) ; l'agent ne peut jamais traiter sa propre demande ; commentaire obligatoire pour avis défavorable, rejet, retour.

## Sécurité et traçabilité

- Jeton agent et jeton d'administration séparés (testé dans les deux sens). Chaque appel de la session agent **revérifie** que la carte est active : une révocation coupe les démarches immédiatement.
- Un responsable ne voit que les demandes de son circuit (poste actuel, délégation, ou action passée) ; les administrateurs voient toute leur société ; **chaque consultation et chaque téléchargement sont journalisés**.
- PDF et pièces **hors du dossier public** (`private-storage/`, ignoré par git), servis uniquement après contrôle d'accès, `Cache-Control: no-store`.
- Les données du demandeur sont **figées au dépôt** (instantané) : modifier l'organisation ensuite ne réécrit pas un document existant.
- Les données saisies sont échappées dans les modèles (pas d'injection de HTML dans les PDF).

## API (nouveautés)

| Chemin | Rôle |
|---|---|
| `GET/PUT /request-types` | admin |
| `GET/POST /workflows/:typeCode`, `POST /workflows/bootstrap`, `POST /workflows/simulate` | admin |
| `GET/POST/PUT /absence-types` | lecture : tous ; écriture : admin |
| `GET /form-templates`, `GET /form-templates/variables`, `PUT /form-templates/:typeCode`, `POST /form-templates/:typeCode/preview` | admin |
| `GET /requests/inbox`, `GET /requests`, `GET /requests/:id`, `GET /requests/:id/document`, `GET /requests/:id/documents/:version`, `GET /requests/:id/attachments/:aid`, `POST /requests/:id/steps/:stepId/act`, `POST /requests/:id/regenerate` | responsables / admin |
| `GET /access/services|decisions|absence-types|requests`, `POST /access/requests`, `GET/PUT /access/requests/:id`, `POST …/submit|cancel`, `GET …/document`, `POST/DELETE/GET …/attachments` | session agent |
| `POST /agents/:id/credentials` | admin |

## Mise en route

```bash
cd backend
npx prisma migrate deploy      # 3 migrations ajoutées (tables des demandes, délai des étapes)
npm install                    # nouvelle dépendance : handlebars
npm run dev
```

Dans l'interface (administrateur) : **Organisation** → **Agents** → **Circuits › Générer d'après les formulaires** → **Postes** (pourvoir chaque poste vacant : Ministre, Secrétaire Général, DRH, chef du service RH, responsables d'unités) → **Agents › Accès de connexion** pour chaque responsable. Puis l'agent scanne sa carte.

Variable d'environnement facultative : `PRIVATE_STORAGE_DIR` (défaut `backend/private-storage`). **À sauvegarder avec la base** : elle contient les PDF et pièces.

## Tests

`npm test` (backend) : unitaires (nombres en toutes lettres, dates, titres, modèles), intégration (circuits, flux complets des 3 démarches, concurrence, délégations, contrôle d'accès, pièces jointes, documents, modèles, audit) et **rendu PDF réel** avec Chrome. Les PDF des tests vont dans un dossier temporaire.

## Écarts et limites connues

- **Calcul des droits** (soldes, plafond de 10 jours d'événements familiaux, ancienneté de 11 mois, tranches de 15 jours, jours fériés) : **phase 3**. En phase 2 seuls sont contrôlés : la décision préalable, les jours restants d'une décision, les chevauchements.
- Les **plafonds des types d'absence** sont affichés mais pas encore appliqués.
- **Notifications** : enregistrées dans l'application (aucun écran ni envoi email/SMS pour l'instant), **escalades et délais dépassés** (champ présent, traitement automatique) : **phase 4**.
- Le décideur saisit à la main le **numéro de décision de congé** ; une numérotation automatique paramétrable pourra être ajoutée.
- L'intitulé d'un poste doit être saisi **au genre de son titulaire** (« Directrice »), le modèle n'accordant pas automatiquement.
- Les typos des formulaires d'origine (« l'obtention d'une d'un mois ») sont corrigées dans les modèles par défaut ; ils restent modifiables.
- Le PDF utilise Arial / Trebuchet MS ; Book Antiqua et Bell MT (utilisées dans l'original de l'absence) ne sont pas installées sur le serveur de développement : une police de substitution est employée.
