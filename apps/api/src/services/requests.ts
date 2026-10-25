import {
  checkTransition,
  civilDate,
  isValidCivilDate,
  type CreateRequestInput,
  type RequestAction,
  type RequestCategory,
  transitionSchemas,
} from '@relais-maman/core'
import type { z } from 'zod'
import type { AppContext } from '../context.ts'
import type { Actor } from '../auth/sessions.ts'
import type { Prisma, RequestState } from '../generated/prisma/client.ts'
import { VersionConflictError } from '../db.ts'
import { requestScope } from '../authz/policy.ts'
import { AppError, conflict, forbidden, notFound, unprocessable } from '../http/errors.ts'
import { latestConsent, notifyAccount, notifyBeneficiary } from './notifications.ts'

type Tx = Prisma.TransactionClient
type ActorRole = Actor['role'] | 'SYSTEM'

interface EventInput {
  requestId: string
  type: string
  actor: Actor | null
  fromState?: RequestState
  toState?: RequestState
  /** Jamais de texte libre de la femme ni de coordonnées ici. */
  data?: Prisma.InputJsonValue
}

export const recordEvent = (tx: Tx, e: EventInput) =>
  tx.requestEvent.create({
    data: {
      requestId: e.requestId,
      type: e.type,
      actorId: e.actor?.accountId ?? null,
      actorRole: e.actor?.role ?? 'SYSTEM',
      fromState: e.fromState,
      toState: e.toState,
      data: e.data,
    },
  })

/** Incrémente la version SI elle est encore celle attendue ; sinon conflit (pas d'écrasement silencieux). */
async function bumpVersion(tx: Tx, requestId: string, expectedVersion: number, data: Prisma.RequestUncheckedUpdateManyInput = {}) {
  const res = await tx.request.updateMany({
    where: { id: requestId, version: expectedVersion },
    data: { ...data, version: { increment: 1 } },
  })
  if (res.count !== 1) throw new VersionConflictError()
}

async function loadScoped(tx: Tx, actor: Actor, requestId: string) {
  const request = await tx.request.findFirst({ where: { id: requestId, ...requestScope(actor) } })
  if (!request) throw notFound()
  return request
}

// ─── Création par la bénéficiaire ──────────────────────────────────────────

