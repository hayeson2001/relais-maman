import type { FastifyInstance, FastifyReply } from 'fastify'
import { activationSchema, beneficiaryLoginSchema, staffLoginSchema, totpSchema } from '@relais-maman/core'
import type { AppContext } from '../context.ts'
import { assertIpNotThrottled, lockedMessage, recordAttempt, registerAccountFailure } from '../auth/attempts.ts'
import { decrypt, encrypt, hashSecret, isWeakPin, verifySecret } from '../auth/secrets.ts'
import { createSession, revokeAllSessions, revokeSession, SESSION_COOKIE } from '../auth/sessions.ts'
import { checkTotp, newTotpSecret, totpUri } from '../auth/totp.ts'
import { requireActor, requireRole } from '../auth/guards.ts'
import { AppError, unprocessable } from '../http/errors.ts'
import type { Role } from '../generated/prisma/client.ts'

/** Hash factice : égalise le temps de réponse quand l'identifiant n'existe pas. */
let dummyHash: Promise<string> | null = null
const getDummyHash = () => (dummyHash ??= hashSecret('valeur-factice-pour-temps-constant'))

const badCredentials = (beneficiary: boolean) =>
  new AppError(
    401,
    'BAD_CREDENTIALS',
    beneficiary
      ? 'Identifiant ou code personnel incorrect. Vérifiez et réessayez, ou demandez de l’aide à votre agent.'
      : 'Identifiant ou mot de passe incorrect.',
  )

