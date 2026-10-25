# Registre des langues et des contenus audio

## Langues

| Code | Langue | Interface proposée | Validation | Commentaire |
|---|---|---|---|---|
| `fr` | Français | **oui** | en cours | Textes rédigés par l'équipe projet en français simple ; **pas encore testés avec des utilisatrices**. |
| `gej` | Mina (gen) | **non** | non commencée | Fichier `apps/web/src/i18n/gej.json` présent avec la **même structure de clés**, toutes vides (0/287). Aucune traduction automatique. |

- La table `Language` (base) décide de ce qui est proposé : seules les langues `uiAvailable = true` apparaissent dans le sélecteur (`/api/public/languages`).
- `node scripts/i18n-sync.mjs` ajoute les clés manquantes vides sans écraser les textes fournis ; `--check` (CI) échoue si une structure diverge.
- Le code ISO 639-3 `gej` (gen) est retenu par hypothèse pour le mina ; **à confirmer** avec les partenaires linguistiques.

### Rendre le mina disponible (procédure)

1. Traduction des 287 textes par des personnes compétentes, relecture par d'autres locutrices, essai avec des utilisatrices.
2. Saisie dans `gej.json`, puis `uiValidation = VALIDATED` et `uiAvailable = true` dans la table `Language` (action tracée).
3. Les contenus audio correspondants suivent leur propre validation (ci-dessous).

## Contenus audio (consignes et explications)

Table `AudioContent` : identifiant du message, langue, transcription, fichier (clé de stockage), version, auteur ou provenance, statut (`MISSING`, `DRAFT`, `VALIDATED`, `REJECTED`), date et auteur de validation. Visible dans l'espace administration, onglet « Langues et audios », avec le décompte des manques.

État actuel : 3 messages (`welcome`, `how_it_works`, `request_sent`) ; **aucun fichier audio produit**, en français comme en mina (statut `MISSING`).

- Seuls les contenus `VALIDATED` **avec fichier** sont servis aux bénéficiaires (`/api/public/audio-contents`).
- **Pas de fausse lecture vocale** : sans contenu validé ni voix compatible du navigateur, aucun bouton « Écouter » n'est affiché ; le texte reste toujours disponible. Une voix « mina » n'est jamais supposée.
- La lecture à voix haute en français utilise la synthèse vocale du navigateur si une voix française existe (qualité et disponibilité variables selon le téléphone).

## Messages vocaux des bénéficiaires

- Enregistrement **volontaire**, écoute avant envoi, suppression possible, 2 minutes et 2 Mo maximum.
- Accord distinct « conserver mon message vocal » exigé à l'envoi ; son retrait supprime les enregistrements.
- Type réel vérifié par les premiers octets (WebM, Ogg, MP4, WAV) ; stockage privé ; écoute par lien signé de 5 minutes, jamais mis en cache.
- **Transcription humaine** par un agent de l'équipe ; un message dans une langue autre que le français est affecté à un agent qui déclare la parler.
- **Aucune transcription ni dictée automatique** n'est activée (`TRANSCRIPTION_PROVIDER=none`). Toute activation future devra être explicite, documentée et accompagnée d'une information sur le traitement des données ; un échec doit renvoyer au texte ou à l'aide humaine.
- La compréhension automatique du mina est un chantier distinct, non commencé.