export async function createRequest(ctx: AppContext, actor: Actor, input: CreateRequestInput) {
  if (actor.role !== 'BENEFICIARY' || !actor.beneficiaryId) throw forbidden()
  const beneficiaryId = actor.beneficiaryId

  return ctx.db.$transaction(async (tx) => {
    // Idempotence : un nouvel essai après coupure renvoie la demande déjà créée.
    const existing = await tx.request.findUnique({ where: { idempotencyKey: input.idempotencyKey } })
    if (existing) {
      if (existing.beneficiaryId !== beneficiaryId) throw conflict('Clé de requête déjà utilisée.', 'IDEMPOTENCY_KEY_REUSED')
      return { request: existing, duplicate: true }
    }

    const consentText = await tx.consentText.findFirst({
      where: { purpose: 'TRANSMIT_REQUEST', version: input.transmissionConsentVersion },
    })
    if (!consentText) throw unprocessable('Le texte d’accord affiché n’est plus à jour. Rechargez la page.', 'CONSENT_TEXT_UNKNOWN')

    const beneficiary = await tx.beneficiary.findUniqueOrThrow({ where: { id: beneficiaryId } })

    if (input.appointmentId) {
      const appointment = await tx.appointment.findFirst({
        where: { id: input.appointmentId, beneficiaryId, status: 'SCHEDULED' },
      })
      if (!appointment) throw unprocessable('Choisissez un rendez-vous encore à venir.', 'APPOINTMENT_INVALID')
      const open = await tx.request.findFirst({
        where: { appointmentId: input.appointmentId, state: { notIn: ['CARE_VERIFIED', 'CLOSED_WITHOUT_CARE'] } },
      })
      if (open) throw conflict('Une demande est déjà ouverte pour ce rendez-vous. Votre agent peut la retrouver.', 'DUPLICATE_OPEN_REQUEST')
    }

    if (input.audioId) {
      const audio = await tx.audioAsset.findFirst({ where: { id: input.audioId, beneficiaryId, deletedAt: null, request: null } })
      if (!audio) throw unprocessable('Le message audio n’est plus disponible. Enregistrez-le à nouveau ou écrivez votre besoin.', 'AUDIO_INVALID')
    }

    const suggestion = input.text.length >= 2 ? ctx.classifier.suggest(input.text, input.locale) : null
    let category: RequestCategory | null = null
    let categorySource: 'BENEFICIARY_CHOICE' | 'MODEL_SUGGESTION' | 'HEALTH_REVIEW_RULE' | 'NONE' = 'NONE'
    if (suggestion?.healthReviewCue) {
      // Le signal de reprise humaine prime sur le choix logistique : une personne lira d'abord.
      category = 'HEALTH_QUESTION'
      categorySource = 'HEALTH_REVIEW_RULE'
    } else if (input.category) {
      category = input.category
      categorySource = 'BENEFICIARY_CHOICE'
    } else if (suggestion?.suggestedCategory) {
      category = suggestion.suggestedCategory
      categorySource = 'MODEL_SUGGESTION'
    }

    // Audio dans une autre langue que le français : affectation à un agent de l'équipe qui la parle.
    let assignedAgentId: string | null = null
    if (input.audioId && input.locale !== 'fr') {
      const agent = await tx.account.findFirst({
        where: { role: 'AGENT', status: 'ACTIVE', teamId: beneficiary.teamId, spokenLanguages: { has: input.locale } },
        orderBy: { assignedRequests: { _count: 'asc' } },
      })
      assignedAgentId = agent?.id ?? null
    }

    const request = await tx.request.create({
      data: {
        idempotencyKey: input.idempotencyKey,
        beneficiaryId,
        teamId: beneficiary.teamId,
        appointmentId: input.appointmentId,
        category,
        categorySource,
        text: input.text,
        locale: input.locale,
        audioId: input.audioId,
        assignedAgentId,
      },
    })

    await tx.consent.create({
      data: { beneficiaryId, purpose: 'TRANSMIT_REQUEST', granted: true, textVersion: consentText.version, recordedById: actor.accountId },
    })

    if (suggestion) {
      await tx.modelSuggestion.create({
        data: {
          requestId: request.id,
          modelVersion: suggestion.modelVersion,
          ruleVersion: suggestion.ruleVersion,
          suggestedCategory: suggestion.suggestedCategory,
          topCategory: suggestion.topCategory,
          abstained: suggestion.abstained,
          abstentionReason: suggestion.abstentionReason,
          score: suggestion.score,
          recognizedTokens: suggestion.recognizedTokens,
          healthReviewCue: suggestion.healthReviewCue,
        },
      })
    }

    await recordEvent(tx, {
      requestId: request.id,
      type: 'REQUEST_RECEIVED',
      actor,
      toState: 'RECEIVED',
      data: { categorySource, hasAudio: Boolean(input.audioId), consentVersion: consentText.version },
    })
    if (assignedAgentId) await notifyAccount(tx, assignedAgentId, 'AGENT_NEW_REQUEST', `req:${request.id}:new`)
    return { request, duplicate: false }
  })
}

// ─── Actions de l'agent hors transition d'état ─────────────────────────────

/** Ouverture du dossier par un agent : horodatage « consulté », sans changer la version. */
export async function markViewed(ctx: AppContext, actor: Actor, requestId: string) {
  if (actor.role !== 'AGENT') return
  await ctx.db.$transaction(async (tx) => {
    const request = await loadScoped(tx, actor, requestId)
    if (request.firstViewedAt) return
    await tx.request.update({ where: { id: requestId }, data: { firstViewedAt: ctx.now() } })
    await recordEvent(tx, { requestId, type: 'VIEWED_BY_AGENT', actor })
  })
}

export async function decideCategory(
  ctx: AppContext, actor: Actor, requestId: string,
  input: { expectedVersion: number; category: RequestCategory; note?: string },
) {
  if (actor.role !== 'AGENT') throw forbidden()
  return ctx.db.$transaction(async (tx) => {
    const request = await loadScoped(tx, actor, requestId)
    if (['CARE_VERIFIED', 'CLOSED_WITHOUT_CARE'].includes(request.state)) throw unprocessable('Ce dossier est clos.', 'REQUEST_CLOSED')
    await bumpVersion(tx, requestId, input.expectedVersion, { category: input.category, categorySource: 'AGENT_DECISION' })
    await tx.modelSuggestion.updateMany({
      where: { requestId },
      data: { finalCategory: input.category, decidedById: actor.accountId, decidedAt: ctx.now() },
    })
    await recordEvent(tx, {
      requestId, type: 'CATEGORY_DECIDED', actor,
      data: { from: request.category, to: input.category, previousSource: request.categorySource },
    })
  })
}

