import { Secret, TOTP } from 'otpauth'

const PERIOD = 30

export function newTotpSecret(): string {
  return new Secret({ size: 20 }).base32
}

export function totpUri(secretBase32: string, label: string): string {
  return new TOTP({ issuer: 'Relais Maman', label, secret: Secret.fromBase32(secretBase32), period: PERIOD, digits: 6 }).toString()
}

/**
 * Vérifie un code TOTP (fenêtre ±1 pas) et renvoie le pas accepté, pour interdire son rejeu.
 * Renvoie null si le code est faux ou déjà utilisé.
 */
export function checkTotp(secretBase32: string, code: string, lastUsedStep: number | null, now = Date.now()): number | null {
  const totp = new TOTP({ secret: Secret.fromBase32(secretBase32), period: PERIOD, digits: 6 })
  const delta = totp.validate({ token: code, window: 1, timestamp: now })
  if (delta === null) return null
  const step = totp.counter({ timestamp: now }) + delta
  if (lastUsedStep !== null && step <= lastUsedStep) return null
  return step
}

/** Utilitaire de test / démo : code courant pour un secret. */
export function currentTotp(secretBase32: string, now = Date.now()): string {
  return new TOTP({ secret: Secret.fromBase32(secretBase32), period: PERIOD, digits: 6 }).generate({ timestamp: now })
}
