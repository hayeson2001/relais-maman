import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import {
  decideCategorySchema, messageSchema, proposeSlotSchema, reassignSchema, recordActionSchema,
  REQUEST_ACTIONS, REQUEST_CATEGORIES, SERVER_STATES, transitionSchemas, type RequestAction,
} from '@relais-maman/core'
import type { AppContext } from '../context.ts'
import { requireRole } from '../auth/guards.ts'
import { hashSecret, readableCode } from '../auth/secrets.ts'
import { revokeAllSessions } from '../auth/sessions.ts'
import { requestScope } from '../authz/policy.ts'
import { notFound, unprocessable } from '../http/errors.ts'
import type { Prisma } from '../generated/prisma/client.ts'
import {
  decideCategory, markViewed, proposeSlot, reassign, recordAction, sendMessage, transition,
} from '../services/requests.ts'
import { latestConsent } from '../services/notifications.ts'

const idParam = z.object({ id: z.uuid() })
const ACTIVATION_TTL_HOURS = 72

const listQuery = z.object({
  state: z.enum(SERVER_STATES).optional(),
  assigned: z.enum(['me', 'unassigned', 'all']).default('all'),
  category: z.enum(REQUEST_CATEGORIES).optional(),
  zoneId: z.uuid().optional(),
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
  open: z.enum(['true', 'false']).optional(),
})

const assistedSignupSchema = z.object({
  displayName: z.string().trim().min(2).max(60),
  activityLabel: z.string().trim().max(60).optional(),
  phoneE164: z.string().regex(/^\+\d{8,15}$/, 'Numéro au format international, ex. +228…').optional(),
  phoneIsShared: z.boolean().default(true),
  preferredLocale: z.string().min(2).max(8).default('fr'),
  children: z.array(z.object({ firstName: z.string().trim().min(1).max(40), birthYearMonth: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/) })).max(6).default([]),
  /** Accord de rappel recueilli en présence de la femme (facultatif). */
  callbackConsent: z.boolean().default(false),
  callbackConsentTextVersion: z.string().max(40).optional(),
})

const appointmentSchema = z.object({
  beneficiaryId: z.uuid(),
  childId: z.uuid().nullable().default(null),
  facilityId: z.uuid(),
  title: z.string().trim().min(3).max(120),
  startsAt: z.iso.datetime(),
})

/** Identifiant de connexion bénéficiaire : non prédictible, lisible, sans données personnelles. */
const newIdentifier = () => `RM-${readableCode(2)}`