export async function recordAction(
  ctx: AppContext, actor: Actor, requestId: string,
  input: { expectedVersion: number; description: string; cost: { status: 'TO_VERIFY' } | { status: 'KNOWN'; amountXof: number; source: string } },
) {
  if (actor.role !== 'AGENT') throw forbidden()
  return ctx.db.$transaction(async (tx) => {
    const request = await loadScoped(tx, actor, requestId)
    if (!['UNDER_REVIEW', 'ACTION_AGREED'].includes(request.state)) {
      throw unprocessable('Prenez d’abord la demande en charge pour enregistrer une action.', 'INVALID_STATE')
    }
    await bumpVersion(tx, requestId, input.expectedVersion)
    const action = await tx.action.create({
      data: {
        requestId,
        agentId: actor.accountId,
        description: input.description,
        costStatus: input.cost.status,
        costAmountXof: input.cost.status === 'KNOWN' ? input.cost.amountXof : null,
        costSource: input.cost.status === 'KNOWN' ? input.cost.source : null,
      },
    })
    await recordEvent(tx, { requestId, type: 'ACTION_RECORDED', actor, data: { costStatus: input.cost.status } })
    return action
  })
}

export async function proposeSlot(
  ctx: AppContext, actor: Actor, requestId: string,
  input: { expectedVersion: number; facilityId: string; startsAt: string; note?: string },
) {
  if (actor.role !== 'AGENT') throw forbidden()
  const startsAt = new Date(input.startsAt)
  if (startsAt <= ctx.now()) throw unprocessable('Le créneau proposé doit être dans le futur.', 'SLOT_IN_PAST')

  return ctx.db.$transaction(async (tx) => {
    const request = await loadScoped(tx, actor, requestId)
    if (request.state !== 'UNDER_REVIEW') throw unprocessable('Un créneau se propose pendant l’examen de la demande.', 'INVALID_STATE')
    if (request.category === 'HEALTH_QUESTION') {
      throw unprocessable('Question de santé : une reprise humaine est nécessaire avant toute organisation. Changez la catégorie après examen, ou orientez vers un professionnel.', 'HEALTH_REVIEW_REQUIRED')
    }
    const facility = await tx.healthFacility.findUnique({ where: { id: input.facilityId } })
    if (!facility) throw unprocessable('Structure inconnue.', 'FACILITY_UNKNOWN')

    await bumpVersion(tx, requestId, input.expectedVersion, request.firstHumanResponseAt ? {} : { firstHumanResponseAt: ctx.now() })
    await tx.slotProposal.updateMany({
      where: { requestId, status: { in: ['PROPOSED', 'ALTERNATIVE_REQUESTED'] } },
      data: { status: 'SUPERSEDED' },
    })
    const slot = await tx.slotProposal.create({
      data: { requestId, facilityId: input.facilityId, startsAt, proposedById: actor.accountId, note: input.note },
    })
    await recordEvent(tx, { requestId, type: 'SLOT_PROPOSED', actor, data: { slotId: slot.id, startsAt: startsAt.toISOString() } })
    await notifyBeneficiary(tx, request.beneficiaryId, 'SLOT_PROPOSED', `slot:${slot.id}`)
    return slot
  })
}

export async function respondSlot(
  ctx: AppContext, actor: Actor, slotId: string,
  input: { response: 'ACCEPT' | 'DECLINE' | 'ASK_OTHER'; comment?: string },
) {
  if (actor.role !== 'BENEFICIARY' || !actor.beneficiaryId) throw forbidden()
  return ctx.db.$transaction(async (tx) => {
    const slot = await tx.slotProposal.findFirst({
      where: { id: slotId, request: { beneficiaryId: actor.beneficiaryId! } },
      include: { request: true },
    })
    if (!slot) throw notFound()
    if (slot.status !== 'PROPOSED') throw unprocessable('Ce créneau n’attend plus de réponse.', 'SLOT_NOT_PENDING')
    const status = input.response === 'ACCEPT' ? 'ACCEPTED' : input.response === 'DECLINE' ? 'DECLINED' : 'ALTERNATIVE_REQUESTED'
    await bumpVersion(tx, slot.requestId, slot.request.version)
    await tx.slotProposal.update({
      where: { id: slotId },
      data: { status, respondedAt: ctx.now(), beneficiaryComment: input.comment },
    })
    await recordEvent(tx, { requestId: slot.requestId, type: `SLOT_${status}`, actor, data: { slotId } })
    if (slot.request.assignedAgentId) await notifyAccount(tx, slot.request.assignedAgentId, 'REQUEST_UPDATED', `slot:${slotId}:${status}`)
    return { status }
  })
}

