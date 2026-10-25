import type { AppContext } from '../context.ts'
import { messagingConnector, type MessagingConnector } from '../connectors/index.ts'
import { NOTIFICATION_TEMPLATES, type TemplateKey } from '../services/notifications.ts'
import { transition } from '../services/requests.ts'

const BACKOFF_MINUTES = [1, 5, 30]

/** Minutes locales (fuseau du pays) depuis minuit. */
function localMinutes(now: Date, timeZone: string) {
  const [h, m] = now.toLocaleTimeString('en-GB', { timeZone, hour: '2-digit', minute: '2-digit', hour12: false }).split(':').map(Number) as [number, number]
  return h * 60 + m
}
const toMinutes = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number) as [number, number]
  return h * 60 + m
}

/**
 * Traite l'outbox. Respecte l'horaire préféré de la femme (hors plage : report), réessaie
 * avec un délai croissant jusqu'à `maxAttempts`, puis marque l'échec, visible des administrateurs.
 * Aucun contenu de message n'est journalisé.
 */
export async function processOutbox(
  ctx: AppContext,
  connectorFor: (channel: 'SMS' | 'VOICE_CALL') => MessagingConnector | null = (c) => messagingConnector(ctx.config, c),
) {
  const now = ctx.now()
  const due = await ctx.db.notification.findMany({
    where: { status: 'PENDING', nextAttemptAt: { lte: now }, channel: { in: ['SMS', 'VOICE_CALL'] } },
    orderBy: { nextAttemptAt: 'asc' },
    take: 20,
  })
  const results = { sent: 0, failed: 0, retried: 0, deferred: 0 }

  for (const n of due) {
    // Réservation atomique : un autre worker ne traitera pas la même notification.
    const claimed = await ctx.db.notification.updateMany({ where: { id: n.id, status: 'PENDING' }, data: { status: 'SENDING' } })
    if (claimed.count !== 1) continue

    const beneficiary = await ctx.db.beneficiary.findUnique({
      where: { accountId: n.recipientId },
      select: { contact: true, preferences: true },
    })
    const phone = beneficiary?.contact?.phoneE164
    const window = beneficiary?.preferences
    if (window) {
      const minutes = localMinutes(now, ctx.timeZone)
      if (minutes < toMinutes(window.callWindowStart) || minutes >= toMinutes(window.callWindowEnd)) {
        await ctx.db.notification.update({ where: { id: n.id }, data: { status: 'PENDING', nextAttemptAt: new Date(now.getTime() + 15 * 60_000) } })
        results.deferred++
        continue
      }
    }

    const connector = connectorFor(n.channel as 'SMS' | 'VOICE_CALL')
    if (!phone || !connector) {
      await ctx.db.notification.update({
        where: { id: n.id },
        data: { status: 'FAILED', lastError: !phone ? 'NO_PHONE' : 'CONNECTOR_UNAVAILABLE', attempts: { increment: 1 } },
      })
      results.failed++
      continue
    }

    const text = NOTIFICATION_TEMPLATES[n.templateKey as TemplateKey]?.fr ?? NOTIFICATION_TEMPLATES.REQUEST_UPDATED.fr
    const res = await connector.send({ notificationId: n.id, channel: n.channel as 'SMS' | 'VOICE_CALL', to: phone, text, locale: n.locale })
    const attempts = n.attempts + 1

    if (res.ok) {
      await ctx.db.notification.update({
        where: { id: n.id },
        data: {
          status: res.status, provider: connector.provider, providerMessageId: res.providerMessageId, attempts,
          sentAt: now, costMicroUnits: res.costMicroUnits, costCurrency: res.costCurrency, lastError: null,
        },
      })
      results.sent++
    } else if (res.retryable && attempts < n.maxAttempts) {
      const wait = BACKOFF_MINUTES[Math.min(attempts - 1, BACKOFF_MINUTES.length - 1)]!
      await ctx.db.notification.update({
        where: { id: n.id },
        data: { status: 'PENDING', attempts, lastError: res.error, provider: connector.provider, nextAttemptAt: new Date(now.getTime() + wait * 60_000) },
      })
      results.retried++
    } else {
      await ctx.db.notification.update({ where: { id: n.id }, data: { status: 'FAILED', attempts, lastError: res.error, provider: connector.provider } })
      results.failed++
    }
  }
  return results
}

/** Bascule chronologique : action convenue dont le créneau est passé -> réalisation à confirmer. */
export async function markDueRequests(ctx: AppContext) {
  const due = await ctx.db.request.findMany({
    where: {
      state: 'ACTION_AGREED',
      slots: { some: { status: { in: ['ACCEPTED', 'CONFIRMED_BY_FACILITY'] }, startsAt: { lte: ctx.now() } } },
    },
    select: { id: true, version: true },
    take: 100,
  })
  let moved = 0
  for (const r of due) {
    try {
      await transition(ctx, null, r.id, 'MARK_AWAITING_COMPLETION', { expectedVersion: r.version })
      moved++
    } catch {
      // Modifié entre-temps par un agent : sera réévalué au prochain passage.
    }
  }
  return { moved }
}

/** Purge technique : tentatives de connexion et sessions expirées. */
export async function purgeTechnicalData(ctx: AppContext) {
  const now = ctx.now().getTime()
  const attempts = await ctx.db.authAttempt.deleteMany({ where: { createdAt: { lt: new Date(now - 24 * 3_600_000) } } })
  const sessions = await ctx.db.session.deleteMany({ where: { absoluteExpiresAt: { lt: new Date(now - 7 * 86_400_000) } } })
  return { attempts: attempts.count, sessions: sessions.count }
}
