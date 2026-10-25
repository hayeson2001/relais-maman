import type { Db } from '../db.ts'

export interface Rate {
  numerator: number
  denominator: number
  /** null si le dénominateur est nul : on n'affiche pas 0 % faute de données. */
  value: number | null
  definition: string
}

export interface Delay {
  medianHours: number | null
  meanHours: number | null
  measured: number
  /** demandes de la période sans l'événement concerné (pas encore de réponse, etc.) */
  missing: number
  definition: string
}

const rate = (numerator: number, denominator: number, definition: string): Rate => ({
  numerator, denominator, value: denominator ? numerator / denominator : null, definition,
})

function delay(hours: number[], missing: number, definition: string): Delay {
  if (!hours.length) return { medianHours: null, meanHours: null, measured: 0, missing, definition }
  const sorted = [...hours].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  const median = sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2
  return {
    medianHours: Math.round(median * 10) / 10,
    meanHours: Math.round((hours.reduce((a, b) => a + b, 0) / hours.length) * 10) / 10,
    measured: hours.length,
    missing,
    definition,
  }
}

/**
 * Indicateurs calculés depuis les données réelles du système, pour les demandes CRÉÉES dans
 * la période [from, to). Ce sont des indicateurs de fonctionnement du service, jamais la
 * preuve d'un impact sanitaire.
 */
export async function computeMetrics(db: Db, from: Date, to: Date) {
  const requests = await db.request.findMany({
    where: { createdAt: { gte: from, lt: to } },
    select: {
      id: true, state: true, category: true, createdAt: true, firstHumanResponseAt: true, actionAgreedAt: true,
      closeReason: true, assignedAgentId: true,
      declarations: { select: { id: true }, take: 1 },
      verifications: { where: { supersededById: null, revokedAt: null }, select: { id: true }, take: 1 },
    },
  })
  const n = requests.length
  const hours = (a: Date, b: Date) => (b.getTime() - a.getTime()) / 3_600_000

  const open = requests.filter((r) => !['CARE_VERIFIED', 'CLOSED_WITHOUT_CARE'].includes(r.state)).length
  const declared = requests.filter((r) => r.declarations.length > 0).length
  const verified = requests.filter((r) => r.state === 'CARE_VERIFIED' && r.verifications.length > 0).length
  const closedWithout = requests.filter((r) => r.state === 'CLOSED_WITHOUT_CARE')

  const byCategory: Record<string, number> = {}
  for (const r of requests) byCategory[r.category ?? 'NON_CATEGORISEE'] = (byCategory[r.category ?? 'NON_CATEGORISEE'] ?? 0) + 1
  const closeReasons: Record<string, number> = {}
  for (const r of closedWithout) closeReasons[r.closeReason ?? 'INCONNU'] = (closeReasons[r.closeReason ?? 'INCONNU'] ?? 0) + 1

  const firstResponse = requests.filter((r) => r.firstHumanResponseAt).map((r) => hours(r.createdAt, r.firstHumanResponseAt!))
  const agreed = requests.filter((r) => r.actionAgreedAt).map((r) => hours(r.createdAt, r.actionAgreedAt!))

  const agentLoad = await db.account.findMany({
    where: { role: 'AGENT', status: 'ACTIVE' },
    select: {
      displayName: true,
      team: { select: { name: true } },
      _count: { select: { assignedRequests: { where: { state: { notIn: ['CARE_VERIFIED', 'CLOSED_WITHOUT_CARE'] } } } } },
    },
  })

  const notifications = await db.notification.groupBy({
    by: ['channel', 'status'],
    where: { createdAt: { gte: from, lt: to }, channel: { not: 'IN_APP' } },
    _count: true,
  })
  const notifTotal = notifications.reduce((a, g) => a + g._count, 0)
  const notifFailed = notifications.filter((g) => g.status === 'FAILED').reduce((a, g) => a + g._count, 0)

  return {
    period: { from: from.toISOString(), to: to.toISOString(), basis: 'Demandes créées dans la période' },
    requests: { received: n, open, closed: n - open },
    firstHumanResponse: delay(firstResponse, n - firstResponse.length,
      'Délai entre la réception et le premier message ou créneau envoyé à la femme. Les demandes sans réponse sont comptées dans « missing », pas dans le délai.'),
    actionAgreed: delay(agreed, n - agreed.length, 'Délai entre la réception et l’action convenue.'),
    careDeclared: rate(declared, n, 'Demandes avec au moins une déclaration de soin reçu / demandes de la période. Déclaration ≠ vérification.'),
    careVerified: rate(verified, n, 'Demandes au soin vérifié par une source humaine identifiée (vérification active) / demandes de la période.'),
    closedWithoutCare: { ...rate(closedWithout.length, n, 'Clôtures sans soin confirmé / demandes de la période.'), reasons: closeReasons },
    obstacles: { byCategory, definition: 'Catégorie retenue au moment du calcul (décision de l’agent si elle existe, sinon choix ou suggestion en attente de décision).' },
    agentLoad: agentLoad.map((a) => ({ agent: a.displayName, team: a.team?.name ?? null, openAssigned: a._count.assignedRequests })),
    notifications: {
      ...rate(notifFailed, notifTotal, 'Notifications externes (SMS, appel) en échec définitif / notifications externes créées dans la période.'),
      byChannelAndStatus: notifications.map((g) => ({ channel: g.channel, status: g.status, count: g._count })),
    },
    caveat: 'Indicateurs de fonctionnement calculés sur les données du système. Ils ne démontrent aucun impact sanitaire causal. En local et en démonstration, toutes les données sont fictives.',
  }
}
