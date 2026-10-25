import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import type { AppContext } from '../context.ts'
import { keyedDigest, safeEqual, sha256 } from '../auth/secrets.ts'
import { AppError } from '../http/errors.ts'

/**
 * Réception des accusés de livraison (webhooks). Protocole du SIMULATEUR local :
 *   en-têtes x-rm-timestamp (ms), x-rm-event-id (unique), x-rm-signature = HMAC-SHA256(
 *   WEBHOOK_SIGNING_SECRET, `${timestamp}.${corps brut}`) en hexadécimal.
 * Un fournisseur réel aura SON propre schéma de signature : l'adaptateur devra suivre sa
 * documentation officielle (rien n'est supposé ici, cf. docs/integrations.md).
 *
 * Garanties : signature vérifiée sur le corps BRUT, fenêtre de 5 minutes, anti-rejeu par
 * identifiant d'événement, idempotence (un même accusé appliqué deux fois ne change rien),
 * aucun contenu de message journalisé.
 */
const MAX_SKEW_MS = 5 * 60_000

const bodySchema = z.object({
  providerMessageId: z.string().min(1).max(100),
  status: z.enum(['DELIVERED', 'FAILED']),
  error: z.string().max(200).optional(),
})

export function signWebhook(secret: string, timestamp: string, rawBody: string) {
  return keyedDigest(secret, `${timestamp}.${rawBody}`)
}

export async function webhookRoutes(app: FastifyInstance, ctx: AppContext) {
  await app.register(async (scope) => {
    // Corps brut conservé : la signature porte sur les octets exacts reçus.
    scope.addContentTypeParser('application/json', { parseAs: 'string' }, (_req, body, done) => done(null, body))

    scope.post('/api/webhooks/:provider', { config: { rateLimit: { max: 120, timeWindow: '1 minute' } }, schema: { tags: ['webhooks'] } }, async (req) => {
      const { provider } = z.object({ provider: z.enum(['simulator']) }).parse(req.params)
      const raw = typeof req.body === 'string' ? req.body : ''
      const timestamp = req.headers['x-rm-timestamp']
      const eventId = req.headers['x-rm-event-id']
      const signature = req.headers['x-rm-signature']
      if (typeof timestamp !== 'string' || typeof eventId !== 'string' || typeof signature !== 'string') {
        throw new AppError(400, 'WEBHOOK_HEADERS', 'En-têtes de signature manquants.')
      }
      if (Math.abs(ctx.now().getTime() - Number(timestamp)) > MAX_SKEW_MS) {
        throw new AppError(401, 'WEBHOOK_STALE', 'Horodatage hors fenêtre.')
      }
      if (!safeEqual(signature, signWebhook(ctx.config.WEBHOOK_SIGNING_SECRET, timestamp, raw))) {
        throw new AppError(401, 'WEBHOOK_SIGNATURE', 'Signature invalide.')
      }

      // Anti-rejeu : un identifiant d'événement n'est accepté qu'une fois.
      const already = await ctx.db.webhookEvent.findUnique({ where: { provider_externalId: { provider, externalId: eventId } } })
      if (already) return { accepted: true, replay: true }

      const body = bodySchema.parse(JSON.parse(raw))
      await ctx.db.$transaction(async (tx) => {
        await tx.webhookEvent.create({ data: { provider, externalId: eventId, payloadSha256: sha256(raw) } })
        await tx.notification.updateMany({
          where: { providerMessageId: body.providerMessageId, status: { in: ['SENT', 'SENT_SIMULATED'] } },
          data: body.status === 'FAILED' ? { status: 'FAILED', lastError: body.error ?? 'Échec signalé par le fournisseur' } : {},
        })
      })
      return { accepted: true, replay: false }
    })
  })
}
