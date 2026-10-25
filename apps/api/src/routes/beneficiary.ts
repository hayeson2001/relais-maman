import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import {
  consentUpdateSchema, contactPreferencesSchema, createRequestSchema, messageSchema, respondSlotSchema, transitionSchemas,
} from '@relais-maman/core'
import type { AppContext } from '../context.ts'
import { requireRole } from '../auth/guards.ts'
import { notFound } from '../http/errors.ts'
import { createRequest, respondSlot, sendMessage, transition } from '../services/requests.ts'
import { currentConsents, updateConsent } from '../services/consents.ts'

const idParam = z.object({ id: z.uuid() })

function ageInMonths(birthYearMonth: string, now: Date) {
  const [y, m] = birthYearMonth.split('-').map(Number) as [number, number]
  return (now.getUTCFullYear() - y) * 12 + (now.getUTCMonth() + 1 - m)
}

/** Espace bénéficiaire : uniquement ses propres données (contrôle par requestScope / beneficiaryId). */
export async function beneficiaryRoutes(app: FastifyInstance, ctx: AppContext) {
  const { db } = ctx

  app.get('/api/me/overview', { schema: { tags: ['bénéficiaire'] } }, async (req) => {
    const actor = requireRole(req, 'BENEFICIARY')
    const beneficiaryId = actor.beneficiaryId!
    const now = ctx.now()
    const [beneficiary, appointments, requests, consents] = await Promise.all([
      db.beneficiary.findUniqueOrThrow({
        where: { id: beneficiaryId },
        include: { children: true, preferences: true, account: { select: { displayName: true, loginId: true } } },
      }),
      db.appointment.findMany({
        where: { beneficiaryId, status: 'SCHEDULED', startsAt: { gte: new Date(now.getTime() - 86_400_000) } },
        include: { facility: { select: { name: true } }, child: { select: { firstName: true } } },
        orderBy: { startsAt: 'asc' },
      }),
      db.request.findMany({
        where: { beneficiaryId },
        orderBy: { createdAt: 'desc' },
        take: 20,
        include: {
          slots: { where: { status: { not: 'SUPERSEDED' } }, include: { facility: { select: { name: true } } }, orderBy: { createdAt: 'desc' } },
          messages: { where: { direction: 'TO_BENEFICIARY' }, orderBy: { createdAt: 'desc' }, take: 1 },
          declarations: { select: { careDate: true } },
          verifications: { where: { supersededById: null, revokedAt: null }, select: { careDate: true, source: true } },
        },
      }),
      currentConsents(ctx, beneficiaryId),
    ])

    return {
      displayName: beneficiary.account.displayName,
      identifier: beneficiary.account.loginId,
      preferredLocale: beneficiary.preferredLocale,
      children: beneficiary.children.map((c) => ({ id: c.id, firstName: c.firstName, ageMonths: ageInMonths(c.birthYearMonth, now) })),
      preferences: beneficiary.preferences,
      consents,
      appointments: appointments.map((a) => ({
        id: a.id, title: a.title, startsAt: a.startsAt, facility: a.facility.name, forChild: a.child?.firstName ?? null,
      })),
      requests: requests.map((r) => ({
        id: r.id,
        state: r.state,
        version: r.version,
        category: r.category,
        createdAt: r.createdAt,
        // « transmis au service » vs « consulté par un agent » : deux informations distinctes.
        viewedByAgent: r.firstViewedAt !== null,
        slots: r.slots.map((s) => ({ id: s.id, startsAt: s.startsAt, status: s.status, facility: s.facility.name, note: s.note })),
        lastMessage: r.messages[0] ? { body: r.messages[0].body, at: r.messages[0].createdAt } : null,
        declaredCareDate: r.declarations.at(-1)?.careDate ?? null,
        verification: r.verifications[0] ?? null,
      })),
      timeZone: ctx.timeZone,
    }
  })

  app.get('/api/me/requests/:id', { schema: { params: idParam, tags: ['bénéficiaire'] } }, async (req) => {
    const actor = requireRole(req, 'BENEFICIARY')
    const { id } = idParam.parse(req.params)
    const request = await db.request.findFirst({
      where: { id, beneficiaryId: actor.beneficiaryId! },
      include: {
        slots: { include: { facility: { select: { name: true } } }, orderBy: { createdAt: 'asc' } },
        messages: { orderBy: { createdAt: 'asc' } },
        declarations: true,
        verifications: { where: { supersededById: null, revokedAt: null }, select: { careDate: true, source: true, createdAt: true } },
        events: { orderBy: { createdAt: 'asc' }, select: { type: true, createdAt: true, toState: true } },
      },
    })
    if (!request) throw notFound()
    await db.message.updateMany({ where: { requestId: id, direction: 'TO_BENEFICIARY', readAt: null }, data: { readAt: ctx.now() } })
    return {
      ...request,
      viewedByAgent: request.firstViewedAt !== null,
      messages: request.messages.map((m) => ({ id: m.id, body: m.body, fromMe: m.direction === 'FROM_BENEFICIARY', at: m.createdAt })),
    }
  })

  app.post('/api/me/requests', { schema: { body: createRequestSchema, tags: ['bénéficiaire'] } }, async (req, reply) => {
    const actor = requireRole(req, 'BENEFICIARY')
    const { request, duplicate } = await createRequest(ctx, actor, createRequestSchema.parse(req.body))
    // Accusé serveur : la demande n'est « transmise » qu'à partir de cette réponse.
    return reply.status(duplicate ? 200 : 201).send({
      id: request.id, state: request.state, version: request.version, createdAt: request.createdAt, duplicate,
    })
  })

  app.post('/api/me/slots/:id/respond', { schema: { params: idParam, body: respondSlotSchema, tags: ['bénéficiaire'] } }, async (req) => {
    const actor = requireRole(req, 'BENEFICIARY')
    return respondSlot(ctx, actor, idParam.parse(req.params).id, respondSlotSchema.parse(req.body))
  })

  app.post('/api/me/requests/:id/declare-care', { schema: { params: idParam, body: transitionSchemas.DECLARE_CARE, tags: ['bénéficiaire'] } }, async (req) => {
    const actor = requireRole(req, 'BENEFICIARY')
    const r = await transition(ctx, actor, idParam.parse(req.params).id, 'DECLARE_CARE', transitionSchemas.DECLARE_CARE.parse(req.body))
    return { id: r.id, state: r.state, version: r.version }
  })

  app.post('/api/me/requests/:id/messages', { schema: { params: idParam, body: messageSchema, tags: ['bénéficiaire'] } }, async (req, reply) => {
    const actor = requireRole(req, 'BENEFICIARY')
    const m = await sendMessage(ctx, actor, idParam.parse(req.params).id, messageSchema.parse(req.body).body)
    return reply.status(201).send({ id: m.id })
  })

  app.put('/api/me/preferences', { schema: { body: contactPreferencesSchema, tags: ['bénéficiaire'] } }, async (req) => {
    const actor = requireRole(req, 'BENEFICIARY')
    const body = contactPreferencesSchema.parse(req.body)
    const languageOk = await db.language.findFirst({ where: { code: body.preferredLocale, uiAvailable: true } })
    const beneficiaryId = actor.beneficiaryId!
    await db.$transaction([
      db.contactPreference.upsert({
        where: { beneficiaryId },
        create: { beneficiaryId, channels: body.channels, callWindowStart: body.callWindowStart, callWindowEnd: body.callWindowEnd },
        update: { channels: body.channels, callWindowStart: body.callWindowStart, callWindowEnd: body.callWindowEnd },
      }),
      ...(languageOk ? [db.beneficiary.update({ where: { id: beneficiaryId }, data: { preferredLocale: body.preferredLocale } })] : []),
    ])
    return { saved: true, localeApplied: Boolean(languageOk) }
  })

  app.post('/api/me/consents', { schema: { body: consentUpdateSchema, tags: ['bénéficiaire'] } }, async (req) => {
    const actor = requireRole(req, 'BENEFICIARY')
    return updateConsent(ctx, actor, consentUpdateSchema.parse(req.body))
  })

  /** Demande de suppression : procédure supervisée (docs/confidentialite.md), pas d'effacement immédiat silencieux. */
  app.post('/api/me/deletion-request', { schema: { tags: ['bénéficiaire'] } }, async (req, reply) => {
    const actor = requireRole(req, 'BENEFICIARY')
    const existing = await db.deletionRequest.findFirst({ where: { beneficiaryId: actor.beneficiaryId!, status: 'REQUESTED' } })
    if (!existing) {
      await db.$transaction([
        db.deletionRequest.create({ data: { beneficiaryId: actor.beneficiaryId! } }),
        db.beneficiary.update({ where: { id: actor.beneficiaryId! }, data: { deletionRequestedAt: ctx.now() } }),
        db.auditLog.create({ data: { actorId: actor.accountId, action: 'beneficiary.deletion_requested', targetType: 'Beneficiary', targetId: actor.beneficiaryId! } }),
      ])
    }
    return reply.status(202).send({ requested: true })
  })

  app.get('/api/me/notifications', { schema: { tags: ['bénéficiaire'] } }, async (req) => {
    const actor = requireRole(req, 'BENEFICIARY')
    return db.notification.findMany({
      where: { recipientId: actor.accountId, channel: 'IN_APP' },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: { id: true, templateKey: true, createdAt: true },
    })
  })
}
