import { normalizeText } from './text.js'

/**
 * Signal de REPRISE HUMAINE, réexaminé par rapport au prototype v0.1.
 *
 * Ce que c'est : une liste de racines de mots qui, si elles apparaissent, demandent qu'une
 * personne lise le message avant tout traitement logistique.
 * Ce que ce n'est pas : un triage. Il ne peut ni établir ni exclure une urgence.
 *
 * Limites connues, à ne jamais masquer : euphémismes, fautes d'orthographe, négations
 * (« pas de fièvre » déclenche quand même le signal, volontairement : mieux vaut une
 * relecture inutile qu'un oubli), symptômes non listés, mina et alternance de langues.
 * L'ABSENCE de signal ne signifie JAMAIS que le message est sans risque : tous les messages
 * restent lus par un humain.
 *
 * Racines écartées car trop ambiguës : « tombe » (« le rendez-vous tombe pendant… »),
 * « chaud » (« il fait chaud »), « vision » (« révision »).
 *
 * Évolution v0.1 -> v0.2 : ajout de racines (perte des eaux, mouvements du bébé, tétée,
 * vision, gonflement, maux de tête, chute…) qui manquaient au prototype. Liste à faire
 * relire par un·e professionnel·le de santé avant tout pilote.
 */
const HEALTH_REVIEW_ROOTS = [
  // saignements, pertes
  'saign', 'sang', 'perte des eaux', 'perdu les eaux',
  // respiration, conscience
  'respir', 'etouff', 'convuls', 'inconscien', 'evanoui', 'chute',
  // douleurs, fièvre
  'fievre', 'douleur', 'mal au ventre', 'mal de tete', 'maux de tete', 'contraction',
  'vomi', 'diarrh', 'malade', 'symptom',
  // grossesse et nourrisson
  'bouge plus', 'bouge pas', 'ne tete', 'tete plus', 'jaune', 'flou', 'gonfl', 'enfl',
  // médicaments, allergies
  'medicament', 'allerg', 'comprime',
  // sécurité personnelle
  'suicid', 'violence', 'frappe', 'maltrait', 'menace',
]

export function hasHealthReviewCue(text: string): boolean {
  const n = normalizeText(text)
  return HEALTH_REVIEW_ROOTS.some((root) => n.includes(root))
}

export const HEALTH_REVIEW_RULE_VERSION = 'health-review-cue-fr-0.2'
