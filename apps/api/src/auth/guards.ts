import type { FastifyRequest } from 'fastify'
import type { Role } from '../generated/prisma/client.ts'
import { AppError, forbidden, unauthorized } from '../http/errors.ts'
import type { Actor } from './sessions.ts'

export function requireActor(req: FastifyRequest): Actor {
  if (!req.actor) throw unauthorized()
  return req.actor
}

export function requireRole(req: FastifyRequest, ...roles: Role[]): Actor {
  const actor = requireActor(req)
  if (!roles.includes(actor.role)) throw forbidden()
  return actor
}

/**
 * Fonctions sensibles (comptes, exports, connecteurs) : administrateur avec second facteur
 * validé dans la session courante.
 */
export function requireStrongAdmin(req: FastifyRequest): Actor {
  const actor = requireRole(req, 'ADMIN')
  if (!actor.totpEnabled) {
    throw new AppError(403, 'MFA_SETUP_REQUIRED', 'Activez la double vérification de votre compte administrateur pour continuer.')
  }
  if (!actor.mfaVerified) {
    throw new AppError(403, 'MFA_REQUIRED', 'Saisissez le code de votre application de vérification pour continuer.')
  }
  return actor
}
