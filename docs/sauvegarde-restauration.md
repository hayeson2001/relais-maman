# Sauvegarde et restauration

Procédure **testée le 25/10/2026** sur la base de démonstration locale : export, restauration dans une base neuve, comptages identiques (comptes, demandes, événements, migrations).

## Ce qu'il faut sauvegarder

1. **PostgreSQL** : toute la base, y compris la table `_prisma_migrations`.
2. **Stockage audio** : répertoire `STORAGE_LOCAL_DIR` ou compartiment S3 (`S3_BUCKET`).
3. **Secrets** (hors dépôt, dans un coffre) : `APP_SECRET` (sans lui, les secrets TOTP chiffrés et les empreintes d'export ne sont plus exploitables), `WEBHOOK_SIGNING_SECRET`, identifiants S3.

## Sauvegarde

```bash
pg_dump -h HOTE -U UTILISATEUR -Fc -d relais_maman -f relais_maman-$(date -u +%Y%m%dT%H%M%SZ).dump
# Audio (stockage local) :
tar -czf audio-$(date -u +%Y%m%d).tar.gz -C "$STORAGE_LOCAL_DIR" .
```

Recommandations à valider pour un pilote : sauvegarde quotidienne chiffrée, conservée hors du serveur (autre lieu ou autre fournisseur), rétention de 30 jours, accès restreint et journalisé, **essai de restauration mensuel** documenté.

## Restauration

```bash
createdb -h HOTE -U UTILISATEUR relais_maman_restauree
pg_restore -h HOTE -U UTILISATEUR -d relais_maman_restauree --no-owner relais_maman-AAAAMMJJ.dump
# Vérifier : comptages, dernière migration appliquée, puis connexion d'un compte de test.
psql -d relais_maman_restauree -c 'SELECT count(*) FROM "Request"; SELECT migration_name FROM "_prisma_migrations" ORDER BY finished_at DESC LIMIT 1;'
```

Ne **jamais** restaurer par-dessus une base en service sans arrêt de l'API et du worker. Une restauration doit être tracée (qui, quand, quelle sauvegarde, pourquoi).

## Limites

- Une suppression de profil exécutée après une sauvegarde réapparaîtrait à la restauration : tenir un registre des suppressions à rejouer après toute restauration (procédure à valider avec le juriste).
- La remise à zéro de démonstration (`npm run demo:reset`) est **refusée** hors `APP_ENV` local/test/demo et n'existe qu'en ligne de commande, jamais derrière un bouton.
