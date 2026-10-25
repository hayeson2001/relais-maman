/**
 * Erreurs métier renvoyées au client avec un code stable et un message qui explique
 * comment continuer (section 7 du cahier des charges). Jamais de détail interne.
 */
export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
  ) {
    super(message)
  }
}

export const unauthorized = () => new AppError(401, 'UNAUTHENTICATED', 'Votre session a expiré. Connectez-vous à nouveau.')
export const forbidden = () => new AppError(403, 'FORBIDDEN', "Vous n'avez pas accès à cette information.")
/** 404 plutôt que 403 sur un objet hors périmètre : on ne confirme pas son existence. */
export const notFound = () => new AppError(404, 'NOT_FOUND', 'Élément introuvable. Revenez à la liste et réessayez.')
export const conflict = (message: string, code = 'CONFLICT') => new AppError(409, code, message)
export const unprocessable = (message: string, code = 'BUSINESS_RULE') => new AppError(422, code, message)