/** Confirmation d'un créneau par la structure : référent habilité de CETTE structure seulement. */
export async function confirmSlotByFacility(ctx: AppContext, actor: Actor, slotId: string) {
  if (actor.role !== 'FACILITY_REFERENT' || !actor.facilityId) throw forbidden()
  if (!actor.canConfirmCare) throw new AppError(403, 'NOT_AUTHORIZED_TO_CONFIRM', 'Votre compte n’est pas habilité à confirmer les créneaux.')
  return ctx.db.$transaction(async (tx) => {
    const slot = await tx.slotProposal.findFirst({ where: { id: slotId, facilityId: actor.facilityId! }, include: { request: true } })
    if (!slot) throw notFound()
    if (slot.status !== 'ACCEPTED') throw unprocessable('Seul un créneau accepté par la femme peut être confirmé par la structure.', 'SLOT_NOT_ACCEPTED')
    await bumpVersion(tx, slot.requestId, slot.request.version)
    await tx.slotProposal.update({
      where: { id: slotId },
      data: { status: 'CONFIRMED_BY_FACILITY', facilityConfirmedById: actor.accountId, facilityConfirmedAt: ctx.now() },
    })
    await recordEvent(tx, { requestId: slot.requestId, type: 'SLOT_CONFIRMED_BY_FACILITY', actor, data: { slotId } })
    await notifyBeneficiary(tx, slot.request.beneficiaryId, 'REQUEST_UPDATED', `slot:${slotId}:confirmed`)
  })
}

export async function reassign(
  ctx: AppContext, actor: Actor, requestId: string,
  input: { expectedVersion: number; agentId: string; reason: string },
) {
  if (actor.role !== 'AGENT') throw forbidden()
  return ctx.db.$transaction(async (tx) => {
    const request = await loadScoped(tx, actor, requestId)
    const target = await tx.account.findFirst({
      where: { id: input.agentId, role: 'AGENT', status: 'ACTIVE', teamId: request.teamId },
    })
    if (!target) throw unprocessable('Choisissez un agent actif de votre équipe.', 'AGENT_NOT_IN_TEAM')
    await bumpVersion(tx, requestId, input.expectedVersion, { assignedAgentId: target.id })
    await recordEvent(tx, { requestId, type: 'REASSIGNED', actor, data: { toAgentId: target.id, reason: input.reason } })
    await notifyAccount(tx, target.id, 'AGENT_NEW_REQUEST', `req:${requestId}:reassign:${input.expectedVersion}`)
  })
}

export async function sendMessage(ctx: AppContext, actor: Actor, requestId: string, body: string) {
  if (actor.role !== 'AGENT' && actor.role !== 'BENEFICIARY') throw forbidden()
  return ctx.db.$transaction(async (tx) => {
    const request = await loadScoped(tx, actor, requestId)
    const toBeneficiary = actor.role === 'AGENT'
    const message = await tx.message.create({
      data: { requestId, authorId: actor.accountId, direction: toBeneficiary ? 'TO_BENEFICIARY' : 'FROM_BENEFICIARY', body },
    })
    if (toBeneficiary && !request.firstHumanResponseAt) {
      await tx.request.update({ where: { id: requestId }, data: { firstHumanResponseAt: ctx.now() } })
    }
    await recordEvent(tx, { requestId, type: toBeneficiary ? 'MESSAGE_TO_BENEFICIARY' : 'MESSAGE_FROM_BENEFICIARY', actor })
    if (toBeneficiary) await notifyBeneficiary(tx, request.beneficiaryId, 'NEW_MESSAGE', `msg:${message.id}`)
    else if (request.assignedAgentId) await notifyAccount(tx, request.assignedAgentId, 'NEW_MESSAGE', `msg:${message.id}`)
    return message
  })
}

// ─── Transitions d'état ────────────────────────────────────────────────────

type TransitionInput<A extends RequestAction> = z.infer<(typeof transitionSchemas)[A]>

function assertCareDate(ctx: AppContext, careDate: string, requestCreatedAt: Date) {
  if (!isValidCivilDate(careDate)) throw unprocessable('Date invalide.', 'INVALID_DATE')
  const today = civilDate(ctx.now(), ctx.timeZone)
  const created = civilDate(requestCreatedAt, ctx.timeZone)
  if (careDate > today) throw unprocessable('La date du soin ne peut pas être dans le futur.', 'DATE_IN_FUTURE')
  if (careDate < created) throw unprocessable('La date du soin ne peut pas précéder la demande.', 'DATE_BEFORE_REQUEST')
}

