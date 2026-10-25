# Procédure de déploiement

**Rien n'a été déployé.** Aucun hébergement de pilote n'est choisi (une démonstration fictive sur Railway est préparée, voir plus bas) ; un déploiement pilote exige d'abord les validations de [prerequis-pilote.md](prerequis-pilote.md) (notamment le lieu d'hébergement de données de santé).

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

## Démonstration publique (données fictives) : Railway et sous-domaine Cloudflare

Cible provisoire : `relais-maman.couveuse-papricai.org`. Le `Dockerfile` construit une image « démo » : API, interface et worker dans **un seul processus** (`WORKER_INLINE=true`), données fictives créées si la base est vide puis remises à zéro chaque nuit à 3 h, heure de Lomé (`DEMO_AUTO_RESET=true`, refusé en pilote et production). La page d'accueil affiche alors, en anglais et en français, les comptes fictifs à essayer (jamais l'administration).

1. **Railway** : nouveau projet, « Deploy from GitHub repo », `hayeson2001/relais-maman` (le `Dockerfile` est détecté). Ajouter une base **PostgreSQL** au projet.
2. **Variables du service applicatif** (onglet Variables) :
   - `DATABASE_URL` = référence à la base du projet (`${{Postgres.DATABASE_URL}}`, selon le nom du service de base) ;
   - `APP_SECRET` = `openssl rand -hex 32` ;
   - `DEMO_ADMIN_PASSWORD` (12 caractères minimum) et `DEMO_ADMIN_TOTP_SECRET` (base32) : **obligatoires en ligne**, car les secrets admin du dépôt sont publics. Ajouter le secret TOTP à une application d'authentification (saisie manuelle de la clé).
   - Le reste est fourni par le `Dockerfile` (connecteurs sur `simulator`, cookies `Secure`).
3. **Vérification** : Settings, Networking, « Generate Domain » donne une adresse `*.up.railway.app` ; contrôler `/api/health` (`"env":"demo"`), l'accueil et une connexion. Indiquer `/api/health` comme chemin de contrôle de santé (Settings, Deploy).
4. **Plafond de dépense** : dans les réglages d'utilisation du compte Railway, fixer une limite (par exemple 10 USD par mois).
5. **Sous-domaine** : Settings, Networking, « Custom Domain », saisir `relais-maman.couveuse-papricai.org`. Railway affiche un enregistrement **CNAME** et un enregistrement **TXT** ; les deux sont obligatoires. Dans Cloudflare (DNS de `couveuse-papricai.org`), créer les deux tels quels, le CNAME en **« DNS only » (nuage gris)**. Ainsi Railway délivre lui-même le certificat HTTPS et **aucun réglage SSL/TLS global du domaine n'est modifié** (les sites existants, servis par Vercel, ne sont pas touchés). Avec le proxy Cloudflare activé, Railway exige le mode SSL « Full » sur toute la zone.
6. **Retrait** : supprimer le CNAME et le TXT dans Cloudflare, puis le projet Railway.

Limites : l'image n'a pas encore été construite avec Docker sur la machine de développement (démarrage simulé hors conteneur, voir [verifications.md](verifications.md)) ; le stockage audio est local au conteneur et disparaît à chaque déploiement, ce qui convient à une démo fictive mais pas à un pilote.

## Règles

- L'intégration continue ne déploie **jamais** automatiquement en production.
- Toute migration est revue avant application ; aucune migration destructive sur une base contenant des données sans sauvegarde vérifiée et autorisation explicite.
- Derrière un proxy, `trustProxy` est activé en `pilot` et `production` pour que la limitation par adresse utilise la véritable IP cliente.
