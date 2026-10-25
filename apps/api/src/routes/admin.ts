import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import type { AppContext } from '../context.ts'
import { requireStrongAdmin } from '../auth/guards.ts'
import { hashSecret, keyedDigest, randomToken } from '../auth/secrets.ts'
import { revokeAllSessions } from '../auth/sessions.ts'
import { notFound, unprocessable } from '../http/errors.ts'
import { computeMetrics } from '../services/metrics.ts'
import { connectorStatuses } from '../connectors/index.ts'

const idParam = z.object({ id: z.uuid() })

const createStaffSchema = z.discriminatedUnion('role', [
  z.object({ role: z.literal('AGENT'), loginId: z.string().trim().min(3).max(40), displayName: z.string().trim().min(2).max(60), teamId: z.uuid(), spokenLanguages: z.array(z.string().max(8)).default(['fr']) }),
  z.object({ role: z.literal('FACILITY_REFERENT'), loginId: z.string().trim().min(3).max(40), displayName: z.string().trim().min(2).max(60), facilityId: z.uuid(), canConfirmCare: z.boolean() }),
  z.object({ role: z.literal('ADMIN'), loginId: z.string().trim().min(3).max(40), displayName: z.string().trim().min(2).max(60) }),
])

const periodQuery = z.object({ from: z.iso.date().optional(), to: z.iso.date().optional() })

/**
 * Espace administrateur ADEC. Toutes les routes exigent la double vérification (TOTP) dans
 * la session. Pas d'accès au contenu individuel des demandes : comptes, référentiels,
 * registres, connecteurs et indicateurs agrégés.
 */