export async function authRoutes(app: FastifyInstance, ctx: AppContext) {
  const { db, config } = ctx

  async function openSession(reply: FastifyReply, accountId: string, role: Role) {
    const { token, maxAgeSeconds } = await createSession(db, accountId, role)
    reply.setCookie(SESSION_COOKIE, token, {
      httpOnly: true,
      secure: config.COOKIE_SECURE,
      sameSite: 'strict',
      path: '/',
      maxAge: maxAgeSeconds,
    })
  }

  async function passwordLogin(
    req: { ip: string },
    reply: FastifyReply,
    loginId: string,
    secret: string,
    beneficiary: boolean,
  ) {
    await assertIpNotThrottled(db, config.APP_SECRET, req.ip)
    const account = await db.account.findUnique({ where: { loginId } })
    const roleMatches = account && (beneficiary ? account.role === 'BENEFICIARY' : account.role !== 'BENEFICIARY')

    if (!account || !roleMatches || account.status === 'DISABLED' || account.status === 'PENDING_ACTIVATION') {
      await verifySecret(await getDummyHash(), secret)
      await recordAttempt(db, config.APP_SECRET, req.ip, false)
      throw badCredentials(beneficiary)
    }
    if (account.status === 'LOCKED') throw lockedMessage(true)
    if (account.lockedUntil && account.lockedUntil > new Date()) throw lockedMessage(false)

    if (!(await verifySecret(account.secretHash, secret))) {
      await registerAccountFailure(db, account.id)
      await recordAttempt(db, config.APP_SECRET, req.ip, false)
      throw badCredentials(beneficiary)
    }

    await db.account.update({ where: { id: account.id }, data: { failedAttempts: 0, lockedUntil: null } })
    await recordAttempt(db, config.APP_SECRET, req.ip, true)
    await openSession(reply, account.id, account.role)
    return {
      role: account.role,
      displayName: account.displayName,
      mfaRequired: account.role === 'ADMIN',
      totpEnabled: account.totpEnabled,
    }
  }

  app.post('/api/auth/staff/login', async (req, reply) => {
    const body = staffLoginSchema.parse(req.body)
    return passwordLogin(req, reply, body.username, body.password, false)
  })

  app.post('/api/auth/beneficiary/login', async (req, reply) => {
    const body = beneficiaryLoginSchema.parse(req.body)
    return passwordLogin(req, reply, body.identifier, body.pin, true)
  })

  /**
   * Activation (première fois) ou récupération supervisée : code à usage unique remis par
   * un agent, puis choix d'un code personnel. Fonctionne même si le compte est verrouillé :
   * c'est précisément le chemin de déverrouillage supervisé.
   */
  app.post('/api/auth/beneficiary/activate', async (req, reply) => {
    const body = activationSchema.parse(req.body)
    await assertIpNotThrottled(db, config.APP_SECRET, req.ip)

    const account = await db.account.findUnique({ where: { loginId: body.identifier } })
    const codes =
      account && account.role === 'BENEFICIARY' && account.status !== 'DISABLED'
        ? await db.activationCode.findMany({
            where: { accountId: account.id, usedAt: null, revokedAt: null, expiresAt: { gt: new Date() } },
          })
        : []

    let matched: (typeof codes)[number] | null = null
    for (const code of codes) if (await verifySecret(code.codeHash, body.activationCode)) matched = code
    if (!account || !matched) {
      if (codes.length === 0) await verifySecret(await getDummyHash(), body.activationCode)
      await recordAttempt(db, config.APP_SECRET, req.ip, false)
      throw new AppError(401, 'BAD_ACTIVATION', 'Code d’activation incorrect ou expiré. Votre agent peut vous en donner un nouveau.')
    }
    if (isWeakPin(body.newPin)) {
      throw unprocessable('Ce code est trop facile à deviner. Choisissez 6 chiffres moins simples (pas 123456 ni 000000).', 'WEAK_PIN')
    }

    const secretHash = await hashSecret(body.newPin)
    await db.$transaction([
      db.activationCode.update({ where: { id: matched.id }, data: { usedAt: new Date() } }),
      db.activationCode.updateMany({
        where: { accountId: account.id, usedAt: null, id: { not: matched.id } },
        data: { revokedAt: new Date() },
      }),
      db.account.update({
        where: { id: account.id },
        data: { secretHash, status: 'ACTIVE', failedAttempts: 0, lockedUntil: null },
      }),
      db.auditLog.create({ data: { actorId: account.id, action: `beneficiary.${matched.purpose.toLowerCase()}` } }),
    ])
    await revokeAllSessions(db, account.id)
    await recordAttempt(db, config.APP_SECRET, req.ip, true)
    await openSession(reply, account.id, 'BENEFICIARY')
    return { role: 'BENEFICIARY', displayName: account.displayName }
  })

  /** Déconnexion : révoque la session côté serveur. Le client purge ses données locales. */
  app.post('/api/auth/logout', async (req, reply) => {
    if (req.actor) await revokeSession(db, req.actor.sessionId)
    reply.clearCookie(SESSION_COOKIE, { path: '/' })
    return { loggedOut: true, purgeLocalData: true }
  })

  app.get('/api/auth/me', async (req) => {
    const actor = requireActor(req)
    return {
      role: actor.role,
      displayName: actor.displayName,
      csrfToken: actor.csrfToken,
      mfaVerified: actor.mfaVerified,
      totpEnabled: actor.totpEnabled,
      canConfirmCare: actor.canConfirmCare,
      appEnv: config.APP_ENV,
    }
  })

  // ─── Double vérification administrateur (TOTP) ───────────────────────────

  app.post('/api/auth/totp/setup', async (req) => {
    const actor = requireRole(req, 'ADMIN')
    if (actor.totpEnabled) throw unprocessable('La double vérification est déjà active sur ce compte.', 'MFA_ALREADY_ENABLED')
    const secret = newTotpSecret()
    await db.account.update({ where: { id: actor.accountId }, data: { totpSecretEnc: encrypt(config.APP_SECRET, secret) } })
    return { secret, otpauthUri: totpUri(secret, actor.displayName) }
  })

  async function confirmTotp(accountId: string, sessionId: string, code: string, enable: boolean) {
    const account = await db.account.findUniqueOrThrow({ where: { id: accountId } })
    if (!account.totpSecretEnc) throw unprocessable('Configurez d’abord la double vérification.', 'MFA_NOT_SETUP')
    const step = checkTotp(decrypt(config.APP_SECRET, account.totpSecretEnc), code, account.totpLastUsedStep, ctx.now().getTime())
    if (step === null) {
      await registerAccountFailure(db, accountId)
      throw new AppError(401, 'BAD_TOTP', 'Code incorrect ou déjà utilisé. Attendez le code suivant et réessayez.')
    }
    await db.$transaction([
      db.account.update({
        where: { id: accountId },
        data: { totpLastUsedStep: step, failedAttempts: 0, ...(enable ? { totpEnabled: true } : {}) },
      }),
      db.session.update({ where: { id: sessionId }, data: { mfaVerifiedAt: new Date() } }),
    ])
  }

  app.post('/api/auth/totp/enable', async (req) => {
    const actor = requireRole(req, 'ADMIN')
    await confirmTotp(actor.accountId, actor.sessionId, totpSchema.parse(req.body).code, true)
    return { totpEnabled: true, mfaVerified: true }
  })

  app.post('/api/auth/totp/verify', async (req) => {
    const actor = requireRole(req, 'ADMIN')
    if (!actor.totpEnabled) throw unprocessable('Activez d’abord la double vérification.', 'MFA_NOT_ENABLED')
    await confirmTotp(actor.accountId, actor.sessionId, totpSchema.parse(req.body).code, false)
    return { mfaVerified: true }
  })
}
