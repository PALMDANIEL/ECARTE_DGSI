# Phase 5 — Tests de bout en bout, non-régression, documentation finale

Branche : `feature/module-demandes-administratives` · Phases : [1](PHASE-1.md) · [2](PHASE-2.md) · [3](PHASE-3.md) · [4](PHASE-4.md) · Conception : [CONCEPTION.md](CONCEPTION.md)
Guides : [Utilisation](../GUIDE-UTILISATION.md) · [Installation et exploitation](../EXPLOITATION.md)

## Ce qui a été fait

| Domaine | Contenu |
|---|---|
| Bout en bout (API) | `tests/e2e.spec.ts` : une administration **s'inscrit**, importe organigramme et agents en CSV (vérification à blanc puis écriture), génère les circuits, pourvoit les postes, ouvre les comptes des responsables (**vraie connexion par mot de passe**), émet une carte ; le **QR imprimé est décodé** comme par un téléphone (il ne contient qu'un lien opaque) ; l'agent saisit un mauvais puis le bon PIN, consulte dossier et solde, mène **décision → jouissance → absence avec retour pour correction**, reçoit ses notifications, télécharge ses PDF ; contrôle du plafond d'absence, pilotage, export CSV, audit intègre, **révocation** qui coupe aussitôt la session. Second parcours : cloisonnement entre deux administrations et entre jetons agent / administration. |
| Non-régression | `tests/legacy.spec.ts` (15 tests) : fonctions d'origine jusque-là non testées — inscription, connexion, verrouillage, rafraîchissement, changement et réinitialisation du mot de passe, utilisateurs (cloisonnement, escalade de rôle, profil), sociétés, équipes, cartes de visite (CRUD, vCard, QR, page publique, comptage des scans, désactivation), générateur QR, envoi de photo, tableau de bord. |
| Migrations | Les 7 migrations appliquées sur une base **vierge** donnent exactement le schéma Prisma (`prisma migrate diff` : aucune différence) ; la base de développement est à jour. |
| Démonstration | `scripts/demo-seed.ts` : jeu complet créé **par l'API** sur une base dédiée ; parcours vérifié dans le navigateur (pilotage, notifications, portail agent, escalade traitée par le poste d'escalade). |
| Documentation | Guide d'utilisation (administrateur, responsable, agent), guide d'exploitation (installation, variables, sauvegarde, liste de contrôle de production, sécurité), `.env.example` complété. |

## Défauts trouvés et corrigés pendant cette phase

| Gravité | Défaut | Correction |
|---|---|---|
| **Critique** | L'inscription publique rattachait le nouveau compte, **avec le rôle administrateur**, à une administration existante dès que le nom correspondait : n'importe qui pouvait devenir administrateur d'un ministère. | Refus (409) si l'administration existe ; testé. |
| **Élevée** | Les jetons de session, de vérification et de réinitialisation étaient signés avec le même secret et sans type : un jeton de session permettait de **réinitialiser le mot de passe** sans connaître l'ancien, et un lien de réinitialisation valait session ; ce lien restait réutilisable pendant 1 h. | Jetons typés ; seule une session ouvre l'API ; lien de réinitialisation signé avec un secret propre et lié au mot de passe actuel (**usage unique**) ; changement ou réinitialisation du mot de passe = révocation du jeton de rafraîchissement. Les sessions ouvertes avant la mise à jour sont renouvelées automatiquement par le jeton de rafraîchissement. |
| Moyenne | Démarrage possible en production avec les secrets par défaut. | Le serveur refuse de démarrer si `JWT_SECRET`, `JWT_REFRESH_SECRET` ou `CARD_TOKEN_KEY` manquent. |
| Moyenne | Envoi de photo : seul le type annoncé par le navigateur était contrôlé. | Vérification de la signature réelle (PNG, JPEG, WebP). |
| Moyenne (phase 4) | Pilotage › soldes : consommations comptées deux fois (le registre les inscrit en négatif) → solde de 45 jours au lieu de 15 ; jours d'absence négatifs. | Même convention que le calcul des droits ; test de cohérence ajouté. |
| Moyenne (phase 4) | Pilotage › soldes : les agents n'ayant encore rien consulté apparaissaient avec 0 jour acquis. | Inscription idempotente du droit annuel avant l'affichage. |
| Faible | Les postes générés figeaient « Monsieur » : « Décision de **Monsieur** le Ministre » pour une ministre. | Civilité du titulaire en fonction quand le poste n'en impose pas (« Selon le titulaire ») ; les demandes déjà déposées gardent leur intitulé (non-rétroactivité). |
| Faible (phase 4) | Le portail agent n'affichait pas les notifications (API seule). | Encadré « nouvelles informations » avec « Marquer comme lu ». |
| Environnement | L'interface visait une adresse IP fixe (`10.1.1.140`) devenue invalide. | En développement, l'API est cherchée sur la même machine que la page. |
| Tests | Erreurs réseau aléatoires (« socket hang up », réponses vides) sur machine chargée. | Un serveur HTTP unique par fichier de test. |

