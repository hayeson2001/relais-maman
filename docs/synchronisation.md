# Faible connectivité, téléphones partagés et synchronisation

## Ce qui fonctionne hors connexion

| Situation | Comportement |
|---|---|
| Premier chargement | **Exige le réseau.** Mesuré : 91 Ko, 2,8 s à 400 kbit/s et 400 ms de latence. |
| Chargements suivants | L'interface (HTML, JS, CSS, icône) est servie par le service worker, même sans réseau. |
| Données personnelles (rendez-vous, demandes, réponses) | **Exigent le réseau.** Aucune réponse `/api` n'est mise en cache (règle `navigateFallbackDenylist` et aucune règle de cache d'exécution ; vérifié par un test navigateur). |
| Préparer une demande | Possible hors connexion : le brouillon reste à l'écran. |
| Envoyer une demande | Mise en file **en mémoire** ; affichage « Envoi en attente de connexion » ; envoi automatique au retour du réseau. |
| Fermer l'onglet avant le retour du réseau | **La demande est perdue** (rien n'est écrit sur disque, voir ci-dessous). C'est annoncé à l'écran : « Gardez cet écran ouvert ». |
| Enregistrer un message vocal | Exige le réseau pour l'envoi ; l'audio reste en mémoire jusque-là. |

## Politique de la file d'envoi (`apps/web/src/offline/sendQueue.ts`)

- **Aucun « envoyé » avant l'accusé du serveur** (HTTP 200 ou 201).
- **Idempotence** : la clé est créée une seule fois, quand la femme confirme l'envoi, puis réutilisée à chaque essai. Le serveur renvoie alors la demande existante (200, `duplicate: true`) au lieu d'en créer une seconde.
- **Erreur réseau** : réessai au retour de la connexion, même clé.
- **Refus du serveur** (règle métier, session expirée, droits retirés) : erreur **visible**, jamais réessayée en silence ; « Réessayer » ou « Annuler et effacer ».
- **Revalidation** : chaque envoi passe par la session et le contrôle des droits côté serveur ; une session expirée renvoie à la connexion avec purge locale.
- **Conflits** : toute modification d'un dossier porte la version attendue ; en cas de conflit (409), l'interface recharge le dossier et prévient l'agent, sans écrasement silencieux.

## Mode téléphone partagé (seul mode en v0.2)

- Rien de sensible n'est écrit sur disque : ni `localStorage`, ni IndexedDB, ni cache de réponses privées. Le cookie de session est HttpOnly ; le jeton CSRF reste en mémoire.
- **À la déconnexion** : révocation côté serveur, purge de la mémoire, de la file d'envoi, du `sessionStorage` et de tout cache autre que l'interface publique. Le bouton « retour » du navigateur ne rouvre rien.
- **Inactivité** : la session expire au bout de 15 minutes pour une bénéficiaire.
- Les SMS et notifications sont **neutres** (aucune mention de santé, de grossesse ou d'enfant).

## Persistance sur un appareil personnel : non proposée

Une persistance chiffrée sur l'appareil (brouillons conservés après fermeture) n'est **pas** implémentée. Elle demanderait un modèle de menace (appareil prêté, volé, partagé), une durée limitée, un consentement explicite et une clé qui ne soit pas stockée à côté des données ; un simple chiffrement avec une clé dans le navigateur ne protégerait pas réellement. À évaluer avec des utilisatrices avant toute décision.
