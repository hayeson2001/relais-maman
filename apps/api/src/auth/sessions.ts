import type { Db } from '../db.ts'
import type { Role } from '../generated/prisma/client.ts'
import { randomToken, sha256 } from './secrets.ts'

export const SESSION_COOKIE = 'rm_session'

/** Durées : inactivité courte (téléphones partagés), plafond absolu. */
const IDLE_MINUTES: Record<Role, number> = { BENEFICIARY: 15, AGENT: 30, FACILITY_REFERENT: 30, ADMIN: 15 }
const ABSOLUTE_HOURS: Record<Role, number> = { BENEFICIARY: 12, AGENT: 12, FACILITY_REFERENT: 12, ADMIN: 8 }

export interface Actor {
  accountId: string
  role: Role
  displayName: string
  teamId: string | null
  facilityId: string | null
  canConfirmCare: boolean
  beneficiaryId: string | null
  spokenLanguages: string[]
  sessionId: string
  csrfToken: string
  mfaVerified: boolean
  totpEnabled: boolean
}

export async function createSession(db: Db, accountId: string, role: Role) {
  const token = randomToken(32)
  const now = Date.now()
  await db.session.create({
    data: {
      id: sha256(token),
      accountId,
      expiresAt: new Date(now + IDLE_MINUTES[role] * 60_000),
      absoluteExpiresAt: new Date(now + ABSOLUTE_HOURS[role] * 3_600_000),
      csrfToken: randomToken(24),
    },
  })
  return { token, maxAgeSeconds: ABSOLUTE_HOURS[role] * 3600 }
}

/** Valide le jeton, prolonge l'inactivité, et recharge les droits à chaque requête. */
export async function resolveSession(db: Db, token: string | undefined): Promise<Actor | null> {
  if (!token || token.length > 100) return null
  const id = sha256(token)
  const session = await db.session.findUnique({
    where: { id },
    include: { account: { include: { beneficiary: { select: { id: true } } } } },
  })
  const now = new Date()
  if (!session || session.revokedAt || session.expiresAt <= now || session.absoluteExpiresAt <= now) return null
  const { account } = session
  // Les droits sont relus à chaque requête : un compte désactivé ou verrouillé perd l'accès immédiatement.
  if (account.status !== 'ACTIVE') return null

  const idle = IDLE_MINUTES[account.role] * 60_000
  const nextExpiry = new Date(Math.min(now.getTime() + idle, session.absoluteExpiresAt.getTime()))
  if (nextExpiry.getTime() - session.expiresAt.getTime() > 60_000) {
    await db.session.update({ where: { id }, data: { expiresAt: nextExpiry, lastSeenAt: now } })
  }

  return {
    accountId: account.id,
    role: account.role,
    displayName: account.displayName,
    teamId: account.teamId,
    facilityId: account.facilityId,
    canConfirmCare: account.canConfirmCare,
    beneficiaryId: account.beneficiary?.id ?? null,
    spokenLanguages: account.spokenLanguages,
    sessionId: id,
    csrfToken: session.csrfToken,
    mfaVerified: session.mfaVerifiedAt !== null,
    totpEnabled: account.totpEnabled,
  }
}

export const revokeSession = (db: Db, sessionId: string) =>
  db.session.update({ where: { id: sessionId }, data: { revokedAt: new Date() } })

export const revokeAllSessions = (db: Db, accountId: string) =>
  db.session.updateMany({ where: { accountId, revokedAt: null }, data: { revokedAt: new Date() } })
