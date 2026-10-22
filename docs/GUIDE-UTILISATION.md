# ECARTE — Guide d'utilisation

Trois profils utilisent l'application :

| Profil | Accès | Ce qu'il fait |
|---|---|---|
| **Administrateur** (DRH, service informatique) | identifiant + mot de passe | paramètre l'administration, gère agents, postes, cartes, circuits, règles ; consulte tout |
| **Responsable** (directeur, chef de service, DRH, SG, ministre…) | identifiant + mot de passe | donne ses avis et décisions sur les demandes de son circuit ; suit le pilotage de son périmètre |
| **Agent** | **scan de sa carte + code PIN**, sans mot de passe | consulte son dossier et son solde, dépose et suit ses demandes |

---

## 1. Mise en service d'une administration (administrateur)

Faire les étapes dans cet ordre ; chaque import se **vérifie à blanc** avant d'être écrit (rien n'est enregistré tant que vous ne cliquez pas sur « Importer »).

1. **Organisation** (*Administration › Organisation*) : importer l'organigramme (CSV `code;nom;type;code_parent`, types `SG`, `DG`, `DIRECTION`, `SERVICE`, `UNITE`) ou le saisir.
2. **Agents** (*Administration › Agents*) : importer la liste (le modèle CSV se télécharge depuis l'écran). Renseigner pour chacun la **date d'entrée en service** : sans elle, aucun droit à congé n'est calculé.
3. **Circuits** (*Administration › Circuits*) : bouton **« Générer d'après les formulaires »** — crée les trois circuits tels qu'ils figurent sur les formulaires officiels et les postes manquants (vacants). Pour chaque étape ayant un délai, on peut désigner un **poste d'escalade** (ex. le Secrétaire général).
4. **Postes** (*Administration › Postes*) : **pourvoir chaque poste** (Ministre, Secrétaire général, DRH, chef du service RH, responsables d'unités). Laisser la civilité sur « Selon le titulaire » : les documents écriront « Madame la Ministre » ou « Monsieur le Ministre » selon la personne en fonction. Les **délégations** de signature se déclarent sur le même écran.
5. **Accès des responsables** (*Agents › Accès de connexion*) : créer un identifiant pour chaque responsable qui traite des demandes (mot de passe temporaire affiché une seule fois).
6. **Cartes** (*Mes cartes › carte professionnelle*) : créer la carte de l'agent, l'**émettre**, imprimer le **QR d'accès** ; puis (*Agents › PIN*) générer le **code PIN**, affiché une seule fois, à remettre en main propre.
7. **Règles** (*Administration › Règles*) : vérifier les valeurs (30 jours de congé, 11 mois de service, plafond de 10 jours pour événements familiaux, fractionnement, heures par jour, notifications et délais…). Chaque règle indique sa référence réglementaire ; toute modification est versionnée et **ne réécrit jamais le passé**.
8. **Jours fériés** (*Administration › Jours fériés*) : à saisir si le décompte doit les exclure.
9. **Soldes existants** (*Administration › Droits et soldes › Import d'ajustements*) : reprendre les congés déjà pris avant la mise en service.

### Gestion courante

- **Carte perdue / volée** : *Révoquer* — le QR et la session de l'agent cessent de fonctionner immédiatement. *Remplacer* émet une nouvelle carte.
- **Agent qui quitte** : *Agents › Désactiver*.
- **Erreur de solde** : *Droits et soldes › Régularisation* (motif obligatoire, journalisée). Le registre des droits ne se modifie jamais.
- **Contrôles** : *Droits et soldes › Contrôles* signale les agents sans date de service, les régimes non paramétrés, les soldes négatifs.
- **Audit** : *Journal d'audit* — toute action sensible y figure ; « Vérifier l'intégrité » contrôle que le journal n'a pas été altéré.

---

## 2. Traiter les demandes (responsable)

- Le menu **Notifications** (pastille rouge) annonce les demandes à traiter, les retards et les escalades ; un clic ouvre la demande.
- **Demandes › À traiter** : seules les demandes dont **l'étape active** vous revient (poste, délégation, ou escalade) apparaissent, la plus urgente en premier ; un retard est signalé.
- Ouvrir la demande : données de l'agent, pièces jointes, document PDF à jour, historique du circuit. Actions :
  - **Avis favorable / défavorable** (étapes d'avis) ;
  - **Approuver / Rejeter** (décision finale ; pour une décision de congé, saisir le **numéro de décision**) ;
  - **Retourner pour correction** (l'agent corrige et redépose ; le circuit recommence).
  Un commentaire est obligatoire pour un avis défavorable, un rejet ou un retour.
- **Pilotage** : chiffres et délais des demandes de votre circuit uniquement.

Un responsable ne peut jamais traiter sa propre demande, ni une étape qui n'est pas encore (ou plus) active.

---

## 3. Faire une demande (agent)

1. **Scanner** le QR de sa carte professionnelle avec un téléphone (ou ouvrir le lien). Le scan seul n'affiche qu'un nom abrégé.
2. Saisir son **code PIN**. Après 5 erreurs, l'accès est bloqué 15 minutes.
3. L'écran montre le **dossier** (administration, grade, rattachement, supérieur, carte), le **solde** de congé et des absences, les **informations nouvelles** (avancement des demandes).
4. **Mes démarches** : choisir la démarche, le formulaire est **pré-rempli** ; un aperçu indique en direct la durée décomptée, le droit et le plafond restant.
   - *Décision de congé* : année, destinations, n° de timbre électronique.
   - *Jouissance de congé* : décision concernée, dates (deux tranches au plus), destination.
   - *Autorisation d'absence* : type (événement familial, activité syndicale, mission…), dates ou heures, motif.
5. Joindre les pièces demandées, **déposer**. Le PDF officiel est généré et suit chaque étape ; il est téléchargeable à tout moment.
6. Si la demande est **retournée**, la corriger et la redéposer. Une demande non encore traitée peut être **annulée**.

La session se ferme seule après 20 minutes (paramétrable) ; aucun mot de passe n'est conservé sur le téléphone.
