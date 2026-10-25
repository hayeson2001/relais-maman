# Relais Maman — v0.2

**Du premier message au soin reçu.** Application de coordination humaine des obstacles pratiques (trajet, frais, horaire, compréhension) qui empêchent des femmes enceintes et des mères de jeunes enfants d'aller à leurs rendez-vous de soin.

Porteur : **ADEC Consulting**, nom commercial d'ADEC Ingénierie Culturelle SARL (Togo). Zone envisagée : Lomé et sa périphérie.

> **État du projet, sans détour.** Aucun entretien utilisateur, essai terrain, partenariat sanitaire, validation du mina ni financement n'est acquis. La candidature UNICEF Femtech demande 90 000 USD : ce n'est **pas** une subvention obtenue. Toutes les personnes, structures, zones et numéros de ce dépôt sont **fictifs**. Ne saisissez aucune donnée réelle hors d'un pilote validé (voir [docs/prerequis-pilote.md](docs/prerequis-pilote.md)).

## Ce qui est opérationnel, simulé ou conditionné

| Fonction | Statut |
|---|---|
| Comptes séparés (bénéficiaire, agent, structure, administrateur), sessions serveur, droits par objet | **Opérationnel** (testé) |
| Parcours complet : demande → examen → créneau proposé / accepté / confirmé par la structure → soin déclaré → soin vérifié | **Opérationnel** (testé en navigateur) |
| Persistance PostgreSQL, migrations versionnées, historique jamais réécrit | **Opérationnel** |
| Inscription assistée sans e-mail, activation à usage unique, récupération supervisée | **Opérationnel** |
| Accords versionnés (transmission, rappel, audio, recherche) et effets du retrait | **Opérationnel** |
| Suggestion de catégorie (Naive Bayes FR v0.1, abstention, décision humaine) | **Expérimental** : baseline sur 48 phrases synthétiques |
| Enregistrement vocal volontaire, stockage privé, écoute par lien temporaire, transcription humaine | **Opérationnel** (testé avec un micro simulé, pas avec un vrai téléphone) |
| Lecture à voix haute en français | **Dépend du navigateur** (proposée seulement si une voix existe) |
| Mina | **Non disponible** : structure prête, aucun texte ni audio validé |
| SMS, appels, serveur vocal | **Simulés** : aucun envoi réel ; aucun fournisseur retenu |
| Échanges automatisés avec les structures de santé | **Non implémentés** : aucun partenaire |
| Indicateurs agrégés et export pseudonymisé | **Opérationnel** sur données fictives |
| Hors connexion | Interface en cache ; file d'envoi **en mémoire** (voir [docs/synchronisation.md](docs/synchronisation.md)) |

## Démarrer depuis un clone propre

Prérequis : Node.js ≥ 22, et soit PostgreSQL 16 installé localement, soit Docker.

```bash
npm ci
cp .env.example .env              # puis remplacer APP_SECRET : openssl rand -hex 32

# Base de données (une des deux options)
npm run db:start                  # instance PostgreSQL isolée dans .local/, port 54329
# ou : docker compose up -d postgres

npm run db:migrate                # migrations versionnées
npm run demo:reset                # données FICTIVES + liste des comptes de démonstration

npm run dev:api                   # API sur http://127.0.0.1:3000 (doc OpenAPI : /api/docs)
npm run dev:web                   # interface sur http://127.0.0.1:5173
npm run worker                    # (facultatif) envois simulés et bascules chronologiques
```

Suivre le scénario de démonstration entre plusieurs navigateurs : [docs/demonstration.md](docs/demonstration.md).

## Commandes

| Commande | Rôle |
|---|---|
| `npm run typecheck` | Contrôle des types (tous les paquets) |
| `npm test` | Tests unitaires et d'intégration (PostgreSQL réel, base `*_test`) |
| `npm run test:e2e` | Parcours navigateur Playwright sur l'interface compilée |
| `npm run build` | Compilation (interface pré-compressée gzip/brotli) |
| `npm run evaluate` | Évaluation reproductible du modèle → `docs/model/evaluation-fr.json` |
| `npm run demo:reset` | Remise à zéro de la démo (**refusée** hors `APP_ENV` local/test/demo) |
| `npm run legacy:start` / `legacy:test` | Prototype v0.1 d'origine, conservé intact |

## Documentation

- [Architecture et choix](docs/architecture.md) · [API](docs/api.md) · [Droits](docs/droits.md) · [États métier](docs/etats-metier.md) · [Synchronisation et hors connexion](docs/synchronisation.md)
- [Langues et audios](docs/langues-et-audio.md) · [Fiche du modèle](docs/model/fiche-modele.md) · [Téléphonie et intégrations](docs/integrations.md)
- [Confidentialité](docs/confidentialite.md) · [Sauvegarde et restauration](docs/sauvegarde-restauration.md) · [Déploiement](docs/deploiement.md)
- [Guide agent](docs/guide-agent.md) · [Guide administration](docs/guide-administration.md) · [Démonstration](docs/demonstration.md)
- [Vérifications réellement exécutées](docs/verifications.md) · [Prérequis du pilote](docs/prerequis-pilote.md)

## Licence

Code du projet : MIT ([LICENSE](LICENSE)). Dépendances : [THIRD_PARTY_LICENSES.md](THIRD_PARTY_LICENSES.md). Le prototype v0.1 est conservé dans [legacy/prototype-v0.1](legacy/prototype-v0.1).
