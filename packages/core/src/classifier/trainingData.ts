/**
 * Données synthétiques reprises À L'IDENTIQUE du prototype v0.1
 * (legacy/prototype-v0.1/dist/training.mjs), rédigées par l'auteur : aucune donnée de
 * patiente, aucun audio. Les phrases d'évaluation ne doivent jamais rejoindre
 * l'entraînement, sinon le rapport d'évaluation perd son caractère « non vu ».
 *
 * Remarque : la mention « Wezou » (programme togolais de prise en charge) figure dans des
 * phrases d'entraînement comme vocabulaire possible d'une question de coût. Elle
 * n'implique aucune affirmation de gratuité ou de prise en charge par l'application.
 */
import type { LogisticCategory } from '../categories.js'

export const TRAINING_FR: Record<LogisticCategory, string[]> = {
  TRANSPORT: [
    "Je n'ai pas de moyen de transport pour venir au centre",
    'Le dispensaire est loin de mon village et je dois marcher',
    'Je ne trouve pas de taxi pour aller au rendez-vous',
    'La route est coupée et je ne peux pas me déplacer',
    "Je voudrais une aide pour le trajet jusqu'au centre",
    'Il me faut une moto pour le déplacement au dispensaire',
    "Personne ne peut m'accompagner sur la route",
    'Je suis très loin du centre et sans véhicule',
    'Comment faire le trajet du village à la consultation',
    'Le taxi et le déplacement sont difficiles à trouver',
    "Mon village n'a pas de transport vers le centre",
    'Je cherche un véhicule ou une moto pour venir',
  ],
  COST: [
    "Je n'ai pas assez d'argent pour payer les soins",
    'Combien coûte la consultation et quels sont les frais',
    'Je veux savoir si Wezou couvre les dépenses',
    'Je ne peux pas payer les examens au centre',
    'Mon budget ne permet pas de régler la facture',
    'Les frais médicaux sont trop chers pour moi',
    'Je voudrais connaître la prise en charge et le prix',
    'Je cherche une aide financière pour les soins',
    "Je manque d'argent pour les analyses",
    'Est-ce que cette prestation est gratuite ou payante',
    'Je dois connaître les dépenses restant à payer',
    "Qui peut m'aider à financer la consultation",
  ],
  AVAILABILITY: [
    'Je travaille au marché toute la matinée',
    'Le rendez-vous tombe pendant mes heures de vente',
    'Je ne peux pas fermer mon étal ce jour-là',
    "Je souhaite changer la date et l'heure du rendez-vous",
    'Je suis occupée aux champs le matin',
    'Je ne suis pas disponible à ce créneau',
    'Je dois garder mes enfants pendant les heures proposées',
    'Je voudrais un horaire après le travail',
    'La consultation dure trop longtemps pour mon activité',
    'Je ne peux pas quitter mon employeur avant midi',
    'Je voudrais reporter le rendez-vous à un autre jour',
    'Je vends au marché et je manque de temps',
  ],
  UNDERSTANDING: [
    "Je n'ai pas compris le message du centre",
    'Je ne sais pas quels documents apporter',
    'Expliquez-moi les démarches pour la consultation',
    'Je ne comprends pas le français écrit',
    "Je voudrais que quelqu'un m'explique le rendez-vous",
    'Je ne sais pas où me présenter dans le centre',
    "J'ai besoin d'explications dans ma langue",
    'Que faut-il préparer et apporter pour la visite',
    'Pouvez-vous répéter les instructions plus simplement',
    'Je ne sais pas lire la fiche et les papiers',
    'Je cherche des informations sur les formalités',
    "Je n'ai pas compris la consigne de la sage-femme",
  ],
}

export const EVALUATION_FR: Array<[LogisticCategory, string]> = [
  ['TRANSPORT', 'Je cherche un taxi pour aller au dispensaire'],
  ['TRANSPORT', 'La route est difficile depuis mon village'],
  ['TRANSPORT', 'Il me faut un véhicule pour le trajet'],
  ['TRANSPORT', 'Je suis loin du centre sans moyen de déplacement'],
  ['TRANSPORT', 'Je voudrais une moto pour venir à la visite'],
  ['COST', 'Je ne peux régler les frais des analyses'],
  ['COST', 'Quel est le prix des examens médicaux'],
  ['COST', 'Mon budget est insuffisant pour payer'],
  ['COST', 'Wezou peut-il couvrir mes dépenses de soins'],
  ['COST', 'Je cherche un financement pour la facture'],
  ['AVAILABILITY', 'Je vends au marché à cette heure'],
  ['AVAILABILITY', 'Peut-on changer le créneau de ma visite'],
  ['AVAILABILITY', 'Je suis aux champs toute la matinée'],
  ['AVAILABILITY', 'Je souhaite reporter à un autre jour après mon travail'],
  ['AVAILABILITY', 'Mon activité ne me laisse pas le temps de venir'],
  ['UNDERSTANDING', 'Quels papiers dois-je apporter'],
  ['UNDERSTANDING', 'Je voudrais comprendre les formalités'],
  ['UNDERSTANDING', 'Répétez les instructions dans ma langue'],
  ['UNDERSTANDING', 'Je ne comprends pas les documents écrits'],
  ['UNDERSTANDING', 'Expliquez-moi où me présenter et quoi préparer'],
]
