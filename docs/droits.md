# Droits et contrôle d'accès

Appliqués **côté serveur**, à chaque requête et pour chaque objet (`apps/api/src/authz/policy.ts`). Les objets hors périmètre ne sont jamais chargés : ils renvoient 404, sans confirmer leur existence. Masquer un bouton dans l'interface n'est qu'un confort.

| | Bénéficiaire | Agent | Référent de structure | Administrateur ADEC |
|---|---|---|---|---|
| Périmètre | ses données | bénéficiaires de **son équipe** | demandes ayant un créneau dans **sa structure** | référentiels et agrégats |
| Lire une demande | les siennes (texte, créneaux, messages) | dossier complet de l'équipe | vue réduite : nom affiché, état, créneaux de sa structure, déclarations, vérifications. **Ni texte, ni audio, ni téléphone, ni messages** | **non** |
| Créer une demande | oui, avec accord | — | — | — |
| Examiner, organiser, réaffecter (dans l'équipe), clôturer | — | oui | — | — |
| Proposer un créneau | — | oui | — | — |
| Accepter / refuser un créneau | oui | — | — | — |
| Confirmer un créneau | — | — | si habilité (`canConfirmCare`) | — |
| Déclarer un soin reçu | oui | pour elle (tracé comme tel) | — | — |
| Vérifier / corriger / annuler une vérification | — | vérification d'agent | confirmation de structure, si habilité | — |
| Inscription assistée, nouveau code d'activation | — | dans son équipe | — | — |
| Comptes du personnel, structures, registres, connecteurs, indicateurs, export | — | — | — | oui, avec **double vérification** |

## Tests correspondants

`apps/api/test/authz.test.ts` (19 tests) : sans session ; bénéficiaire contre une autre bénéficiaire ; agent contre une autre équipe (lecture, action, message, réaffectation, récupération) ; structure contre une autre structure ; référent non habilité ; administrateur sans second facteur, rejeu du code, absence d'accès aux dossiers ; export pseudonymisé ; CSRF ; origine étrangère. Parcours navigateur : `apps/web/e2e/offline-privacy.spec.ts` (adresse forcée d'un dossier d'une autre équipe).
