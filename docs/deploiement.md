# Procédure de déploiement

**Rien n'a été déployé.** Aucun hébergement n'est choisi ; un déploiement pilote exige d'abord les validations de [prerequis-pilote.md](prerequis-pilote.md) (notamment le lieu d'hébergement de données de santé).

## Environnements

| `APP_ENV` | Usage | Remise à zéro démo | Cookies `Secure` |
|---|---|---|---|
| `local` | poste de développement | oui (CLI) | facultatif |
| `test` | tests automatisés | oui | facultatif |
| `demo` | démonstration publique, **données fictives seulement** | oui (CLI) | recommandé |
| `pilot` | pilote réel | **refusée** | **obligatoire** (démarrage refusé sinon) |
| `production` | exploitation | **refusée** | **obligatoire** |

## Étapes

1. Serveur Linux avec Node.js ≥ 22, PostgreSQL 16 managé ou dédié, stockage S3 compatible **privé**, HTTPS (proxy inverse ou plateforme), sauvegardes (voir [sauvegarde-restauration.md](sauvegarde-restauration.md)).
2. Variables d'environnement (modèle : `.env.example`) dans le gestionnaire de secrets de l'hébergeur : `APP_ENV`, `DATABASE_URL`, `APP_SECRET` (`openssl rand -hex 32`), `COOKIE_SECURE=true`, `STORAGE_DRIVER=s3` et identifiants, `WEB_DIST_DIR=apps/web/dist`, connecteurs laissés sur `simulator` tant qu'aucun fournisseur n'est validé.
3. Installation et compilation :
   ```bash
   npm ci
   npm run build
   npm run db:migrate          # prisma migrate deploy : migrations versionnées, non destructives
   ```
4. Lancer **deux processus** supervisés (systemd, conteneur, ou équivalent) : l'API (`npm run start -w apps/api`, qui sert aussi l'interface) et le worker (`npm run worker`).
5. Créer le premier administrateur (aucun compte par défaut en pilote) : `npm run admin:create -w apps/api -- <identifiant> "<Nom>"` (mot de passe provisoire affiché une fois), puis activer sa double vérification (TOTP) à la première connexion ; créer ensuite équipes, structures et comptes.
6. Vérifications : `GET /api/health`, en-têtes de sécurité, connexion de chaque rôle, absence de `/api/docs` en production.

## Règles

- L'intégration continue ne déploie **jamais** automatiquement en production.
- Toute migration est revue avant application ; aucune migration destructive sur une base contenant des données sans sauvegarde vérifiée et autorisation explicite.
- Derrière un proxy, `trustProxy` est activé en `pilot` et `production` pour que la limitation par adresse utilise la véritable IP cliente.
