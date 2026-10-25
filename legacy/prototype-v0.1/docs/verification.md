# Vérification du prototype — 25 octobre 2026

## Contrôles effectués

- Réponse HTTP locale : code 200, page Relais Maman présente.
- Analyse syntaxique des modules JavaScript réussie.
- 11 tests automatisés de parcours réussis ; inclut transitions, consentement, doublons, dates, confirmation humaine, abstention et état local invalide.
- Évaluation synthétique séparée : 14 catégories correctes, 6 abstentions sur 20 phrases. Voir le fichier JSON et la fiche modèle.
- Parcours navigateur vérifié : demande d’Ama, accord de partage, présence côté agent, enregistrement d’une solution, confirmation par source humaine, historique et indicateurs (1 soin confirmé parmi 3 demandes fictives).
- Laboratoire de texte libre : suggestion de disponibilité pour un message sur les horaires du marché ; orientation humaine pour un message mentionnant un bébé malade.
- Persistance des exemples après rechargement de la page vérifiée.
- Réinitialisation testée avec la boîte de dialogue interne, après remplacement d’une confirmation native du navigateur qui perturbait l’automatisation.
- Écran de 390 × 844 pixels : largeur de contenu égale à 390 pixels sur l’accueil et la page de preuve, sans débordement horizontal. Sur mobile, l’introduction de présentation est masquée pour rapprocher les actions principales.
- Installation du service worker signalée dans l’interface. L’interface et ses modules sont précachés ; une panne réseau complète n’a pas été reproduite durant cette vérification.
- Les réponses rédigées en anglais respectent les limites de mots affichées par le formulaire.

## Limites de ces contrôles

Les essais ont été réalisés sur navigateur de bureau, dont un affichage réduit, et non sur un téléphone Android physique. Ils ne valident ni les performances sur un appareil modeste, ni l’usage d’un téléphone simple, ni l’accessibilité réelle pour une personne peu lectrice.

La lecture et la dictée vocales dépendent du navigateur et de ses autorisations. Aucun test avec microphone ou locutrice locale n’a été effectué. Aucune fonctionnalité télécom ou connexion à un centre de santé n’existe dans cette version.

Aucune enquête, validation clinique, évaluation indépendante, observation de soin réel ou mesure d’impact n’a été menée. La version hébergée reste une démonstration privée avec stockage local, sans authentification de rôles métier ni base de données partagée.
