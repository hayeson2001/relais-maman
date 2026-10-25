# Fiche du modèle — suggestion de catégorie d'obstacle, v0.1 (baseline expérimentale)

## Rôle et limites d'usage

Suggérer à un agent la **catégorie d'obstacle pratique** d'un message : trajet, frais, horaire, compréhension. L'agent décide toujours. Ce n'est **pas** un modèle de langage, ni une reconnaissance vocale, ni un outil de santé.

**Usages exclus** : triage clinique, diagnostic, traitement, score de risque obstétrical, détection ou exclusion d'urgence, éligibilité, priorisation autonome, langues autres que le français.

## Modèle

- Naive Bayes multinomial (`packages/core/src/classifier/index.ts`), version `naive-bayes-fr-0.1`, **repris à l'identique** du prototype v0.1 (test de parité automatique).
- Données : 48 phrases françaises synthétiques rédigées par l'auteur (12 par catégorie). Aucune donnée de patiente, aucun audio.
- **Abstention** si moins de 2 mots connus, score en tête < 0,62 ou écart avec le second < 0,18. Langue autre que `fr` : abstention `UNSUPPORTED_LANGUAGE` (le mina n'est jamais traité comme du français).
- Le **score n'est pas une probabilité calibrée** et n'a aucune valeur médicale.
- **Interface de remplacement** : `ObstacleClassifier` (`version`, `supportedLocales`, `suggest(text, locale)`), injectée dans le contexte de l'API.

## Évaluation reproductible

`npm run evaluate` → [evaluation-fr.json](evaluation-fr.json). Jeu séparé de 20 phrases synthétiques, jamais utilisé à l'entraînement (vérifié par test).

| Catégorie | Exemples | Correctes | Erreurs | Abstentions |
|---|---|---|---|---|
| Trajet | 5 | 5 | 0 | 0 |
| Frais | 5 | 4 | 0 | 1 |
| Horaire | 5 | 3 | 0 | 2 |
| Compréhension | 5 | 2 | 0 | 3 |
| **Total** | **20** | **14 (70 %)** | **0** | **6 (30 %)** |

**Ce n'est pas un benchmark indépendant** : le même auteur a écrit les deux jeux. Aucune mesure par langue n'existe hors du français synthétique ; aucun chiffre n'est extrapolé au mina.

## Traçabilité dans l'application

Pour chaque demande avec texte : version du modèle et de la règle, catégorie suggérée, catégorie en tête, abstention et motif, score, mots reconnus, signal de reprise humaine, puis **catégorie finale décidée par l'agent**, auteur et date (`ModelSuggestion`). Une suggestion non confirmée bloque l'action convenue.

## Signal de reprise humaine (santé)

Liste de racines de mots (`healthReviewCue.ts`, version `health-review-cue-fr-0.2`) qui place le message en **« Question de santé (reprise humaine) »** et bloque toute organisation logistique tant qu'un agent n'a pas décidé.

- Réexaminée par rapport au prototype : ajout de racines (perte des eaux, mouvements du bébé, tétée, vision floue, gonflement, maux de tête, chute…), retrait de racines ambiguës (« tombe », « chaud », « vision »). Aucune phrase logistique d'entraînement ou d'évaluation ne la déclenche (test).
- **Elle ne peut ni établir ni exclure une urgence.** Limites : euphémismes (« je ne me sens pas bien » ne déclenche rien, test à l'appui), fautes, symptômes non listés, mina, alternance de langues. Les négations déclenchent volontairement le signal.
- L'**absence de signal ne garantit jamais la sécurité** ; tous les messages sont lus par un humain.
- **Liste à faire relire par un·e professionnel·le de santé** avant tout pilote, avec des consignes de réponse validées. Aucun numéro d'urgence ni délai n'est affiché faute de validation.

## Données d'entraînement futures

Aucun message ni audio personnel n'alimente un entraînement. Une réutilisation exigerait un accord distinct (`RESEARCH` ne suffit pas tel que rédigé), une procédure définie, une pseudonymisation et un jeu de test réellement indépendant.