export async function agentRoutes(app: FastifyInstance, ctx: AppContext) {
  const { db } = ctx

  app.get('/api/agent/requests', { schema: { querystring: listQuery, tags: ['agent'] } }, async (req) => {
    const actor = requireRole(req, 'AGENT')
    const q = listQuery.parse(req.query)
    const where: Prisma.RequestWhereInput = {
      ...requestScope(actor),
      ...(q.state ? { state: q.state } : {}),
      ...(q.open === 'true' ? { state: { notIn: ['CARE_VERIFIED', 'CLOSED_WITHOUT_CARE'] } } : {}),
      ...(q.category ? { category: q.category } : {}),
      ...(q.assigned === 'me' ? { assignedAgentId: actor.accountId } : q.assigned === 'unassigned' ? { assignedAgentId: null } : {}),
      ...(q.zoneId ? { beneficiary: { zoneId: q.zoneId } } : {}),
      ...(q.from || q.to
        ? { createdAt: { ...(q.from ? { gte: new Date(`${q.from}T00:00:00Z`) } : {}), ...(q.to ? { lt: new Date(new Date(`${q.to}T00:00:00Z`).getTime() + 86_400_000) } : {}) } }
        : {}),
    }
    const rows = await db.request.findMany({
      where,
      orderBy: { createdAt: 'asc' },
      take: 200,
      include: {
        beneficiary: { select: { account: { select: { displayName: true } }, zone: { select: { name: true } } } },
        assignedAgent: { select: { displayName: true } },
        suggestion: { select: { healthReviewCue: true, abstained: true } },
      },
    })
    return rows.map((r) => ({
      id: r.id,
      state: r.state,
      version: r.version,
      category: r.category,
      categorySource: r.categorySource,
      healthReviewCue: r.suggestion?.healthReviewCue ?? false,
      createdAt: r.createdAt,
      viewed: r.firstViewedAt !== null,
      beneficiary: r.beneficiary.account.displayName,
      zone: r.beneficiary.zone.name,
      assignedTo: r.assignedAgent?.displayName ?? null,
      hasAudio: r.audioId !== null,
      locale: r.locale,
    }))
  })

  app.get('/api/agent/requests/:id', { schema: { params: idParam, tags: ['agent'] } }, async (req) => {
    const actor = requireRole(req, 'AGENT')
    const { id } = idParam.parse(req.params)
    const r = await db.request.findFirst({
      where: { id, ...requestScope(actor) },
      include: {
        beneficiary: {
          include: {
            account: { select: { displayName: true } },
            zone: { select: { name: true } },
            children: true,
            contact: true,
            preferences: true,
          },
        },
        appointment: { include: { facility: { select: { name: true } } } },
        assignedAgent: { select: { id: true, displayName: true } },
        audio: { select: { id: true, durationSeconds: true, deletedAt: true, transcription: true, locale: true } },
        suggestion: true,
        actions: { orderBy: { createdAt: 'asc' } },
        slots: { include: { facility: { select: { name: true } } }, orderBy: { createdAt: 'asc' } },
        messages: { orderBy: { createdAt: 'asc' } },
        declarations: true,
        verifications: { orderBy: { createdAt: 'asc' } },
        events: { orderBy: { createdAt: 'asc' } },
      },
    })
    if (!r) throw notFound()
    await markViewed(ctx, actor, id)
    const [callbackConsent, transmitConsent] = await Promise.all([
      latestConsent(db, r.beneficiaryId, 'RECEIVE_CALLBACK'),
      latestConsent(db, r.beneficiaryId, 'TRANSMIT_REQUEST'),
    ])
    return { ...r, consents: { callback: callbackConsent, transmit: transmitConsent } }
  })

  app.post('/api/agent/requests/:id/transitions/:action', {
    schema: { params: z.object({ id: z.uuid(), action: z.enum(REQUEST_ACTIONS) }), tags: ['agent'] },
  }, async (req) => {
    const actor = requireRole(req, 'AGENT')
    const { id, action } = z.object({ id: z.uuid(), action: z.enum(REQUEST_ACTIONS) }).parse(req.params)
    const input = transitionSchemas[action as RequestAction].parse(req.body)
    const r = await transition(ctx, actor, id, action, input as never)
    return { id: r.id, state: r.state, version: r.version }
  })

  app.post('/api/agent/requests/:id/category', { schema: { params: idParam, body: decideCategorySchema, tags: ['agent'] } }, async (req) => {
    const actor = requireRole(req, 'AGENT')
    await decideCategory(ctx, actor, idParam.parse(req.params).id, decideCategorySchema.parse(req.body))
    return { saved: true }
  })

  app.post('/api/agent/requests/:id/actions', { schema: { params: idParam, body: recordActionSchema, tags: ['agent'] } }, async (req, reply) => {
    const actor = requireRole(req, 'AGENT')
    const a = await recordAction(ctx, actor, idParam.parse(req.params).id, recordActionSchema.parse(req.body))
    return reply.status(201).send({ id: a.id })
  })

  app.post('/api/agent/requests/:id/slots', { schema: { params: idParam, body: proposeSlotSchema, tags: ['agent'] } }, async (req, reply) => {
    const actor = requireRole(req, 'AGENT')
    const s = await proposeSlot(ctx, actor, idParam.parse(req.params).id, proposeSlotSchema.parse(req.body))
    return reply.status(201).send({ id: s.id })
  })

  app.post('/api/agent/requests/:id/messages', { schema: { params: idParam, body: messageSchema, tags: ['agent'] } }, async (req, reply) => {
    const actor = requireRole(req, 'AGENT')
    const m = await sendMessage(ctx, actor, idParam.parse(req.params).id, messageSchema.parse(req.body).body)
    return reply.status(201).send({ id: m.id })
  })

  app.post('/api/agent/requests/:id/reassign', { schema: { params: idParam, body: reassignSchema, tags: ['agent'] } }, async (req) => {
    const actor = requireRole(req, 'AGENT')
    await reassign(ctx, actor, idParam.parse(req.params).id, reassignSchema.parse(req.body))
    return { saved: true }
  })

  app.get('/api/agent/context', { schema: { tags: ['agent'] } }, async (req) => {
    const actor = requireRole(req, 'AGENT')
    const team = await db.team.findUniqueOrThrow({
      where: { id: actor.teamId! },
      include: { zone: { include: { facilities: { select: { id: true, name: true, isFictional: true } } } } },
    })
    const agents = await db.account.findMany({
      where: { teamId: actor.teamId!, role: 'AGENT', status: 'ACTIVE' },
      select: { id: true, displayName: true, spokenLanguages: true },
    })
    return { team: { id: team.id, name: team.name, zone: team.zone.name }, facilities: team.zone.facilities, agents, me: actor.accountId }
  })

  // ─── Bénéficiaires : inscription assistée et récupération supervisée ──────

  app.get('/api/agent/beneficiaries', { schema: { tags: ['agent'] } }, async (req) => {
    const actor = requireRole(req, 'AGENT')
    const rows = await db.beneficiary.findMany({
      where: { teamId: actor.teamId! },
      include: { account: { select: { displayName: true, loginId: true, status: true } }, children: true },
      orderBy: { createdAt: 'desc' },
    })
    return rows.map((b) => ({
      id: b.id, displayName: b.account.displayName, identifier: b.account.loginId, status: b.account.status,
      children: b.children.map((c) => ({ id: c.id, firstName: c.firstName })),
      deletionRequested: b.deletionRequestedAt !== null,
    }))
  })

  /**
   * Inscription assistée : pas d'e-mail requis. Renvoie UNE SEULE FOIS l'identifiant et le code
   * d'activation (stocké haché, 72 h, usage unique), à remettre en main propre.
   */
  app.post('/api/agent/beneficiaries', { schema: { body: assistedSignupSchema, tags: ['agent'] } }, async (req, reply) => {
    const actor = requireRole(req, 'AGENT')
    const body = assistedSignupSchema.parse(req.body)
    const team = await db.team.findUniqueOrThrow({ where: { id: actor.teamId! } })
    if (body.callbackConsent) {
      const text = await db.consentText.findFirst({ where: { purpose: 'RECEIVE_CALLBACK', version: body.callbackConsentTextVersion ?? '' } })
      if (!text) throw unprocessable('Version du texte d’accord de rappel inconnue.', 'CONSENT_TEXT_UNKNOWN')
    }
    const activationCode = readableCode(2)
    const codeHash = await hashSecret(activationCode)
    const expiresAt = new Date(ctx.now().getTime() + ACTIVATION_TTL_HOURS * 3_600_000)

    const created = await db.$transaction(async (tx) => {
      let identifier = newIdentifier()
      while (await tx.account.findUnique({ where: { loginId: identifier } })) identifier = newIdentifier()
      const account = await tx.account.create({
        data: { role: 'BENEFICIARY', loginId: identifier, displayName: body.displayName, status: 'PENDING_ACTIVATION' },
      })
      const beneficiary = await tx.beneficiary.create({
        data: {
          accountId: account.id, teamId: team.id, zoneId: team.zoneId, preferredLocale: body.preferredLocale,
          activityLabel: body.activityLabel, createdById: actor.accountId,
          contact: { create: { phoneE164: body.phoneE164, phoneIsShared: body.phoneIsShared } },
          preferences: { create: { channels: ['IN_APP'] } },
          children: { create: body.children },
        },
      })
      if (body.callbackConsent) {
        await tx.consent.create({
          data: {
            beneficiaryId: beneficiary.id, purpose: 'RECEIVE_CALLBACK', granted: true,
            textVersion: body.callbackConsentTextVersion!, recordedById: actor.accountId, assisted: true,
          },
        })
      }
      await tx.activationCode.create({
        data: { accountId: account.id, codeHash, purpose: 'FIRST_ACTIVATION', issuedById: actor.accountId, expiresAt },
      })
      await tx.auditLog.create({ data: { actorId: actor.accountId, action: 'beneficiary.assisted_signup', targetType: 'Beneficiary', targetId: beneficiary.id } })
      return { beneficiaryId: beneficiary.id, identifier }
    })
    return reply.status(201).send({ ...created, activationCode, expiresAt, shownOnce: true })
  })

  /** Récupération supervisée : nouveau code à usage unique, sessions et anciens codes révoqués. */
  app.post('/api/agent/beneficiaries/:id/recovery', { schema: { params: idParam, tags: ['agent'] } }, async (req) => {
    const actor = requireRole(req, 'AGENT')
    const beneficiary = await db.beneficiary.findFirst({ where: { id: idParam.parse(req.params).id, teamId: actor.teamId! } })
    if (!beneficiary) throw notFound()
    const activationCode = readableCode(2)
    const expiresAt = new Date(ctx.now().getTime() + ACTIVATION_TTL_HOURS * 3_600_000)
    await db.$transaction([
      db.activationCode.updateMany({ where: { accountId: beneficiary.accountId, usedAt: null, revokedAt: null }, data: { revokedAt: ctx.now() } }),
      db.activationCode.create({
        data: { accountId: beneficiary.accountId, codeHash: await hashSecret(activationCode), purpose: 'SUPERVISED_RECOVERY', issuedById: actor.accountId, expiresAt },
      }),
      db.auditLog.create({ data: { actorId: actor.accountId, action: 'beneficiary.supervised_recovery', targetType: 'Beneficiary', targetId: beneficiary.id } }),
    ])
    await revokeAllSessions(db, beneficiary.accountId)
    return { activationCode, expiresAt, shownOnce: true }
  })

  /** Rendez-vous saisi d'après une information fournie par la structure : jamais généré automatiquement. */
  app.post('/api/agent/appointments', { schema: { body: appointmentSchema, tags: ['agent'] } }, async (req, reply) => {
    const actor = requireRole(req, 'AGENT')
    const body = appointmentSchema.parse(req.body)
    const beneficiary = await db.beneficiary.findFirst({ where: { id: body.beneficiaryId, teamId: actor.teamId! }, include: { children: true } })
    if (!beneficiary) throw notFound()
    if (body.childId && !beneficiary.children.some((c) => c.id === body.childId)) throw unprocessable('Cet enfant n’est pas rattaché à cette femme.', 'CHILD_MISMATCH')
    const a = await db.appointment.create({
      data: { beneficiaryId: body.beneficiaryId, childId: body.childId, facilityId: body.facilityId, title: body.title, startsAt: new Date(body.startsAt), createdById: actor.accountId },
    })
    return reply.status(201).send({ id: a.id })
  })
}
