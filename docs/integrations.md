# Téléphonie et intégrations

## État

| Connecteur | Implémenté | Statut |
|---|---|---|
| SMS | simulateur | aucun envoi réel |
| Appels / serveur vocal (IVR) | simulateur | aucun appel réel |
| Transcription | aucun | désactivé (`TRANSCRIPTION_PROVIDER=none`) |
| Structures de santé | aucun | pas de partenaire |

**Aucun fournisseur n'est retenu**, donc aucun adaptateur réel n'a été écrit : je n'invente ni endpoint ni réponse de succès. L'absence d'identifiants ou d'adaptateur bloque le canal concerné (statut `FAILED`, erreur `CONNECTOR_UNAVAILABLE` visible des administrateurs), **jamais le reste de l'application**.

## Fonctionnement commun

1. Un événement métier écrit ses notifications dans l'**outbox** (`Notification`), dans la même transaction.
2. Le **worker** (`npm run worker`, toutes les 30 s) réserve atomiquement les envois en attente, respecte la **plage horaire** choisie par la femme (sinon report de 15 min), le **canal** (préférences) et l'**accord de rappel** (aucun appel sans accord), puis appelle le connecteur.
3. **Reprise limitée** : erreurs temporaires réessayées après 1, puis 5 minutes, 3 tentatives au maximum ; erreurs définitives aussitôt en échec. Coût enregistré si le fournisseur le communique.
4. Les **accusés** arrivent par webhook : signature HMAC-SHA256 sur le corps brut, fenêtre de 5 minutes, **anti-rejeu** par identifiant d'événement, idempotence.
5. Les textes sont **neutres** : « Relais Maman : une réponse vous attend. Ouvrez l'application. »

## Simulateur

`apps/api/src/connectors/index.ts`. Statut `SENT_SIMULATED`, identifiant déterministe. Erreurs reproductibles selon le numéro **fictif** : se terminant par `0000` → numéro invalide (définitif) ; par `9999` → délai dépassé (temporaire). Les numéros de démonstration utilisent l'indicatif `+999`, non attribué par l'UIT : aucun abonné réel ne peut être visé.

## Écrire un adaptateur réel (à faire quand un fournisseur sera retenu)

1. Choisir le fournisseur (opérateur togolais ou agrégateur), vérifier sa couverture à Lomé, ses tarifs, l'enregistrement d'un nom d'expéditeur, les règles de consentement et d'horaires.
2. Implémenter `MessagingConnector.send()` **d'après sa documentation officielle**, y compris son propre schéma de signature des webhooks (le protocole `x-rm-*` ne vaut que pour le simulateur).
3. Identifiants **uniquement** en variables d'environnement ; activation explicite.
4. Aucun SMS ni appel réel pendant les tests sans autorisation écrite ; prévoir un numéro de test du fournisseur.

## Ce qu'une PWA ne couvre pas

Une application web exige un smartphone avec navigateur et des données mobiles. Pour les femmes qui n'ont qu'un téléphone simple, ou pas de forfait de données, il faudra :

- un **serveur vocal (IVR)** avec menus enregistrés en mina et en français (contenus validés), un numéro court ou gratuit négocié avec les opérateurs, et la gestion des appels manqués et des rappels ;
- éventuellement de l'**USSD** (accord opérateur, coûts de session, menus très courts) ;
- le **rappel par un agent**, déjà prévu via « Autre besoin / Je souhaite être rappelée ».

Ces canaux exigent des accords opérateurs, des enregistrements validés par des locutrices et un budget de communication : ils ne sont pas commencés.
