/**
 * Machine à états des demandes (docs/etats-metier.md).
 *
 * Deux familles d'états, à ne jamais confondre :
 * - ÉTATS LOCAUX (navigateur uniquement, jamais en base) : brouillon, en attente d'envoi.
 * - ÉTATS SERVEUR (base de données, seule source de vérité) : à partir de « demande reçue ».
 *
 * Une demande n'est dite « transmise » qu'après accusé de réception du serveur.
 * « Consultée par un agent » n'est pas un état : c'est l'horodatage `firstViewedAt`.
 */

export const LOCAL_STATES = ['DRAFT', 'PENDING_SEND'] as const
export type LocalState = (typeof LOCAL_STATES)[number]

export const SERVER_STATES = [
  'RECEIVED', // demande reçue
  'UNDER_REVIEW', // en cours d'examen
  'ACTION_AGREED', // action convenue avec la femme
  'AWAITING_COMPLETION', // réalisation à confirmer
  'CARE_DECLARED', // soin déclaré reçu (déclaration, pas une vérification)
  'CARE_VERIFIED', // soin vérifié par une source humaine identifiée
  'CLOSED_WITHOUT_CARE', // clôture sans soin confirmé, motif obligatoire
] as const
export type ServerState = (typeof SERVER_STATES)[number]

export const OPEN_STATES: readonly ServerState[] = [
  'RECEIVED', 'UNDER_REVIEW', 'ACTION_AGREED', 'AWAITING_COMPLETION', 'CARE_DECLARED',
]
export const isOpen = (s: ServerState) => OPEN_STATES.includes(s)

export const ROLES = ['BENEFICIARY', 'AGENT', 'FACILITY_REFERENT', 'ADMIN'] as const
export type Role = (typeof ROLES)[number]
/** Acteur technique (worker) : uniquement pour des transitions purement chronologiques. */
export type Actor = Role | 'SYSTEM'

export const REQUEST_ACTIONS = [
  'START_REVIEW',
  'AGREE_ACTION',
  'MARK_AWAITING_COMPLETION',
  'POSTPONE',
  'DECLARE_CARE',
  'VERIFY_CARE',
  'CORRECT_VERIFICATION',
  'REVOKE_VERIFICATION',
  'CLOSE_WITHOUT_CARE',
] as const
export type RequestAction = (typeof REQUEST_ACTIONS)[number]

interface TransitionRule {
  from: readonly ServerState[]
  /** 'SAME' : l'action modifie le dossier sans changer d'état (ex. correction tracée) */
  to: ServerState | 'SAME'
  actors: readonly Actor[]
}

export const TRANSITIONS: Record<RequestAction, TransitionRule> = {
  START_REVIEW: { from: ['RECEIVED'], to: 'UNDER_REVIEW', actors: ['AGENT'] },
  // Exige une action enregistrée ET (créneau accepté par la femme OU accord recueilli par
  // l'agent avec note) — vérifié par le service, qui connaît les données.
  AGREE_ACTION: { from: ['UNDER_REVIEW'], to: 'ACTION_AGREED', actors: ['AGENT'] },
  MARK_AWAITING_COMPLETION: { from: ['ACTION_AGREED'], to: 'AWAITING_COMPLETION', actors: ['AGENT', 'SYSTEM'] },
  // Report : retour à l'examen pour organiser un nouveau créneau, motif obligatoire.
  POSTPONE: { from: ['ACTION_AGREED', 'AWAITING_COMPLETION'], to: 'UNDER_REVIEW', actors: ['AGENT'] },
  DECLARE_CARE: { from: ['ACTION_AGREED', 'AWAITING_COMPLETION'], to: 'CARE_DECLARED', actors: ['BENEFICIARY', 'AGENT'] },
  VERIFY_CARE: {
    from: ['ACTION_AGREED', 'AWAITING_COMPLETION', 'CARE_DECLARED'],
    to: 'CARE_VERIFIED',
    actors: ['AGENT', 'FACILITY_REFERENT'],
  },
  // Correction : nouvelle vérification qui remplace la précédente, l'ancienne est conservée.
  CORRECT_VERIFICATION: { from: ['CARE_VERIFIED'], to: 'SAME', actors: ['AGENT', 'FACILITY_REFERENT'] },
  // Annulation d'une vérification erronée : retour à « réalisation à confirmer », historique conservé.
  REVOKE_VERIFICATION: { from: ['CARE_VERIFIED'], to: 'AWAITING_COMPLETION', actors: ['AGENT', 'FACILITY_REFERENT'] },
  // SYSTEM : uniquement pour l'effet opérationnel d'un retrait d'accord de transmission
  // (motif CONSENT_WITHDRAWN imposé par le service).
  CLOSE_WITHOUT_CARE: { from: OPEN_STATES, to: 'CLOSED_WITHOUT_CARE', actors: ['AGENT', 'SYSTEM'] },
}

export type TransitionCheck =
  | { ok: true; to: ServerState }
  | { ok: false; reason: 'FORBIDDEN_ROLE' | 'INVALID_FROM_STATE' }

/** Vérifie rôle et état de départ. Les règles de données et de chronologie sont dans le service. */
export function checkTransition(from: ServerState, action: RequestAction, actor: Actor): TransitionCheck {
  const rule = TRANSITIONS[action]
  if (!rule.actors.includes(actor)) return { ok: false, reason: 'FORBIDDEN_ROLE' }
  if (!rule.from.includes(from)) return { ok: false, reason: 'INVALID_FROM_STATE' }
  return { ok: true, to: rule.to === 'SAME' ? from : rule.to }
}

export const CLOSE_REASONS = [
  'UNREACHABLE', // femme injoignable après plusieurs tentatives
  'NO_LONGER_NEEDED', // la femme n'a plus besoin d'aide
  'CARE_NOT_RECEIVED', // le soin n'a pas eu lieu
  'REFERRED_TO_HEALTH_PROFESSIONAL', // question de santé orientée vers un professionnel
  'CONSENT_WITHDRAWN', // retrait de l'accord de transmission
  'DUPLICATE', // doublon d'une autre demande
  'OTHER',
] as const
export type CloseReason = (typeof CLOSE_REASONS)[number]

export const VERIFICATION_SOURCES = ['FACILITY_CONFIRMATION', 'AGENT_VERIFICATION'] as const
export const VERIFICATION_METHODS = ['PHONE_CALL', 'IN_PERSON', 'FACILITY_REGISTER', 'OTHER'] as const