export async function adminRoutes(app: FastifyInstance, ctx: AppContext) {
  const { db, config } = ctx
  const audit = (actorId: string, action: string, targetType?: string, targetId?: string, data?: object) =>
    db.auditLog.create({ data: { actorId, action, targetType, targetId, data: data as never } })

  app.get('/api/admin/metrics', { schema: { querystring: periodQuery, tags: ['admin'] } }, async (req) => {
    requireStrongAdmin(req)
    const q = periodQuery.parse(req.query)
    const to = q.to ? new Date(new Date(`${q.to}T00:00:00Z`).getTime() + 86_400_000) : new Date(ctx.now().getTime() + 1)
    const from = q.from ? new Date(`${q.from}T00:00:00Z`) : new Date(to.getTime() - 30 * 86_400_000)
    return computeMetrics(db, from, to)
  })

  app.get('/api/admin/accounts', { schema: { tags: ['admin'] } }, async (req) => {
    requireStrongAdmin(req)
    return db.account.findMany({
      where: { role: { not: 'BENEFICIARY' } },
      select: {
        id: true, role: true, loginId: true, displayName: true, status: true, canConfirmCare: true, totpEnabled: true,
        spokenLanguages: true, team: { select: { name: true } }, facility: { select: { name: true } },
      },
      orderBy: [{ role: 'asc' }, { displayName: 'asc' }],
    })
  })

  /** Création d'un compte du personnel : mot de passe provisoire affiché une seule fois. */
  app.post('/api/admin/accounts', { schema: { body: createStaffSchema, tags: ['admin'] } }, async (req, reply) => {
    const actor = requireStrongAdmin(req)
    const body = createStaffSchema.parse(req.body)
    if (await db.account.findUnique({ where: { loginId: body.loginId } })) throw unprocessable('Cet identifiant existe déjà.', 'LOGIN_TAKEN')
    const temporaryPassword = randomToken(12)
    const account = await db.account.create({
      data: {
        role: body.role,
        loginId: body.loginId,
        displayName: body.displayName,
        secretHash: await hashSecret(temporaryPassword),
        status: 'ACTIVE',
        teamId: body.role === 'AGENT' ? body.teamId : null,
        spokenLanguages: body.role === 'AGENT' ? body.spokenLanguages : [],
        facilityId: body.role === 'FACILITY_REFERENT' ? body.facilityId : null,
        canConfirmCare: body.role === 'FACILITY_REFERENT' ? body.canConfirmCare : false,
      },
    })
    await audit(actor.accountId, 'account.created', 'Account', account.id, { role: body.role })
    return reply.status(201).send({ id: account.id, temporaryPassword, shownOnce: true })
  })

  app.post('/api/admin/accounts/:id/disable', { schema: { params: idParam, tags: ['admin'] } }, async (req) => {
    const actor = requireStrongAdmin(req)
    const { id } = idParam.parse(req.params)
    if (id === actor.accountId) throw unprocessable('Vous ne pouvez pas désactiver votre propre compte.', 'SELF_DISABLE')
    await db.account.update({ where: { id }, data: { status: 'DISABLED' } })
    await revokeAllSessions(db, id)
    await audit(actor.accountId, 'account.disabled', 'Account', id)
    return { disabled: true }
  })

  app.post('/api/admin/accounts/:id/unlock', { schema: { params: idParam, tags: ['admin'] } }, async (req) => {
    const actor = requireStrongAdmin(req)
    const { id } = idParam.parse(req.params)
    const account = await db.account.findUnique({ where: { id } })
    if (!account || account.role === 'BENEFICIARY') throw notFound() // bénéficiaires : récupération supervisée par un agent
    await db.account.update({ where: { id }, data: { status: 'ACTIVE', failedAttempts: 0, lockedUntil: null } })
    await audit(actor.accountId, 'account.unlocked', 'Account', id)
    return { unlocked: true }
  })

  app.get('/api/admin/referentials', { schema: { tags: ['admin'] } }, async (req) => {
    requireStrongAdmin(req)
    const [countries, zones, teams, facilities] = await Promise.all([
      db.country.findMany(),
      db.zone.findMany({ select: { id: true, name: true, countryCode: true, isFictional: true } }),
      db.team.findMany({ select: { id: true, name: true, zone: { select: { name: true } }, organization: { select: { name: true } } } }),
      db.healthFacility.findMany({ select: { id: true, name: true, isFictional: true, zone: { select: { name: true } } } }),
    ])
    return { countries, zones, teams, facilities }
  })

  app.post('/api/admin/facilities', {
    schema: { body: z.object({ name: z.string().trim().min(3).max(120), zoneId: z.uuid() }), tags: ['admin'] },
  }, async (req, reply) => {
    const actor = requireStrongAdmin(req)
    const body = z.object({ name: z.string().trim().min(3).max(120), zoneId: z.uuid() }).parse(req.body)
    // Toute structure créée reste « fictive » tant qu'aucun partenariat n'est formalisé.
    const f = await db.healthFacility.create({ data: { ...body, isFictional: true } })
    await audit(actor.accountId, 'facility.created', 'HealthFacility', f.id)
    return reply.status(201).send({ id: f.id })
  })

  /** Registre des langues et des contenus audio : les manques sont visibles ici, pas cachés. */
  app.get('/api/admin/languages', { schema: { tags: ['admin'] } }, async (req) => {
    requireStrongAdmin(req)
    const languages = await db.language.findMany({ include: { audioContents: { orderBy: [{ messageKey: 'asc' }, { version: 'desc' }] } } })
    return languages.map((l) => ({
      code: l.code, name: l.name, nativeName: l.nativeName, uiAvailable: l.uiAvailable, uiValidation: l.uiValidation,
      audio: {
        total: l.audioContents.length,
        validated: l.audioContents.filter((c) => c.validation === 'VALIDATED' && c.storageKey).length,
        missing: l.audioContents.filter((c) => c.validation === 'MISSING' || !c.storageKey).length,
        items: l.audioContents.map((c) => ({
          messageKey: c.messageKey, version: c.version, transcript: c.transcript, hasFile: Boolean(c.storageKey),
          validation: c.validation, provenance: c.provenance, validatedAt: c.validatedAt, validatedBy: c.validatedBy,
        })),
      },
    }))
  })

  app.get('/api/admin/connectors', { schema: { tags: ['admin'] } }, async (req) => {
    requireStrongAdmin(req)
    const recent = await db.notification.findMany({
      where: { channel: { not: 'IN_APP' } },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: { id: true, channel: true, templateKey: true, status: true, provider: true, attempts: true, lastError: true, createdAt: true, sentAt: true, costMicroUnits: true, costCurrency: true },
    })
    return { connectors: connectorStatuses(config), outbox: recent }
  })

  /**
   * Export PSEUDONYMISÉ et limité : pas de nom, de texte libre, de téléphone ni d'audio.
   * L'identifiant de la femme est remplacé par une empreinte stable propre à l'instance.
   */
  app.get('/api/admin/export/requests.csv', { schema: { querystring: periodQuery, tags: ['admin'] } }, async (req, reply) => {
    const actor = requireStrongAdmin(req)
    const q = periodQuery.parse(req.query)
    const from = q.from ? new Date(`${q.from}T00:00:00Z`) : new Date(ctx.now().getTime() - 90 * 86_400_000)
    const to = q.to ? new Date(new Date(`${q.to}T00:00:00Z`).getTime() + 86_400_000) : new Date(ctx.now().getTime() + 1)
    const rows = await db.request.findMany({
      where: { createdAt: { gte: from, lt: to } },
      take: 5000,
      select: {
        beneficiaryId: true, createdAt: true, state: true, category: true, categorySource: true, closeReason: true,
        firstHumanResponseAt: true, actionAgreedAt: true, beneficiary: { select: { zone: { select: { name: true } } } },
      },
    })
    const h = (a: Date, b: Date | null) => (b ? ((b.getTime() - a.getTime()) / 3_600_000).toFixed(1) : '')
    const lines = ['pseudo_id,jour,zone,etat,categorie,origine_categorie,motif_cloture,delai_premiere_reponse_h,delai_action_h']
    for (const r of rows) {
      lines.push([
        keyedDigest(config.APP_SECRET, `export:${r.beneficiaryId}`).slice(0, 16),
        r.createdAt.toISOString().slice(0, 10),
        JSON.stringify(r.beneficiary.zone.name),
        r.state, r.category ?? '', r.categorySource, r.closeReason ?? '',
        h(r.createdAt, r.firstHumanResponseAt), h(r.createdAt, r.actionAgreedAt),
      ].join(','))
    }
    await audit(actor.accountId, 'export.requests', undefined, undefined, { rows: rows.length, from: from.toISOString(), to: to.toISOString() })
    reply.header('content-type', 'text/csv; charset=utf-8').header('cache-control', 'no-store')
    return lines.join('\n') + '\n'
  })

  app.get('/api/admin/deletion-requests', { schema: { tags: ['admin'] } }, async (req) => {
    requireStrongAdmin(req)
    return db.deletionRequest.findMany({ orderBy: { requestedAt: 'desc' }, take: 100 })
  })
}
