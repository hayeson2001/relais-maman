# Guide de l'administration ADEC

## Accès

Connexion de l'équipe, puis **double vérification obligatoire** (application TOTP : Google Authenticator, Aegis, FreeOTP…). Premier accès : « Activer la double vérification », saisir la clé dans l'application, confirmer avec un code. Un même code ne peut pas être utilisé deux fois. Démonstration seulement : `npm run demo:totp -w apps/api` affiche le code du compte de démo.

## Onglets

- **Indicateurs** : demandes reçues, en cours, clôturées ; délais de première réponse humaine et d'action convenue (médiane, moyenne, nombre mesuré, nombre sans valeur) ; soins déclarés et soins vérifiés **séparément** ; clôtures sans soin et motifs ; obstacles ; charge par agent ; échecs de notification. Chaque taux affiche son numérateur, son dénominateur, sa période et sa définition. **Ces indicateurs décrivent le fonctionnement du service ; ils ne prouvent aucun impact sur la santé.**
- **Comptes** : personnel, périmètre (équipe ou structure), habilitation à confirmer, état, double vérification.
- **Langues et audios** : disponibilité de l'interface par langue, état de validation, contenus audio et leurs manques (mina : rien de validé).
- **Connecteurs et envois** : simulé, non implémenté (avec la raison), derniers envois, tentatives, erreurs.
- **Export pseudonymisé (CSV)** : sans nom, texte, téléphone ni audio ; identifiant remplacé par une empreinte ; 5 000 lignes au maximum ; tracé dans le journal d'audit.

## Opérations par l'API (interface à compléter)

| Opération | Route |
|---|---|
| Créer un compte (agent, référent, administrateur) | `POST /api/admin/accounts` — mot de passe provisoire affiché une seule fois |
| Désactiver un compte (sessions coupées) | `POST /api/admin/accounts/:id/disable` |
| Débloquer un compte du personnel | `POST /api/admin/accounts/:id/unlock` (les mamans : récupération supervisée par un agent) |
| Créer une structure (marquée fictive tant qu'aucun partenariat) | `POST /api/admin/facilities` |
| Demandes de suppression de profil | `GET /api/admin/deletion-requests` |

Limites v0.2 : pas encore de formulaires d'administration pour créer comptes, équipes, zones ni pour éditer le registre des langues et des audios ; pas de changement de mot de passe obligatoire au premier accès du personnel.
