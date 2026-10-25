import { hash, verify } from '@node-rs/argon2'
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

/**
 * Hachage argon2id (paramètres recommandés OWASP 2024 : m=19 MiB, t=2, p=1).
 * Utilisé pour les mots de passe du personnel, les codes personnels (PIN) et les codes
 * d'activation : jamais stockés en clair.
 */
const ARGON2_OPTIONS = { memoryCost: 19456, timeCost: 2, parallelism: 1 } as const

export const hashSecret = (plain: string) => hash(plain, ARGON2_OPTIONS)
export const verifySecret = async (hashed: string | null | undefined, plain: string) => {
  if (!hashed) return false
  try {
    return await verify(hashed, plain)
  } catch {
    return false
  }
}

/** Hash rapide pour des jetons à forte entropie (sessions) : argon2 inutile ici. */
export const sha256 = (value: string) => createHash('sha256').update(value).digest('hex')

/** Empreinte avec clé (HMAC) pour indexer sans stocker la valeur brute (ex. IP, identifiant). */
export const keyedDigest = (secret: string, value: string) => createHmac('sha256', secret).update(value).digest('hex')

export const randomToken = (bytes = 32) => randomBytes(bytes).toString('base64url')

/** Alphabet sans caractères ambigus (0/O, 1/I/L) pour des codes dictés ou recopiés. */
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
export function readableCode(groups: number, groupLength = 4): string {
  const out: string[] = []
  for (let g = 0; g < groups; g++) {
    let part = ''
    const bytes = randomBytes(groupLength)
    for (const b of bytes) part += ALPHABET[b % ALPHABET.length]
    out.push(part)
  }
  return out.join('-')
}

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a)
  const bb = Buffer.from(b)
  return ab.length === bb.length && timingSafeEqual(ab, bb)
}

/** Chiffrement AES-256-GCM (secrets TOTP). Clé dérivée du secret d'application. */
function key(appSecret: string) {
  return createHash('sha256').update(`totp-key:${appSecret}`).digest()
}
export function encrypt(appSecret: string, plaintext: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key(appSecret), iv)
  const data = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  return [iv, cipher.getAuthTag(), data].map((b) => b.toString('base64url')).join('.')
}
export function decrypt(appSecret: string, payload: string): string {
  const [iv, tag, data] = payload.split('.').map((p) => Buffer.from(p, 'base64url')) as [Buffer, Buffer, Buffer]
  const decipher = createDecipheriv('aes-256-gcm', key(appSecret), iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8')
}

/** Codes personnels trop faciles à deviner, refusés à l'activation. */
export function isWeakPin(pin: string): boolean {
  if (/^(\d)\1{5}$/.test(pin)) return true // 000000, 111111…
  const asc = '0123456789012345'
  const desc = '9876543210987654'
  if (asc.includes(pin) || desc.includes(pin)) return true // 123456, 654321…
  return ['121212', '112233', '123123', '696969', '159753'].includes(pin)
}
