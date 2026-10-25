import type { Prisma } from '../generated/prisma/client.ts'
import type { Actor } from '../auth/sessions.ts'
import { forbidden } from '../http/errors.ts'

/**
 * Politique d'accès aux dossiers (docs/droits.md). Appliquée CÔTÉ SERVEUR à chaque requête,
 * en filtrant directement les requêtes en base : un objet hors périmètre n'est jamais chargé.
 *
 * - Bénéficiaire : uniquement ses propres demandes.
 * - Agent : demandes des bénéficiaires de SON équipe (jamais une autre équipe).
 * - Référent de structure : demandes ayant un créneau proposé dans SA structure, avec une
 *   vue réduite aux informations de coordination (cf. facilityRequestSelect).
 * - Administrateur : aucun accès au contenu individuel des demandes (indicateurs agrégés,
 *   comptes et référentiels seulement). Principe du moindre privilège.
 */
export function requestScope(actor: Actor): Prisma.RequestWhereInput {
  switch (actor.role) {
    case 'BENEFICIARY':
      if (!actor.beneficiaryId) throw forbidden()
      return { beneficiaryId: actor.beneficiaryId }
    case 'AGENT':
      if (!actor.teamId) throw forbidden()
      return { teamId: actor.teamId }
    case 'FACILITY_REFERENT':
      if (!actor.facilityId) throw forbidden()
      return { slots: { some: { facilityId: actor.facilityId } } }
    case 'ADMIN':
      throw forbidden()
  }
}

export function beneficiaryScope(actor: Actor): Prisma.BeneficiaryWhereInput {
  switch (actor.role) {
    case 'BENEFICIARY':
      if (!actor.beneficiaryId) throw forbidden()
      return { id: actor.beneficiaryId }
    case 'AGENT':
      if (!actor.teamId) throw forbidden()
      return { teamId: actor.teamId }
    default:
      throw forbidden()
  }
}

/**
 * Vue d'un référent de structure : de quoi coordonner un créneau, rien de plus.
 * Ni le texte libre de la femme, ni son audio, ni son téléphone, ni ses messages.
 */
export const facilityRequestSelect = {
  id: true,
  state: true,
  version: true,
  category: true,
  createdAt: true,
  beneficiary: { select: { account: { select: { displayName: true } } } },
  slots: true,
  verifications: { orderBy: { createdAt: 'asc' } },
  declarations: { select: { careDate: true, createdAt: true, declaredByRole: true } },
} satisfies Prisma.RequestSelect
