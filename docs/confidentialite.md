# Confidentialité, conservation et suppression

> Ce document décrit ce que fait le logiciel. **Il n'établit aucune conformité juridique.** Avant tout pilote avec des données réelles, faire valider par un juriste au Togo : la loi togolaise relative à la protection des données à caractère personnel (loi n° 2019-014, référence à vérifier par le juriste), les obligations auprès de l'autorité de protection des données, les règles sur les données de santé et l'hébergement, ainsi que les textes d'accord et les durées de conservation ci-dessous.

## Données collectées (minimisation)

- **Identité de coordination** : nom affiché (prénom et initiale), activité facultative, zone, équipe.
- **Coordonnées, séparées de l'identité** (`ContactInfo`) : téléphone facultatif, indication « téléphone partagé ». Lisibles par l'équipe affectée seulement.
- **Enfants** : prénom et mois de naissance. Aucun compte enfant.
- **Rendez-vous** saisis par une personne habilitée, sans calendrier médical généré.
- **Demandes** : catégorie, texte court (1 000 caractères), message vocal facultatif, échanges, déclarations et vérifications de soin. **Aucun dossier médical.**

## Accords distincts (`Consent`, historique jamais réécrit, texte versionné)

| Finalité | Nécessaire au service ? | Effet du retrait |
|---|---|---|
| Transmettre ma demande à l'équipe | oui, pour chaque demande | demandes ouvertes **clôturées** (motif `CONSENT_WITHDRAWN`), plus aucune action possible |
| Être rappelée | non | appels en attente **annulés**, canal appel retiré, plus aucun appel mis en file |
| Conserver mon message vocal | seulement pour joindre un audio | enregistrements **supprimés** du stockage |
| Participer à une étude | non, jamais bloquant | aucun effet sur le service |

Les textes d'accord de démonstration sont marqués `reviewed = false` : **relecture juridique et linguistique obligatoire** avant pilote.

## Sécurité

Sessions serveur révocables, cookies HttpOnly/SameSite=Strict (et Secure, imposé hors local), CSRF, argon2id, verrouillages, second facteur administrateur, droits par objet, CSP stricte, en-têtes de sécurité (helmet), limitation des requêtes par session. Journaux techniques **sans** corps de requête, cookie, téléphone, message ni audio (test automatique sur les vrais journaux). Audio privé, accès temporaire signé, type réel vérifié.

## Conservation (proposition à valider)

| Donnée | Durée proposée | Mécanisme actuel |
|---|---|---|
| Tentatives de connexion | 24 h | purge automatique (worker) |
| Sessions expirées | 7 jours après expiration | purge automatique |
| Messages vocaux | jusqu'à la clôture de la demande, puis suppression | suppression **manuelle ou au retrait d'accord** ; purge automatique à la clôture **à implémenter** |
| Demandes clôturées | à définir (ex. 24 mois) | aucune purge automatique |
| Journal d'audit et événements | à définir | conservés |

## Suppression du profil

1. La bénéficiaire demande la suppression (`/b/preferences`) : la demande est enregistrée et visible des agents et administrateurs.
2. **Procédure supervisée à faire valider** : vérification de l'identité par l'agent, effacement de l'identité, des coordonnées, des enfants, des messages et audios ; conservation pseudonymisée et limitée dans le temps des événements nécessaires (traçabilité des vérifications de soin, indicateurs agrégés), avec motif légitime documenté.
3. L'exécution technique de cette procédure (script d'effacement avec trace d'audit) **n'est pas encore implémentée** : seule la demande est enregistrée.

## Accès aux données

Voir [droits.md](droits.md). Les administrateurs ne lisent pas le contenu des demandes ; les exports sont pseudonymisés, limités à 5 000 lignes et tracés dans le journal d'audit.