## Résultats

- **Backend : 231 tests, 13 fichiers, tous verts** (exécution séquentielle).
- **Frontend : `ng build` sans erreur.**
- Parcours navigateur sur la base de démonstration : connexion administrateur et responsable, Pilotage (indicateurs, graphiques, tableaux, retards, soldes), Notifications (pastille, ouverture de la demande), portail agent (QR + PIN, dossier, solde, notifications, demandes). Le traitement de l'étape escaladée a été vérifié par l'API (le panneau du navigateur était masqué à ce moment-là).

## Traçabilité des exigences du cahier des charges

| Exigence | Réalisation | Preuve (tests) | Statut |
|---|---|---|---|
| Entrée **uniquement par QR** de la carte professionnelle, sans identifiants pour l'agent | lien opaque + PIN + session courte distincte | cards-access, e2e | ✅ |
| Formulaires **pré-remplis** depuis le dossier | instantané agent au dépôt, aperçu en direct | requests-flow, leave-flow, e2e | ✅ |
| **PDF fidèles** aux trois formulaires, versionnés | modèles HTML/CSS administrables, une version par événement, empreinte | requests-flow, pdf-real | ✅ (polices Book Antiqua / Bell MT substituées) |
| **Circuit de validation paramétrable** | circuits versionnés, 4 types d'étapes, 3 modes de résolution, conditions, délégations, retours | requests-flow, requests-units | ✅ |
| Droits : 30 jours / 11 mois, fractionnement, plafond 10 jours, régimes | registre immuable, règles typées versionnées, surcharges par régime | leave-units, leave-flow, e2e | ✅ (points non tranchés par les textes : paramétrés, voir PHASE-3) |
| Législation burkinabè | loi 081-2015/CNT art. 53-66 lue ; références affichées sur chaque règle | — | ✅ partiel : décrets d'application et régimes contractuel / enseignant **non configurés** |
| Notifications, délais, escalades | in-app + email optionnel, rappel et escalade uniques | phase4, e2e | ✅ (pas de SMS) |
| Module **Statistiques / pilotage** | demandes, délais par autorité, retards, cartes, soldes, filtres, CSV, périmètre par profil | phase4, e2e | ✅ |
| **Paramétrage** sans code (organisation, agents, postes, règles, modèles, fériés) | écrans + imports CSV | org, agents, audit-settings, leave-flow | ✅ |
| Sécurité et **audit** | voir EXPLOITATION.md ; journal chaîné vérifiable | cards-access, audit-settings, legacy, e2e | ✅ |
| Non-régression de l'existant | fonctions d'origine couvertes | legacy | ✅ |

## Limites connues (ensemble du module)

- **Juridique** : décrets d'application (modalités de fractionnement, report), régimes contractuel et enseignant, liste officielle des jours fériés — à confirmer par la DRH ; tout est paramétrable.
- **Signature** : mention électronique avec empreinte + espace pour signature manuscrite ; aucune signature électronique qualifiée.
- **Canaux** : notifications dans l'application et email optionnel ; pas de SMS.
- **Intitulés de poste** : l'article et la civilité s'accordent au titulaire, pas le nom du poste (« Directeur » / « Directrice » à saisir).
- **Interface** : aucun test automatisé côté Angular (vérification par compilation stricte et parcours manuels) ; pas de test de charge.
- **Production** : CORS ouvert (`*`) et inscription publique ouverte à décider ; voir la liste de contrôle d'EXPLOITATION.md.
- La vérification d'email à l'inscription envoie un lien, mais aucun écran ne le traite (fonction d'origine inachevée, sans effet sur l'accès).
