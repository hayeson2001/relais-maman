# API REST

- Documentation interactive (hors production) : `http://127.0.0.1:3000/api/docs`
- Spécification OpenAPI générée depuis les schémas Zod des routes réelles : [api/openapi.json](api/openapi.json) (53 routes ; régénérer avec `npx tsx scripts/export-openapi.mts`).
- Contrats partagés client/serveur : `packages/core/src/schemas.ts`.

## Conventions

- Authentification par cookie de session `rm_session` (HttpOnly). Toute requête de modification exige l'en-tête `x-csrf-token` (valeur fournie par `GET /api/auth/me`).
- Erreurs : `{ "error": "CODE_STABLE", "message": "explication qui dit comment continuer" }`. 400 validation, 401 session, 403 droit, 404 hors périmètre ou inexistant, 409 conflit de version ou doublon, 422 règle métier, 423 compte verrouillé, 429 trop de demandes.
- Modifications d'un dossier : champ `expectedVersion` obligatoire (verrou optimiste).
- Création de demande : champ `idempotencyKey` (UUID) obligatoire ; un nouvel essai renvoie la demande existante.

## Groupes de routes

| Préfixe | Rôle | Exemples |
|---|---|---|
| `/api/auth` | tous | `staff/login`, `beneficiary/login`, `beneficiary/activate`, `logout`, `me`, `totp/setup`, `totp/enable`, `totp/verify` |
| `/api/public` | sans session | `languages` (langues réellement disponibles), `consent-texts`, `audio-contents` (validés seulement) |
| `/api/me` | bénéficiaire | `overview`, `requests`, `requests/:id`, `slots/:id/respond`, `requests/:id/declare-care`, `requests/:id/messages`, `preferences`, `consents`, `deletion-request`, `audio` |
| `/api/agent` | agent | `requests` (filtres `state`, `assigned`, `category`, `zoneId`, `from`, `to`, `open`), `requests/:id`, `…/transitions/:action`, `…/category`, `…/actions`, `…/slots`, `…/messages`, `…/reassign`, `beneficiaries`, `beneficiaries/:id/recovery`, `appointments`, `audio/:id/transcription`, `context` |
| `/api/facility` | référent | `requests`, `slots/:id/confirm`, `requests/:id/transitions/{VERIFY_CARE,CORRECT_VERIFICATION,REVOKE_VERIFICATION}` |
| `/api/admin` | admin + TOTP | `metrics`, `accounts`, `accounts/:id/disable`, `accounts/:id/unlock`, `referentials`, `facilities`, `languages`, `connectors`, `export/requests.csv`, `deletion-requests` |
| `/api/audio` | selon droits | `:id/access` (lien temporaire signé de 5 min), `stream/:id` |
| `/api/webhooks/:provider` | fournisseur | accusés de livraison signés (simulateur) |
