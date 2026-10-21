# Module « Demandes administratives » — Audit et conception

Branche : `feature/module-demandes-administratives`
Statut : **étapes 1 à 3 terminées, en attente de validation (étape 4). Aucun code applicatif n'a été modifié.**

---

## 1. Audit de l'application existante

### 1.1 Technologies (versions réellement installées)

| Couche | Technologie |
|---|---|
| Backend | Node 20, Express 4.22, TypeScript 5.9, Prisma 5.22, PostgreSQL |
| Auth | JWT (accès 15 min, refresh 7 j), bcrypt, verrouillage après 5 échecs |
| PDF | Puppeteer 24 (HTML → PDF), déjà utilisé pour la carte de visite |
| Frontend | Angular 20.3 en **NgModules**, PrimeNG 17, NgRx 18, Chart.js |
| Tests | Jest 29 / ts-jest / supertest installés, **aucun test écrit** |

### 1.2 Modèle de données actuel

`Company` · `Team` · `User` · `BusinessCard` · `Scan` · `Notification`. Rôles : `SUPER_ADMIN, ADMIN, MANAGER, EMPLOYEE`.

### 1.3 Constats qui conditionnent la conception

| # | Constat | Conséquence |
|---|---|---|
| A1 | `BusinessCard.ministry / direction / service` sont des **textes libres** copiés sur la carte. Il n'existe aucun organigramme. | Il faut un vrai arbre organisationnel et un rattachement de l'agent. |
| A2 | `User` n'a ni **matricule**, ni grade, ni dates d'intégration / d'entrée en service, ni civilité, ni supérieur hiérarchique. | Ajout d'un profil agent (relation 1-1, sans dupliquer l'identité). |
| A3 | `BusinessCard.userId` = l'utilisateur **qui crée** la carte, pas forcément l'agent titulaire. `fullName` est recopié en texte libre. | Une carte doit être liée à l'agent titulaire ; `fullName` ne doit plus servir d'identité. |
| A4 | L'identifiant du QR actuel est le `slug`, dérivé du nom (`awa-kone`) : **devinable**. Le QR du PDF/dialogue encode la vCard complète (nom, téléphone, email). | Contraire à l'exigence « le QR ne contient aucune donnée personnelle ». Il faut un jeton opaque révocable. |
| A5 | Une carte n'a que `isActive` / `isArchived` : ni numéro, ni révocation, ni expiration, ni renouvellement, ni historique. | Cycle de vie complet de la carte à modéliser. |
| A6 | `/uploads` est servi en **statique public**. | Les pièces justificatives et PDF administratifs ne doivent **pas** y être stockés. |
| A7 | Le modèle `Notification` et son service existent mais ne sont utilisés nulle part. L'envoi d'email pointe sur un SMTP factice. | Réutilisables ; le canal email reste à configurer. |
| A8 | `Scan` enregistre déjà chaque ouverture de carte (IP, appareil). | Réutilisable comme journal des scans du QR. |
| A9 | Autorisation = rôle global + cloisonnement par société (corrigé lors de la phase 1). Pas de notion d'autorité par poste ni de délégation. | Moteur d'habilitation par poste, avec délégations. |
| A10 | Pas de journal d'audit. | À créer. |

**Réutilisable tel quel :** authentification JWT, hiérarchie `Company` (= ministère / administration), `Notification`, `Scan`, génération PDF Puppeteer, upload multer, cloisonnement par société, `AppError` / gestionnaire d'erreurs.

---

## 2. Analyse des trois formulaires

Source : les `.docx` fournis, lus intégralement (texte, tableaux, mise en forme). Aucune image ni en-tête/pied de page séparé : tout est dans le corps du document.

### 2.1 Mise en page à conserver

| Formulaire | Format | Police | Particularité |
|---|---|---|---|
| Décision de congé | A4, marges 2,5 cm | Arial 14 pt | Bloc émetteur à gauche, « BURKINA FASO / La Patrie ou la Mort, Nous Vaincrons » à droite, destinataire « s/c voie hiérarchique », **4 cadres d'avis + 1 cadre de décision**, « E-timbre N° » |
| Jouissance de congé | A4, marges 2,5 cm | Arial 14 pt | Même en-tête ; **2 cadres** : avis du chef du service RH, décision du chef de service |
| Autorisation d'absence | A4, marges 2,5 cm | Book Antiqua / Bookman / Bell MT / Trebuchet | **En-tête administratif complet** (Ministère · Secrétariat Général · Direction Générale), formule de politesse différente, **2 cadres** |

Police : seules Arial et Trebuchet sont présentes sur cette machine ; Book Antiqua, Bookman et Bell MT ne le sont pas (voir décision D6).

### 2.2 Variables identifiées et correspondance avec la base

Légende : ✅ déjà en base · 🟡 dérivable · ❌ donnée manquante · ✍️ saisie par l'agent · ⚙️ constante du modèle

**Commun aux trois formulaires**

| Variable | Exemple | Source |
|---|---|---|
| Nom et prénoms | PALM ROMEO DARATAGNAN | ✅ `User.firstName/lastName` (la casse officielle est à normaliser) |
| Matricule | 386239D | ❌ `AgentProfile.matricule` (unique) |
| Emploi / grade | Ingénieur de Travaux en Informatique | ❌ `AgentProfile.grade` (la `User.jobTitle` existe mais n'est pas le grade) |
| Structure d'affectation | Direction Générale des Systèmes d'Information | ❌ → `OrgUnit` via `AgentProfile.orgUnitId` |
| Lieu | Ouagadougou | ❌ `Company.city` (ou paramètre) |
| Date de la demande | 05/06/2026 | 🟡 date de dépôt |
| Destinataire (titre, civilité) | Monsieur le Ministre / Monsieur le Chef de Service… | ❌ `Position` (poste) + civilité du titulaire |
| Cadres d'avis / de décision | Avis du DRH… | 🟡 étapes du circuit configuré |

**Décision de congé**

| Variable | Exemple | Source |
|---|---|---|
| Année de référence | 2026 | ✍️ (valeur par défaut : année en cours) |
| Destinations | Afrique, USA, Union européenne | ✍️ liste de zones à choisir |
| Décision précédente jointe | N°2025-14-01049/MEF/SG/DRH du 30/04/2025 | 🟡 `LeaveDecision` antérieure ; ❌ import à prévoir pour les décisions d'avant l'application |
| E-timbre N° | 1790 8872 0082 | ✍️ ❌ `Request.eStampNumber` (+ contrôle de format) |
| Avis : Directeur de l'Ingénierie logicielle et de l'Exploitation → DG des SI → DRH du ministère → Secrétaire Général ; décision : Ministre | | 🟡 circuit |

**Jouissance de congé**

| Variable | Exemple | Source |
|---|---|---|
| Durée | « un mois » | 🟡 calculée |
| Année au titre de laquelle | 2025 | 🟡 déduite de la décision |
| Période | lundi 20 avril 2026 au mardi 19 mai 2026 inclus | ✍️ deux dates ; jours de la semaine générés |
| Pays de jouissance | Burkina Faso et Côte d'Ivoire | ✍️ |
| Référence de la décision | N°2025-14-01049/MEF/SG/DRH du 30/04/2025 | 🟡 `LeaveDecision` liée (obligatoire) |
| Avis : chef du service RH ; décision : chef du service (Développement des Applications) | | 🟡 circuit |

**Autorisation d'absence**

| Variable | Exemple | Source |
|---|---|---|
| En-tête : Ministère / Secrétariat Général / Direction Générale | | 🟡 chaîne de `OrgUnit` |
| Agent + matricule + affectation | « Mle 406307 P, Agent de DLE/SDA » | ❌ profil agent + code des unités |
| Durée | vingt-quatre (24) heures | ✍️ en **heures** (unité à paramétrer) |
| Date de l'absence | jeudi 16 juillet 2026 | ✍️ |
| Motif | « raisons de famille » | ✍️ liste de motifs liés à un type d'autorisation |
| Avis : chef du service RH ; décision : chef du service | | 🟡 circuit |

**Observations sur les originaux** (à corriger dans les modèles, à valider avec vous) :
« l'obtention d'une d'un mois » (jouissance) ; « Ingénieur de Travaux **en** Informatique » dans un formulaire et « de Travaux Informatique » dans l'autre ; « Camarde KABORE », « VAInCRONS », « Chef de Services des Ressources Humaines ».

### 2.3 Constat majeur : les circuits réels ne sont pas ceux du cahier des charges

| Démarche | Circuit **réel** déduit du formulaire | Circuit décrit dans le cahier des charges |
|---|---|---|
| Décision de congé | Agent → avis Directeur de l'Ingénierie logicielle et de l'Exploitation → avis DG des SI → avis DRH du ministère → avis Secrétaire Général → **décision du Ministre** | Supérieur(s) → chef du service RH → Ministre |
| Jouissance de congé | Agent → avis chef du service RH → **décision du chef de service** (pas du Ministre) | « circuit configuré » |
| Autorisation d'absence | Agent → avis chef du service RH → **décision du chef de service** | Responsables compétents |

Les trois circuits sont **initialisés tels qu'ils figurent sur les formulaires** (ils sont plus fiables que le circuit générique) ; tout reste modifiable depuis l'administration (décision D1).

---

## 3. Analyse réglementaire (Burkina Faso)

Source principale : **Loi n° 081-2015/CNT du 24 novembre 2015 portant statut général de la fonction publique d'État**. Le texte a été **lu directement** dans la copie PDF publiée par l'ASCE-LC ([lien](https://www.asce-lc.bf/wp-content/uploads/2023/11/LOI-n%C2%B0081-2015-portant-statut-de-la-fonction-publique.pdf)). Les numéros d'articles ci-dessous sont ceux de ce texte. Une vérification sur le Journal officiel reste souhaitable avant mise en production.

### 3.1 Règles confirmées

| Réf. | Règle | Impact sur le module |
|---|---|---|
| Art. 53 | Congé annuel de **30 jours consécutifs** avec traitement, pour **onze mois de services accomplis**. Aucune indemnité compensatrice. Non remis en cause par une sanction. | Droit = 30 j ; éligibilité à 11 mois de service ; pas de monétisation. « Consécutifs » = jours **calendaires** (cohérent avec l'exemple du 20 avril au 19 mai = 30 jours). |
| Art. 54 | Régime du **personnel enseignant** fixé à part. | Régime configurable. |
| Art. 55 | Congé **obligatoire** ; libre choix de la localité et du pays, mais l'administration peut remettre en cause un pays étranger (motifs notifiés). **La décision est prise par le ministre ou le président d'institution.** | Confirme la décision du Ministre. Prévoir une étape/mention sur le pays de destination. |
| Art. 56 | L'administration échelonne la jouissance selon les nécessités de service ; **fractionnement en 2 tranches de 15 jours maximum** ; modalités par voie réglementaire. | Contrôle des tranches ; paramètre du nombre max de tranches. |
| Art. 57 | Autorisations d'absence **sans déduction du congé** : représentants syndicaux ; missions ou manifestations d'intérêt national. Accordées par le ministre (sous délégations de signature). | Type distinct, **non soumis** au plafond de 10 j. |
| Art. 58 | Autorisations d'absence **pour événements familiaux** : **10 jours maximum par an**, non déduits du congé annuel. | Le plafond de 10 jours concerne **ce seul type**. |
| Art. 59 | Les autorisations de l'art. 58 sont accordées **sur demande de l'agent par le supérieur hiérarchique immédiat**. | Confirme la décision au niveau du chef de service pour l'absence familiale. |
| Art. 60 | Absence non justifiée : retenue sur rémunération au prorata ; modalités par voie réglementaire. | Hors périmètre (paie), mais à signaler dans les alertes. |
| Art. 62-65 | Maternité : 14 semaines (8 sem. avant au plus tôt, 4 au plus tard), décision du ministre ; repos d'allaitement 1 h 30/jour pendant 15 mois. | Types de congés paramétrables (phase ultérieure). |
| Art. 66 | Congé pour concours/examens : décision du supérieur immédiat jusqu'à 10 jours, au-delà ministre ; déductible du congé annuel à partir du 11ᵉ jour. | Exemple de **règle conditionnelle selon la durée**. |
| Art. 73 | Dossier individuel obligatoire : pièces **enregistrées, numérotées, classées sans discontinuité**. | Numérotation unique et archivage continu des documents. |
| Art. 74 | Le fonctionnaire est doté d'une **carte professionnelle** ; caractéristiques et utilisation fixées par voie réglementaire. | Cadre légal du module Cartes. |
| Art. 75 | Les actes de situation administrative sont **notifiés** à l'agent. | Notification obligatoire de la décision. |
| Art. 105-106 | Congé annuel et autorisation d'absence = position d'activité, comptent pour l'avancement. | Aucune interruption de carrière à gérer. |
| Art. 107-108 | Congé de maladie : certificat médical ; ≤ 10 j par le supérieur immédiat, > 10 j et < 3 mois par le ministre. | Types ultérieurs. |

### 3.2 Divergences entre le cahier des charges et les textes

| # | Cahier des charges | Texte vérifié | Proposition |
|---|---|---|---|
| R1 | 10 j d'absence par an pour **toutes** les absences | Plafond de 10 j seulement pour les **événements familiaux** (art. 58) ; les absences syndicales / de mission (art. 57) sont hors plafond | Plafond rattaché au **type** d'autorisation, pas global |
| R2 | « Proratisation mensuelle » du droit | Droit à 30 j **pour 11 mois de services**, sans proratisation mensuelle prévue | **Aucune proratisation par défaut** ; mécanisme présent mais désactivé |
| R3 | Absences « horaires » (formulaire en **24 heures**) | Les textes parlent en **jours** ; aucune règle sur les heures | Unité heure/jour paramétrable (`heures par jour` = à fixer par vous) |
| R4 | Circuit à 3 niveaux hiérarchiques + RH + Ministre | Le Ministre décide (art. 55), mais le circuit d'avis est un usage interne du ministère | Circuit des formulaires conservé, modifiable |
| R5 | Décompte « jours ouvrables ou ouvrés » | Congé annuel en jours **consécutifs** | Défaut = jours calendaires ; jours fériés exclusion désactivable |

### 3.3 Textes à confirmer (non retrouvés / non lus intégralement)

| Sujet | Point |
|---|---|
| Décret fixant les **modalités de jouissance du congé administratif** | Un compte rendu du Conseil des ministres du 1ᵉʳ décembre 2021 ([lien](https://burkina24.com/2021/12/01/compte-rendu-du-conseil-des-ministres-du-1er-decembre-2021/)) mentionne un décret pris en application de l'art. 56 al. 2. **Numéro et contenu non lus** : à fournir ou à vérifier. |
| Textes d'application sur les **autorisations d'absence** (art. 58-60) | Non retrouvés. |
| Décret sur la **carte professionnelle** (art. 74) | Non retrouvé. |
| **Délégations de signature** du ministère (qui signe quoi) | À fournir par votre DRH. |
| Régime des **contractuels** (Code du travail) | Non analysé ; régime configurable prévu. |
| **Données personnelles** | La loi n° 001-2021/AN du 30 mars 2021 (CIL) existe et impose des formalités préalables ([texte](https://assembleenationale.bf/storage/Loi/kDsWHXOTUCQFVESChh8BlBdiZnCrdTsOpXe1rzmH.pdf)) ; **articles non analysés**. Formalité CIL à prévoir avant production. |
| **Valeur juridique de la signature électronique / du document électronique** | Non vérifiée. |

---

## 4. Architecture proposée

### 4.1 Principes

1. **Additif** : uniquement de nouvelles tables et des colonnes nullables → aucune donnée existante n'est touchée.
2. **Un seul moteur de circuits** pour les trois démarches (et les futures).
3. **Règles et circuits en base**, versionnés ; une demande en cours reste attachée à la version de circuit/règles de son dépôt (pas de réécriture rétroactive).
4. **Registres immuables** : droits et soldes calculés à partir d'écritures (acquis, consommé, régularisation), jamais écrasés.
5. Le **scan n'autorise rien** : il identifie. Tout dépôt exige un second facteur ; toute validation exige un compte authentifié habilité.

### 4.2 Modèle de données (nouvelles entités)

```
ORGANISATION
  OrgUnit            id, companyId→Company, parentId→OrgUnit, type(SG|DG|DIRECTION|SERVICE|UNITE), code, nom, actif
  Position           id, orgUnitId, code(CHEF_SERVICE_RH, MINISTRE, …), libellé, civilité, niveauHiérarchique
  PositionHolder     positionId, userId, du, au            (titulaire d'un poste, historisé)
  Delegation         positionId, délégataireUserId, du, au, périmètre(types de demande), motif

AGENT  (profil 1-1 sur User, aucune duplication d'identité)
  AgentProfile       userId (unique), matricule (unique par société), civilité, grade, corps,
                     dateIntégration, dateEntréeService, régime(FONCTIONNAIRE|CONTRACTUEL|…),
                     orgUnitId, supérieurDirectId→User, pinHash, pinÉchecs, pinVerrouilléJusqu'à

CARTES
  BusinessCard       (existant) + agentId→User (titulaire) , numeroCarte (unique), statut(ACTIVE|SUSPENDUE|REVOQUEE|EXPIREE|REMPLACEE),
                     dateÉmission, dateExpiration, remplacéeParId
  CardCredential     cardId, tokenHash (sha256, unique), tokenPrefix, créé, révoqué, motifRévocation   (le QR = URL + jeton opaque aléatoire 128 bits)
  CardEvent          cardId, type(ÉMISE|RENOUVELÉE|RÉVOQUÉE|…), auteur, date, motif

DEMANDES
  RequestType        code(DECISION_CONGE|JOUISSANCE_CONGE|AUTORISATION_ABSENCE), nom, templateId, schémaChamps(JSON), exigeDécisionPréalable, actif
  FormTemplate       id, type, version, htmlTemplate, css, variables(JSON), actif
  Request            id, référence (unique, ex. DC-2026-000123), typeId, agentId, statut, étapeCourante,
                     workflowVersionId, rulesetVersionId, données(JSON — instantané figé), eStampNumber, leaveDecisionId?, déposéLe, clôturéLe
  RequestStep        requestId, ordre, kind(AVIS|VISA|DECISION|TRAITEMENT), positionId, acteurUserId, actionPourLe,
                     résultat(AVIS_FAVORABLE|AVIS_DÉFAVORABLE|APPROUVÉ|REJETÉ|RETOURNÉ|…), commentaire, décidéLe, échéance, escaladéLe
  RequestDocument    requestId, version, fichier(privé), sha256, généréPar, généréLe, remplacéeParVersion
  Attachment         requestId, nom, mime, taille, sha256, fichier(privé)

CIRCUITS (administrables)
  WorkflowDefinition id, requestTypeId, companyId, orgUnitId? (portée), version, validDu, validAu, actif
  WorkflowStep       definitionId, ordre, kind, résolution{POSITION|NIVEAU_HIÉRARCHIQUE|SUPÉRIEUR_DIRECT},
                     positionId?, niveau?, obligatoire, conditionJSON?, délaiJours, escalade{vers, après}, actionsAutorisées[], notifications[]

DROITS & RÈGLES
  LeaveType          code(CONGE_ANNUEL|ABS_EVENEMENT_FAMILIAL|ABS_SYNDICALE|ABS_MISSION|…), unité(JOUR|HEURE), déduitDuCongé, plafondAnnuel?, régimes[], référenceLégale
  RuleParameter      clé, valeur(JSON), validDu, validAu, référenceLégale, modifiéPar     (versionné)
  LeaveLedger        agentId, leaveTypeId, année, nature(ACQUIS|CONSOMMÉ|RÉGULARISATION|REPORT), quantité, requestId?, créé
  LeaveDecision      id, numéro (unique), agentId, année, du, au, jours, statut(VALIDE|ANNULÉE|CONSOMMÉE|EXPIRÉE), requestId, fractions
  Holiday            date, libellé, companyId?

TRAÇABILITÉ
  AuditLog           id, acteur, action, entité, entitéId, avant(JSON), après(JSON), ip, userAgent, date, hashPrécédent  (chaîné)
  Notification       (existant) + canal(IN_APP|EMAIL|SMS), lien, luLe, requestId?
```

### 4.3 États d'une demande

```
BROUILLON → SOUMISE → EN_COURS (étape n) ─┬→ APPROUVÉE (décision finale) → [LeaveDecision créée si DECISION_CONGE] → CLOS
                                           ├→ REJETÉE
                                           ├→ RETOURNÉE_POUR_CORRECTION → (agent corrige) → SOUMISE (même référence, nouvelle version de document)
                                           └→ ANNULÉE (par l'agent avant décision)
```

Garde-fous : une demande non approuvée n'est jamais une décision ; une **jouissance** exige une `LeaveDecision` `VALIDE`, de la même année, couvrant la période et sans dépassement des jours ni du nombre de tranches ; une **absence** est contrôlée contre le plafond de son type ; chevauchements refusés.

### 4.4 Parcours QR et sécurité

1. QR imprimé = `https://<hôte>/q/<jeton>` ; **aucune donnée personnelle dans le QR**. Jeton aléatoire 128 bits, stocké **haché**, révocable, renouvelé à chaque réémission.
2. `/q/<jeton>` : vérifie carte `ACTIVE`, non expirée, non révoquée, agent actif → affiche **uniquement** nom masqué et photo ; réponse identique (générique) pour un jeton inconnu, révoqué ou expiré ; limitation de débit par IP et par jeton ; scan journalisé.
3. **Second facteur obligatoire** pour toute démarche : PIN personnel (6 chiffres, haché, verrouillage progressif). Succès → jeton de session « agent » court (≈ 20 min) limité aux démarches de cet agent.
4. Les validateurs utilisent le **compte authentifié** habituel ; le droit de traiter une étape est vérifié par `Position` + `Delegation`, jamais par le scan.
5. PDF et pièces : stockage **hors dossier public**, servis par une route qui contrôle le droit d'accès ; empreinte SHA-256 par version.
6. Journal d'audit chaîné pour toute action sensible (cartes, circuits, règles, décisions, consultations de dossiers).

### 4.5 API (nouveaux modules Express, même convention que l'existant)

| Module | Routes principales |
|---|---|
| `org` | CRUD `/org-units`, `/positions`, `/delegations` |
| `agents` | `/agents`, `/agents/:id/profile`, import CSV |
| `cards` (extension) | `POST /cards/:id/issue|revoke|renew|replace`, `GET /cards/:id/history` |
| `access` (public) | `GET /q/:token`, `POST /q/:token/pin` |
| `requests` | `POST /requests`, `GET /requests`, `GET /requests/:id`, `POST /requests/:id/submit|cancel|resubmit`, `POST /requests/:id/steps/:n/act`, `GET /requests/:id/documents/:v` |
| `workflows` | CRUD définitions + étapes, simulation d'un circuit |
| `leave` | `/leave/balance/:agentId`, `/leave/decisions`, `/leave/types`, `/rules` |
| `stats` | `/stats/requests`, `/stats/cards`, `/stats/balances` (filtres dynamiques, périmètre selon le poste) |
| `audit` | `/audit` (lecture réservée) |

### 4.6 Interfaces (Angular, modules chargés à la demande)

- `agent-portal` (public, mobile d'abord) : scan → PIN → accueil des démarches → formulaire pré-rempli → récapitulatif → PDF → suivi.
- `inbox` : demandes à traiter (avis / décision / retour / rejet avec commentaire).
- `admin-config` : organigramme, postes, délégations, types, règles, circuits, modèles.
- Extensions de `cards`, `dashboard` et `statistics`.

### 4.7 Plan de livraison et de tests (par phases, chacune testée avant la suivante)

| Phase | Contenu | Tests |
|---|---|---|
| 1 | Organisation, profil agent, cartes sécurisées (jeton opaque, cycle de vie), audit, paramètres | unitaires + intégration (scan valide / révoqué / inconnu / expiré / brute force) |
| 2 | Moteur de circuits, demandes, génération PDF des 3 modèles, pièces jointes | intégration des circuits, fidélité PDF |
| 3 | Droits, registres, décisions, règles (plafonds, tranches, chevauchements, jouissance liée à la décision) | unitaires de calcul, cas limites |
| 4 | Notifications, boîte de traitement, statistiques, administration | fonctionnels |
| 5 | Documentation, migrations, jeu de données initial, non-régression de l'existant | tous les scénarios du §12 du cahier des charges |

---

## 5. Décisions à valider avant de coder

| # | Question | Ma recommandation |
|---|---|---|
| **D1** | Circuits initiaux : reprendre ceux des **formulaires** (4 avis + Ministre ; 1 avis + chef de service ; 1 avis + chef de service) ou celui du cahier des charges ? | Ceux des formulaires |
| **D2** | Le QR imprimé sur la carte : devient un **lien opaque** (plus de vCard dedans). Faut-il conserver une carte de visite publique distincte (lien/QR séparé) ? | Opaque pour l'administratif ; carte de visite publique en option, séparée |
| **D3** | Second facteur de l'agent après scan | PIN personnel (pas d'SMS disponible) |
| **D4** | Signature : mention électronique (nom, titre, date, empreinte) ou signature manuscrite numérisée / papier ? Valeur légale non vérifiée | Mention électronique + espace pour signature manuscrite sur le PDF imprimé |
| **D5** | Régime couvert au départ | Fonctionnaires (loi 081-2015) ; contractuels et enseignants en régimes configurables, non activés |
| **D6** | Moteur PDF : HTML → PDF (Puppeteer, déjà en place, polices de substitution pour Book Antiqua / Bell MT) ou remplissage direct du `.docx` + conversion LibreOffice (fidélité maximale, nouvelle dépendance) | HTML → PDF ; polices à installer si vous les avez |
| **D7** | Heures par jour pour convertir une absence de 24 h (R3) et le traitement des jours fériés | À fixer par vous (je mets 8 h et « calendaires » par défaut, modifiables) |
| **D8** | Données de départ : organigramme, liste des agents (matricule, grade, dates), titulaires des postes, délégations de signature | À fournir (CSV) ou saisie manuelle par l'administration |
| **D9** | Qui est un « agent » : tous les `User` de l'application, ou certains agents sans compte ? | Tous les agents = un `User` (profil agent 1-1) ; compte de connexion facultatif |
| **D10** | Livraison : les 5 phases sur cette branche, avec un commit par phase | Oui |
