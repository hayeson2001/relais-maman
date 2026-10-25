import type { AppContext } from '../context.ts'
import type { Actor } from '../auth/sessions.ts'
import { forbidden, unprocessable } from '../http/errors.ts'
import { recordEvent } from './requests.ts'

type Purpose = 'TRANSMIT_REQUEST' | 'RECEIVE_CALLBACK' | 'KEEP_AUDIO' | 'RESEARCH'

/**
 * Enregistre une décision d'accord (nouvelle ligne, l'historique n'est jamais réécrit) et
 * applique l'EFFET OPÉRATIONNEL d'un retrait :
 * - TRANSMIT_REQUEST retiré : toutes les demandes ouvertes sont clôturées (motif
 *   CONSENT_WITHDRAWN) ; plus aucune nouvelle action d'agent n'est possible dessus.
 * - RECEIVE_CALLBACK retiré : les appels vocaux en attente sont annulés et plus aucun n'est
 *   mis en file (cf. notifyBeneficiary).
 * - KEEP_AUDIO retiré : les enregistrements sont supprimés du stockage (la transcription
 *   humaine éventuelle reste rattachée au dossier, documenté dans docs/confidentialite.md).
 * - RESEARCH : facultatif, sans aucun effet sur l'accès au service.
 */
export async function updateConsent(
  ctx: AppContext,
  actor: Actor,
  input: { purpose: Purpose; granted: boolean; textVersion: string },
) {
  if (actor.role !== 'BENEFICIARY' || !actor.beneficiaryId) throw forbidden()
  const beneficiaryId = actor.beneficiaryId

  const text = await ctx.db.consentText.findFirst({ where: { purpose: input.purpose, version: input.textVersion } })
  if (!text) throw unprocessable('Le texte d’accord affiché n’est plus à jour. Rechargez la page.', 'CONSENT_TEXT_UNKNOWN')

  const audioKeysToDelete: string[] = []
  const effects: string[] = []

  await ctx.db.$transaction(async (tx) => {
    await tx.consent.create({
      data: { beneficiaryId, purpose: input.purpose, granted: input.granted, textVersion: text.version, recordedById: actor.accountId },
    })
    if (input.granted) return

    if (input.purpose === 'TRANSMIT_REQUEST') {
      const open = await tx.request.findMany({
        where: { beneficiaryId, state: { notIn: ['CARE_VERIFIED', 'CLOSED_WITHOUT_CARE'] } },
      })
      for (const r of open) {
        await tx.request.update({
          where: { id: r.id },
          data: { state: 'CLOSED_WITHOUT_CARE', closedAt: ctx.now(), closeReason: 'CONSENT_WITHDRAWN', version: { increment: 1 } },
        })
        await tx.slotProposal.updateMany({
          where: { requestId: r.id, status: { in: ['PROPOSED', 'ACCEPTED', 'ALTERNATIVE_REQUESTED', 'CONFIRMED_BY_FACILITY'] } },
          data: { status: 'SUPERSEDED' },
        })
        await recordEvent(tx, {
          requestId: r.id, type: 'CLOSE_WITHOUT_CARE', actor: null,
          fromState: r.state, toState: 'CLOSED_WITHOUT_CARE', data: { reason: 'CONSENT_WITHDRAWN' },
        })
      }
      effects.push(`${open.length} demande(s) ouverte(s) clôturée(s)`)
    }

    if (input.purpose === 'RECEIVE_CALLBACK') {
      const { count } = await tx.notification.updateMany({
        where: { recipientId: actor.accountId, channel: 'VOICE_CALL', status: 'PENDING' },
        data: { status: 'CANCELLED', lastError: 'Accord de rappel retiré' },
      })
      const prefs = await tx.contactPreference.findUnique({ where: { beneficiaryId } })
      if (prefs?.channels.includes('VOICE_CALL')) {
        await tx.contactPreference.update({
          where: { beneficiaryId },
          data: { channels: prefs.channels.filter((c) => c !== 'VOICE_CALL') },
        })
      }
      effects.push(`${count} appel(s) en attente annulé(s)`)
    }

    if (input.purpose === 'KEEP_AUDIO') {
      const audios = await tx.audioAsset.findMany({ where: { beneficiaryId, deletedAt: null } })
      for (const a of audios) audioKeysToDelete.push(a.storageKey)
      await tx.audioAsset.updateMany({ where: { beneficiaryId, deletedAt: null }, data: { deletedAt: ctx.now() } })
      effects.push(`${audios.length} enregistrement(s) supprimé(s)`)
    }
  })

  // Suppression physique après validation de la transaction (un échec ici est rejoué par le worker).
  for (const key of audioKeysToDelete) await ctx.storage.delete(key).catch(() => undefined)
  return { purpose: input.purpose, granted: input.granted, effects }
}

export async function currentConsents(ctx: AppContext, beneficiaryId: string) {
  const rows = await ctx.db.consent.findMany({ where: { beneficiaryId }, orderBy: { createdAt: 'desc' } })
  const latest: Partial<Record<Purpose, { granted: boolean; textVersion: string; at: Date }>> = {}
  for (const r of rows) if (!latest[r.purpose]) latest[r.purpose] = { granted: r.granted, textVersion: r.textVersion, at: r.createdAt }
  return latest
}
