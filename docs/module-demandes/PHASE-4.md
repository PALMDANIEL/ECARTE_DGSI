# Phase 4 — Notifications, escalades de retard, pilotage statistique

Branche : `feature/module-demandes-administratives` · Phases précédentes : [PHASE-1](PHASE-1.md), [PHASE-2](PHASE-2.md), [PHASE-3](PHASE-3.md) · Conception : [CONCEPTION.md](CONCEPTION.md)

## Ce qui est livré

| Domaine | Contenu |
|---|---|
| Notifications | Service central (`NotifyService`) : toujours enregistrées dans l'application, avec **type** (`REQUEST_ASSIGNED`, `REQUEST_UPDATE`, `REQUEST_OVERDUE`, `REQUEST_ESCALATED`), **lien** vers la demande et lecture / « tout lire ». Un **email** s'ajoute si le paramètre `notify.email_enabled` est actif (désactivé par défaut) et seulement pour les adresses réelles ; un échec d'envoi ne bloque jamais une opération. |
| Interface | Entrée de menu **Notifications** avec pastille de non-lues (mise à jour toutes les 60 s), page de liste, clic = ouverture de la demande. Les agents (session QR + PIN) ont leur propre liste via `/access/notifications`. |
| Rappels | Quand l'échéance d'une étape est dépassée, le responsable (ou son délégataire) reçoit **un seul rappel** (`escalation.reminder_enabled`). |
| Escalades | Après `escalation.escalate_after_days` jours de retard (défaut 1), si l'étape a un **poste d'escalade**, ses titulaires et délégataires sont prévenus **une seule fois**, l'agent est informé, l'événement est **journalisé** (chaîne d'audit). Si `escalation.substitute_can_act` est actif (défaut), le poste d'escalade voit alors la demande dans sa boîte et **peut traiter l'étape** ; l'acteur réel reste tracé. |
| Planification | Balayage automatique toutes les 15 min au démarrage du serveur (`ESCALATION_SWEEP_MINUTES`, `0` = désactivé), idempotent (marquage conditionnel en base : deux balayages simultanés n'envoient rien en double). Déclenchement manuel et liste des retards pour les administrateurs. |
| Circuits | Chaque étape ayant un délai peut désigner un **poste d'escalade** (écran *Circuits*) ; il est copié dans les étapes de chaque demande au dépôt. |
| Pilotage | Nouvel écran **Pilotage** (menu) : demandes déposées / en cours / approuvées / rejetées / à corriger / annulées, par démarche, unité (sous-arbre inclus) et mois, **délais moyens** globaux, par démarche et **par autorité**, étapes traitées en retard, retards du jour, escalades, jours d'absence et de jouissance approuvés, **cartes** (actives, suspendues, révoquées, expirées, à renouveler sous 30 j), **soldes par agent** (acquis, autorisés, consommés, régularisations, solde). Filtres : période, démarche, statut, unité, agent, poste (API). **Export CSV** (BOM UTF-8, séparateur `;`, formules neutralisées). |

## Droits d'accès aux statistiques

| Profil | Voit |
|---|---|
| Administrateur | Toute sa société : demandes, cartes, soldes, retards |
| Responsable (titulaire / délégataire / acteur d'un circuit) | **Uniquement** les demandes dans lesquelles il est impliqué ; ni cartes, ni soldes |
| Agent via QR + PIN | Aucune statistique (ses propres demandes et notifications seulement) |

Aucune donnée d'une autre société n'est jamais renvoyée (testé).

## Paramètres ajoutés (groupe « Notifications et délais »)

| Clé | Défaut | Rôle |
|---|---|---|
| `notify.email_enabled` | non | Envoyer aussi par email (nécessite la configuration SMTP du serveur) |
| `escalation.reminder_enabled` | oui | Rappel au responsable en retard |
| `escalation.escalate_after_days` | 1 | Jours de retard avant l'escalade |
| `escalation.substitute_can_act` | oui | Le poste d'escalade peut traiter l'étape escaladée |

## API (nouveautés)

| Chemin | Rôle |
|---|---|
| `GET /notifications`, `GET /notifications/unread-count`, `POST /notifications/:id/read`, `POST /notifications/read-all` | tout utilisateur connecté (ses notifications uniquement) |
| `GET /access/notifications`, `POST /access/notifications/read-all`, `POST /access/notifications/:id/read` | session agent |
| `GET /escalations/overdue`, `POST /escalations/run` | admin |
| `GET /stats/overview`, `GET /stats/requests`, `GET /stats/requests.csv` | connecté (périmètre selon le profil) |
| `GET /stats/balances`, `GET /stats/balances.csv` | admin |

Filtres communs : `from`, `to` (AAAA-MM-JJ), `typeCode`, `status`, `orgUnitId`, `agentId`, `positionId`. Au-delà de 20 000 résultats, l'API demande de restreindre le filtre.

## Mise en route

```bash
cd backend
npx prisma migrate deploy      # 20261023100000_notifications_escalades
npm run dev                    # le balayage des délais démarre avec le serveur
```

Pour activer l'escalade : *Circuits* → éditer un circuit → renseigner un **délai** puis un **poste d'escalade** sur les étapes concernées → publier une nouvelle version (les demandes déjà déposées gardent l'ancienne). L'envoi d'emails suppose un SMTP réel dans `.env`.

## Tests

`npm test` (phase 4 : `tests/phase4.spec.ts`, 18 tests) : notifications (cloisonnement, lecture, session agent, email activé / désactivé / en échec), rappel unique, grâce, escalade unique, journalisation, substitution autorisée / interdite / avant escalade, copie du poste d'escalade, statistiques (comptages, filtres, périodes inversées, sous-arbre d'unité, cloisonnement par profil et par société, soldes, CSV).

Suite complète : **214 tests, tous verts**. Les tests utilisent désormais un serveur HTTP unique par fichier (au lieu d'un serveur éphémère par requête), ce qui supprime les erreurs réseau aléatoires observées sur machine chargée.

## Limites connues

- Le frontend appelle l'API à l'adresse fixée dans `frontend/src/environments/environment.ts` (`10.1.1.140:3004`) : si l'adresse IP de la machine change, la connexion échoue depuis le navigateur.

- Les rappels ne se déclenchent que si le serveur tourne (balayage toutes les 15 min) ; pas de file d'attente externe.
- L'**email** utilise la configuration SMTP existante ; aucun SMS. Pas de préférences par utilisateur.
- Les délais se comptent en **jours calendaires** (pas de prise en compte des jours fériés).
- Les circuits générés d'après les formulaires n'ont **pas** de poste d'escalade par défaut (c'est un choix d'organisation).
- Les statistiques sont calculées à la demande (pas de pré-agrégation) : adapté à plusieurs milliers de demandes.
