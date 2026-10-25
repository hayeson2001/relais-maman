import type { Db } from '../db.ts'
import { AppError } from '../http/errors.ts'
import { keyedDigest } from './secrets.ts'

/**
 * Limitation des tentatives de connexion, en plus du limiteur HTTP global.
 * - Par identifiant : 5 échecs en 15 min -> verrouillage temporaire de 15 min.
 *   10 échecs cumulés -> compte VERROUILLÉ, déverrouillage supervisé par un agent
 *   (nouveau code d'activation). Indispensable avec un code personnel à 6 chiffres.
 * - Par adresse réseau : 30 échecs en 15 min -> refus temporaire.
 * Les clés sont des empreintes HMAC : ni l'identifiant ni l'IP ne sont stockés en clair.
 */
const WINDOW_MS = 15 * 60_000
export const TEMP_LOCK_THRESHOLD = 5
export const HARD_LOCK_THRESHOLD = 10
const IP_THRESHOLD = 30

export async function assertIpNotThrottled(db: Db, secret: string, ip: string) {
  const keyHash = keyedDigest(secret, `ip:${ip}`)
  const failures = await db.authAttempt.count({
    where: { keyHash, success: false, createdAt: { gte: new Date(Date.now() - WINDOW_MS) } },
  })
  if (failures >= IP_THRESHOLD) {
    throw new AppError(429, 'TOO_MANY_ATTEMPTS', 'Trop de tentatives depuis cet appareil. Réessayez dans 15 minutes ou demandez de l’aide à votre agent.')
  }
}

export async function recordAttempt(db: Db, secret: string, ip: string, success: boolean) {
  await db.authAttempt.create({ data: { keyHash: keyedDigest(secret, `ip:${ip}`), success } })
}

/** À appeler après un échec sur un compte existant. */
export async function registerAccountFailure(db: Db, accountId: string) {
  const account = await db.account.update({
    where: { id: accountId },
    data: { failedAttempts: { increment: 1 } },
    select: { failedAttempts: true },
  })
  if (account.failedAttempts >= HARD_LOCK_THRESHOLD) {
    await db.account.update({ where: { id: accountId }, data: { status: 'LOCKED', lockedUntil: null } })
  } else if (account.failedAttempts % TEMP_LOCK_THRESHOLD === 0) {
    await db.account.update({ where: { id: accountId }, data: { lockedUntil: new Date(Date.now() + WINDOW_MS) } })
  }
}

export const lockedMessage = (permanent: boolean) =>
  permanent
    ? new AppError(423, 'ACCOUNT_LOCKED', 'Votre accès est bloqué après plusieurs essais. Votre agent peut vous donner un nouveau code.')
    : new AppError(423, 'ACCOUNT_TEMPORARILY_LOCKED', 'Trop d’essais. Attendez 15 minutes avant de réessayer.')
