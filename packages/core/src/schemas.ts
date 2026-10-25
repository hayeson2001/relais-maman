import { z } from 'zod'
import { REQUEST_CATEGORIES } from './categories.js'
import { CLOSE_REASONS, VERIFICATION_METHODS, VERIFICATION_SOURCES } from './requestStateMachine.js'

/** Contrats d'API partagés client/serveur. Toute entrée est validée côté serveur. */

const civilDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date attendue au format AAAA-MM-JJ')
const shortNote = z.string().trim().min(3, 'Ajoutez une note de quelques mots').max(500)
/** Version attendue de l'objet : protège contre l'écrasement silencieux d'une modification concurrente. */
const expectedVersion = z.number().int().nonnegative()

export const staffLoginSchema = z.object({
  username: z.string().trim().min(3).max(64),
  password: z.string().min(1).max(200),
})

export const beneficiaryLoginSchema = z.object({
  identifier: z.string().trim().toUpperCase().regex(/^RM-[A-Z0-9]{4}-[A-Z0-9]{4}$/, 'Identifiant au format RM-XXXX-XXXX'),
  pin: z.string().regex(/^\d{6}$/, 'Le code personnel compte 6 chiffres'),
})

export const activationSchema = z.object({
  identifier: beneficiaryLoginSchema.shape.identifier,
  activationCode: z.string().trim().toUpperCase().regex(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/),
  newPin: z.string().regex(/^\d{6}$/),
})

export const totpSchema = z.object({ code: z.string().regex(/^\d{6}$/) })

export const createRequestSchema = z
  .object({
    /** Généré par le client au moment où la femme confirme l'envoi ; réutilisé à chaque nouvel essai. */
    idempotencyKey: z.uuid(),
    appointmentId: z.uuid().nullable(),
    category: z.enum(REQUEST_CATEGORIES).nullable(),
    text: z.string().trim().max(1000).default(''),
    audioId: z.uuid().nullable().default(null),
    locale: z.string().min(2).max(8),
    /** Accord explicite de transmission, version du texte affiché. */
    transmissionConsentVersion: z.string().min(1).max(40),
  })
  .refine((v) => v.text.length >= 2 || v.audioId !== null || v.category === 'OTHER_CALLBACK', {
    message: 'Expliquez votre besoin en quelques mots, enregistrez un message ou demandez à être rappelée.',
    path: ['text'],
  })

export const proposeSlotSchema = z.object({
  expectedVersion,
  facilityId: z.uuid(),
  startsAt: z.iso.datetime(),
  note: z.string().trim().max(300).optional(),
})

export const respondSlotSchema = z.object({
  response: z.enum(['ACCEPT', 'DECLINE', 'ASK_OTHER']),
  comment: z.string().trim().max(300).optional(),
})

export const recordActionSchema = z.object({
  expectedVersion,
  description: z.string().trim().min(5).max(600),
  /** Frais inconnus : « à vérifier ». Jamais de gratuité ou prise en charge supposée. */
  cost: z.discriminatedUnion('status', [
    z.object({ status: z.literal('TO_VERIFY') }),
    z.object({ status: z.literal('KNOWN'), amountXof: z.number().int().nonnegative().max(10_000_000), source: shortNote }),
  ]),
})

export const transitionSchemas = {
  START_REVIEW: z.object({ expectedVersion }),
  AGREE_ACTION: z.object({
    expectedVersion,
    /** Si aucun créneau n'a été accepté dans l'application : accord recueilli par l'agent. */
    agreementObtainedBy: z.enum(['ACCEPTED_SLOT_IN_APP', 'AGENT_PHONE_CALL', 'AGENT_IN_PERSON']),
    note: z.string().trim().max(500).optional(),
  }),
  MARK_AWAITING_COMPLETION: z.object({ expectedVersion }),
  POSTPONE: z.object({ expectedVersion, reason: shortNote }),
  DECLARE_CARE: z.object({ expectedVersion, careDate: civilDate }),
  VERIFY_CARE: z.object({
    expectedVersion,
    careDate: civilDate,
    source: z.enum(VERIFICATION_SOURCES),
    method: z.enum(VERIFICATION_METHODS),
    note: shortNote,
  }),
  CORRECT_VERIFICATION: z.object({
    expectedVersion,
    careDate: civilDate,
    source: z.enum(VERIFICATION_SOURCES),
    method: z.enum(VERIFICATION_METHODS),
    note: shortNote,
    correctionReason: shortNote,
  }),
  REVOKE_VERIFICATION: z.object({ expectedVersion, reason: shortNote }),
  CLOSE_WITHOUT_CARE: z.object({ expectedVersion, reason: z.enum(CLOSE_REASONS), note: z.string().trim().max(500).optional() }),
} as const

export const decideCategorySchema = z.object({
  expectedVersion,
  category: z.enum(REQUEST_CATEGORIES),
  note: z.string().trim().max(300).optional(),
})

export const reassignSchema = z.object({
  expectedVersion,
  agentId: z.uuid(),
  reason: shortNote,
})

export const messageSchema = z.object({ body: z.string().trim().min(1).max(1000) })

export const consentPurposes = ['TRANSMIT_REQUEST', 'RECEIVE_CALLBACK', 'KEEP_AUDIO', 'RESEARCH'] as const
export const consentUpdateSchema = z.object({
  purpose: z.enum(consentPurposes),
  granted: z.boolean(),
  textVersion: z.string().min(1).max(40),
})

export const contactPreferencesSchema = z.object({
  channels: z.array(z.enum(['SMS', 'VOICE_CALL', 'IN_APP'])).min(1),
  preferredLocale: z.string().min(2).max(8),
  callWindowStart: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  callWindowEnd: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
})

export type CreateRequestInput = z.infer<typeof createRequestSchema>