export async function transition<A extends RequestAction>(
  ctx: AppContext,
  actor: Actor | null,
  requestId: string,
  action: A,
  input: TransitionInput<A>,
) {
  const role: ActorRole = actor?.role ?? 'SYSTEM'

  return ctx.db.$transaction(async (tx) => {
    const request = actor ? await loadScoped(tx, actor, requestId) : await tx.request.findUnique({ where: { id: requestId } })
    if (!request) throw notFound()

    const check = checkTransition(request.state, action, role)
    if (!check.ok) {
      throw check.reason === 'FORBIDDEN_ROLE'
        ? forbidden()
        : unprocessable('Cette étape n’est pas possible à ce stade du dossier.', 'INVALID_TRANSITION')
    }
    if (input.expectedVersion !== request.version) throw new VersionConflictError()

    const now = ctx.now()
    const updates: Prisma.RequestUncheckedUpdateManyInput = { state: check.to }
    let eventData: Prisma.InputJsonValue = {}

    switch (action) {
      case 'START_REVIEW': {
        updates.assignedAgentId = request.assignedAgentId ?? actor!.accountId
        if (!request.firstViewedAt) updates.firstViewedAt = now
        break
      }
      case 'AGREE_ACTION': {
        const i = input as TransitionInput<'AGREE_ACTION'>
        if (!(await latestConsent(tx, request.beneficiaryId, 'TRANSMIT_REQUEST'))) {
          throw unprocessable('La femme a retiré son accord de transmission : la demande doit être clôturée.', 'CONSENT_WITHDRAWN')
        }
        if (request.category === 'HEALTH_QUESTION' || request.category === null) {
          throw unprocessable('Décidez d’abord de la catégorie après lecture. Une question de santé demande une reprise humaine, pas une organisation logistique.', 'CATEGORY_DECISION_REQUIRED')
        }
        if (request.categorySource === 'MODEL_SUGGESTION') {
          throw unprocessable('Confirmez ou corrigez la catégorie suggérée avant de continuer.', 'CATEGORY_DECISION_REQUIRED')
        }
        if ((await tx.action.count({ where: { requestId } })) === 0) {
          throw unprocessable('Enregistrez d’abord l’action concrète convenue.', 'ACTION_REQUIRED')
        }
        if (i.agreementObtainedBy === 'ACCEPTED_SLOT_IN_APP') {
          const accepted = await tx.slotProposal.count({ where: { requestId, status: { in: ['ACCEPTED', 'CONFIRMED_BY_FACILITY'] } } })
          if (!accepted) throw unprocessable('Aucun créneau n’a été accepté dans l’application.', 'NO_ACCEPTED_SLOT')
        } else if (!i.note || i.note.length < 3) {
          throw unprocessable('Notez brièvement comment l’accord de la femme a été obtenu.', 'AGREEMENT_NOTE_REQUIRED')
        }
        updates.actionAgreedAt = now
        if (!request.firstHumanResponseAt) updates.firstHumanResponseAt = now
        eventData = { agreementObtainedBy: i.agreementObtainedBy }
        break
      }
      case 'MARK_AWAITING_COMPLETION': {
        if (role === 'SYSTEM') {
          const due = await tx.slotProposal.count({
            where: { requestId, status: { in: ['ACCEPTED', 'CONFIRMED_BY_FACILITY'] }, startsAt: { lte: now } },
          })
          if (!due) throw unprocessable('Le créneau convenu n’est pas encore passé.', 'NOT_DUE')
        }
        break
      }
      case 'POSTPONE': {
        const i = input as TransitionInput<'POSTPONE'>
        await tx.slotProposal.updateMany({
          where: { requestId, status: { in: ['PROPOSED', 'ACCEPTED', 'CONFIRMED_BY_FACILITY', 'ALTERNATIVE_REQUESTED'] } },
          data: { status: 'SUPERSEDED' },
        })
        updates.actionAgreedAt = null
        eventData = { reason: i.reason }
        break
      }
      case 'DECLARE_CARE': {
        const i = input as TransitionInput<'DECLARE_CARE'>
        assertCareDate(ctx, i.careDate, request.createdAt)
        await tx.careDeclaration.create({
          data: { requestId, careDate: i.careDate, declaredById: actor!.accountId, declaredByRole: role },
        })
        eventData = { careDate: i.careDate, declaredOnBehalf: role !== 'BENEFICIARY' }
        break
      }
      case 'VERIFY_CARE':
      case 'CORRECT_VERIFICATION': {
        const i = input as TransitionInput<'VERIFY_CARE'> & { correctionReason?: string }
        assertCareDate(ctx, i.careDate, request.createdAt)
        assertVerificationSource(actor!, i.source)
        const created = await tx.careVerification.create({
          data: {
            requestId, careDate: i.careDate, source: i.source, method: i.method, note: i.note,
            verifiedById: actor!.accountId, verifiedByRole: role, correctionReason: i.correctionReason,
          },
        })
        if (action === 'CORRECT_VERIFICATION') {
          const current = await tx.careVerification.findFirst({
            where: { requestId, supersededById: null, revokedAt: null, id: { not: created.id } },
            orderBy: { createdAt: 'desc' },
          })
          if (!current) throw unprocessable('Aucune vérification active à corriger.', 'NO_ACTIVE_VERIFICATION')
          await tx.careVerification.update({ where: { id: current.id }, data: { supersededById: created.id } })
          eventData = { verificationId: created.id, supersedes: current.id, correctionReason: i.correctionReason ?? null }
        } else {
          eventData = { verificationId: created.id, source: i.source, method: i.method, careDate: i.careDate }
        }
        // Attention : ne JAMAIS passer `id: undefined` (Prisma ignorerait le filtre et toucherait
        // tous les rendez-vous). On ne met à jour que si un rendez-vous est rattaché.
        if (request.appointmentId) {
          await tx.appointment.update({ where: { id: request.appointmentId }, data: { status: 'DONE' } })
        }
        break
      }
      case 'REVOKE_VERIFICATION': {
        const i = input as TransitionInput<'REVOKE_VERIFICATION'>
        if (actor!.role === 'FACILITY_REFERENT' && !actor!.canConfirmCare) throw forbidden()
        const current = await tx.careVerification.findFirst({
          where: { requestId, supersededById: null, revokedAt: null },
          orderBy: { createdAt: 'desc' },
        })
        if (!current) throw unprocessable('Aucune vérification active à annuler.', 'NO_ACTIVE_VERIFICATION')
        await tx.careVerification.update({ where: { id: current.id }, data: { revokedAt: now, revokedReason: i.reason } })
        eventData = { verificationId: current.id, reason: i.reason }
        break
      }
      case 'CLOSE_WITHOUT_CARE': {
        const i = input as TransitionInput<'CLOSE_WITHOUT_CARE'>
        if (role === 'SYSTEM' && i.reason !== 'CONSENT_WITHDRAWN') throw forbidden()
        await tx.slotProposal.updateMany({
          where: { requestId, status: { in: ['PROPOSED', 'ACCEPTED', 'ALTERNATIVE_REQUESTED', 'CONFIRMED_BY_FACILITY'] } },
          data: { status: 'SUPERSEDED' },
        })
        updates.closedAt = now
        updates.closeReason = i.reason
        eventData = { reason: i.reason }
        break
      }
    }

    await bumpVersion(tx, requestId, request.version, updates)
    await recordEvent(tx, { requestId, type: action, actor, fromState: request.state, toState: check.to, data: eventData })

    if (['AGREE_ACTION', 'VERIFY_CARE', 'POSTPONE'].includes(action)) {
      await notifyBeneficiary(tx, request.beneficiaryId, 'REQUEST_UPDATED', `req:${requestId}:${action}:${request.version}`)
    }
    return tx.request.findUniqueOrThrow({ where: { id: requestId } })
  })
}

/** Une structure confirme ; un agent vérifie. Les deux sources ne sont jamais confondues. */
function assertVerificationSource(actor: Actor, source: 'FACILITY_CONFIRMATION' | 'AGENT_VERIFICATION') {
  if (actor.role === 'FACILITY_REFERENT') {
    if (!actor.canConfirmCare) throw new AppError(403, 'NOT_AUTHORIZED_TO_CONFIRM', 'Votre compte n’est pas habilité à confirmer un soin.')
    if (source !== 'FACILITY_CONFIRMATION') throw unprocessable('Une structure enregistre une confirmation de structure.', 'SOURCE_MISMATCH')
  } else if (actor.role === 'AGENT' && source !== 'AGENT_VERIFICATION') {
    throw unprocessable('Un agent enregistre une vérification d’agent, pas une confirmation de structure.', 'SOURCE_MISMATCH')
  }
}

