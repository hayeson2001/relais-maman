# Rapport des vérifications — v0.2 (25/10/2026)

Exécutées sur un Mac Apple Silicon, Node.js 26, PostgreSQL 16 local, Chromium 156 (Playwright 1.64.1). La CI (Node 22, PostgreSQL en service) est écrite mais **n'a pas encore tourné sur GitHub** : rien n'a été poussé.

## Résultats mesurés

| Contrôle | Résultat |
|---|---|
| Structure des langues (mina = français, clés vides) | OK — 0/287 textes mina fournis |
| Contrastes WCAG des couleurs utilisées (script) | 10/10 ≥ seuil ; pêche sur fond (1,55) jamais utilisé en texte |
| Contrôle des types (core, API, web) | OK |
| Tests métier `packages/core` | **19/19** (dont parité exacte avec le prototype : 14 correctes, 6 abstentions, 0 erreur) |
| Tests d'intégration API contre PostgreSQL réel | **75/75** (scénario d'Ama, autorisations, règles, authentification, audio, outbox, webhooks, journaux) |
| Tests unitaires interface | **8/8** (normalisation des identifiants, file d'envoi) |
| Prototype v0.1 conservé | **11/11** |
| Parcours navigateur Playwright, écran 360 px | **12/12** |
| Poids de l'accueil, réseau simulé 400 kbit/s et 400 ms | **91 Ko transférés, interface visible en 2,8 s** (objectifs : ≤ 130 Ko, < 6 s) |
| Interface compilée (JS initial, gzip) | 101 Ko ; espaces du personnel chargés à la demande (1,4 à 3,9 Ko chacun) |
| `npm audit --omit=dev` | 0 vulnérabilité |
| Sauvegarde `pg_dump` puis restauration dans une base neuve | comptages identiques |
| Démarrage réel de l'API, remise à zéro refusée en `production` | OK |
| Spécification OpenAPI | 53 routes |

## Défauts trouvés par ces vérifications, puis corrigés

- Mise à jour non bornée : `updateMany({ where: { id: undefined } })` aurait marqué **tous** les rendez-vous comme effectués (relecture).
- Vérification TOTP fondée sur l'heure système au lieu de l'horloge injectée (test d'intégration).
- File d'envoi qui mutait ses objets : l'écran restait sur « Pas encore envoyée » (parcours navigateur).
- Intitulé masqué en position absolue qui faisait **dézoomer** la page agent sur mobile ; lien « Ouvrir » inatteignable au toucher (navigateur).
- Bouton « Me déconnecter » **invisible** (vert sur vert) (navigateur).
- Saisie de l'identifiant abîmée lettre par lettre (« R » → « RM-R ») (test clavier).
- Lecteur audio sans nom accessible (`<label>` non associable à `<audio>`) (navigateur).
- Focus déplacé dès le premier affichage, court-circuitant le lien d'évitement (test clavier).
- Interface servie **non compressée** (329 Ko, 7,7 s) (mesure de performance).
- Limitation des requêtes par IP : plusieurs agents derrière une même box se bloquaient (navigateur).
- Ressources statiques manquantes renvoyées en HTML au lieu de 404 (diagnostic).
- Racines trop ambiguës dans le signal santé (« tombe », « chaud », « vision ») ; tag d'image MinIO inexistant ; versions d'actions GitHub obsolètes ; numéros de démo dans une plage togolaise réelle (relecture).

## Simulé (ne prouve pas le comportement réel)

- SMS et appels : simulateur uniquement.
- Microphone : périphérique factice de Chromium ; refus de permission simulé.
- Réseau lent et coupure : émulation du navigateur, pas un réseau mobile togolais.
- « Petit écran Android » : émulation 360 × 740 dans Chromium de bureau.

## Non vérifié

- Aucun **téléphone Android physique**, aucun téléphone d'entrée de gamme, aucun réseau réel.
- Aucun **lecteur d'écran** réel (TalkBack) ; l'accessibilité a été contrôlée par règles automatiques et au clavier.
- Aucune **utilisatrice**, aucun agent, aucun soignant : ni compréhension des textes, ni utilité du parcours, ni charge de travail.
- Aucune locutrice du **mina** ; aucun audio produit.
- Lecture à voix haute avec une vraie voix française (dépend du téléphone).
- Stockage S3 (SeaweedFS) : le pilote S3 est écrit mais n'a pas été exécuté (Docker indisponible) ; seul le stockage local est testé.
- Docker Compose : fichier écrit, non exécuté sur cette machine.
- Charge, montée en volume, sauvegardes automatiques, supervision.

Les tests automatisés ne remplacent pas une expérimentation avec des utilisatrices.
