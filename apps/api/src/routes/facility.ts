import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { transitionSchemas } from '@relais-maman/core'
import type { AppContext } from '../context.ts'
import { requireRole } from '../auth/guards.ts'
import { facilityRequestSelect, requestScope } from '../authz/policy.ts'
import { confirmSlotByFacility, transition } from '../services/requests.ts'

const idParam = z.object({ id: z.uuid() })
const FACILITY_ACTIONS = ['VERIFY_CARE', 'CORRECT_VERIFICATION', 'REVOKE_VERIFICATION'] as const

/**
 * Espace référent : uniquement les demandes ayant un créneau dans SA structure, en vue
 * réduite (ni texte libre, ni audio, ni téléphone, ni messages de la femme).
 */
export async function facilityRoutes(app: FastifyInstance, ctx: AppContext) {
  const { db } = ctx

  app.get('/api/facility/requests', { schema: { tags: ['structure'] } }, async (req) => {
    const actor = requireRole(req, 'FACILITY_REFERENT')
    const rows = await db.request.findMany({
      where: requestScope(actor),
      select: facilityRequestSelect,
      orderBy: { createdAt: 'desc' },
      take: 200,
    })
    return {
      canConfirmCare: actor.canConfirmCare,
      requests: rows.map((r) => ({
        id: r.id,
        state: r.state,
        version: r.version,
        category: r.category,
        beneficiary: r.beneficiary.account.displayName,
        // Seuls les créneaux de CETTE structure sont exposés.
        slots: r.slots.filter((s) => s.facilityId === actor.facilityId).map((s) => ({
          id: s.id, startsAt: s.startsAt, status: s.status, facilityConfirmedAt: s.facilityConfirmedAt,
        })),
        declaredCareDates: r.declarations.map((d) => d.careDate),
        verifications: r.verifications.map((v) => ({
          id: v.id, careDate: v.careDate, source: v.source, method: v.method,
          superseded: v.supersededById !== null, revoked: v.revokedAt !== null, createdAt: v.createdAt,
        })),
      })),
    }
  })

  app.post('/api/facility/slots/:id/confirm', { schema: { params: idParam, tags: ['structure'] } }, async (req) => {
    const actor = requireRole(req, 'FACILITY_REFERENT')
    await confirmSlotByFacility(ctx, actor, idParam.parse(req.params).id)
    return { confirmed: true }
  })

  app.post('/api/facility/requests/:id/transitions/:action', {
    schema: { params: z.object({ id: z.uuid(), action: z.enum(FACILITY_ACTIONS) }), tags: ['structure'] },
  }, async (req) => {
    const actor = requireRole(req, 'FACILITY_REFERENT')
    const { id, action } = z.object({ id: z.uuid(), action: z.enum(FACILITY_ACTIONS) }).parse(req.params)
    const input = transitionSchemas[action].parse(req.body)
    const r = await transition(ctx, actor, id, action, input as never)
    return { id: r.id, state: r.state, version: r.version }
  })
}
