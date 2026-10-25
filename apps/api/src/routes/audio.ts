import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import type { AppContext } from '../context.ts'
import { requireActor, requireRole } from '../auth/guards.ts'
import { keyedDigest, safeEqual } from '../auth/secrets.ts'
import { AppError, forbidden, notFound, unprocessable } from '../http/errors.ts'
import { detectAudioType } from '../storage/index.ts'
import { recordEvent } from '../services/requests.ts'

const idParam = z.object({ id: z.uuid() })
export const MAX_AUDIO_SECONDS = 120
export const MAX_AUDIO_BYTES = 2 * 1024 * 1024
const ACCESS_TTL_MS = 5 * 60_000

/**
 * Enregistrements vocaux volontaires des bénéficiaires.
 * - Accord « conserver un audio » obligatoire au moment de l'envoi (distinct de l'accord de transmission).
 * - Type réel vérifié par les premiers octets ; taille ≤ 2 Mo ; durée déclarée ≤ 120 s.
 * - Lecture : URL temporaire signée (5 min), délivrée après contrôle des droits, jamais mise en cache.
 */
export async function audioRoutes(app: FastifyInstance, ctx: AppContext) {
  const { db, config, storage } = ctx

  const sign = (audioId: string, exp: number) => keyedDigest(config.APP_SECRET, `audio:${audioId}:${exp}`)

  app.post('/api/me/audio', { schema: { tags: ['audio'], consumes: ['multipart/form-data'] } }, async (req, reply) => {
    const actor = requireRole(req, 'BENEFICIARY')
    const file = await req.file()
    if (!file) throw unprocessable('Aucun enregistrement reçu. Réessayez ou écrivez votre besoin.', 'NO_FILE')
    const fields = Object.fromEntries(
      Object.entries(file.fields).map(([k, v]) => [k, (v as { value?: unknown } | undefined)?.value]),
    )
    const meta = z.object({
      locale: z.string().min(2).max(8),
      durationSeconds: z.coerce.number().int().min(1).max(MAX_AUDIO_SECONDS),
      keepAudioConsentVersion: z.string().min(1).max(40),
    }).safeParse(fields)
    if (!meta.success) throw unprocessable(`Enregistrement trop long ou incomplet (${MAX_AUDIO_SECONDS} secondes maximum).`, 'AUDIO_META_INVALID')

    const data = await file.toBuffer()
    if (file.file.truncated || data.length > MAX_AUDIO_BYTES) throw new AppError(413, 'TOO_LARGE', 'Enregistrement trop volumineux (2 Mo maximum).')
    const realType = detectAudioType(data)
    if (!realType) throw unprocessable('Format audio non reconnu. Réessayez l’enregistrement ou écrivez votre besoin.', 'AUDIO_TYPE_INVALID')

    const consentText = await db.consentText.findFirst({ where: { purpose: 'KEEP_AUDIO', version: meta.data.keepAudioConsentVersion } })
    if (!consentText) throw unprocessable('Le texte d’accord affiché n’est plus à jour. Rechargez la page.', 'CONSENT_TEXT_UNKNOWN')

    const storageKey = await storage.put(data, realType)
    const audio = await db.$transaction(async (tx) => {
      await tx.consent.create({
        data: { beneficiaryId: actor.beneficiaryId!, purpose: 'KEEP_AUDIO', granted: true, textVersion: consentText.version, recordedById: actor.accountId },
      })
      return tx.audioAsset.create({
        data: {
          beneficiaryId: actor.beneficiaryId!, storageKey, mimeType: realType, sizeBytes: data.length,
          durationSeconds: meta.data.durationSeconds, locale: meta.data.locale,
        },
      })
    })
    return reply.status(201).send({ id: audio.id, mimeType: realType, sizeBytes: data.length })
  })

  app.delete('/api/me/audio/:id', { schema: { params: idParam, tags: ['audio'] } }, async (req) => {
    const actor = requireRole(req, 'BENEFICIARY')
    const audio = await db.audioAsset.findFirst({ where: { id: idParam.parse(req.params).id, beneficiaryId: actor.beneficiaryId!, deletedAt: null } })
    if (!audio) throw notFound()
    await db.audioAsset.update({ where: { id: audio.id }, data: { deletedAt: ctx.now() } })
    await storage.delete(audio.storageKey)
    return { deleted: true }
  })

  /** Délivre un lien d'écoute temporaire, après contrôle des droits sur CET enregistrement. */
  app.get('/api/audio/:id/access', { schema: { params: idParam, tags: ['audio'] } }, async (req) => {
    const actor = requireActor(req)
    const audio = await db.audioAsset.findFirst({
      where: { id: idParam.parse(req.params).id, deletedAt: null },
      include: { request: { select: { teamId: true } } },
    })
    if (!audio) throw notFound()
    const allowed =
      (actor.role === 'BENEFICIARY' && audio.beneficiaryId === actor.beneficiaryId) ||
      (actor.role === 'AGENT' && audio.request !== null && audio.request.teamId === actor.teamId)
    if (!allowed) throw notFound()
    const exp = ctx.now().getTime() + ACCESS_TTL_MS
    return { url: `/api/audio/stream/${audio.id}?exp=${exp}&sig=${sign(audio.id, exp)}`, expiresAt: new Date(exp).toISOString() }
  })

  app.get('/api/audio/stream/:id', {
    schema: { params: idParam, querystring: z.object({ exp: z.coerce.number(), sig: z.string().length(64) }), tags: ['audio'] },
  }, async (req, reply) => {
    const { id } = idParam.parse(req.params)
    const { exp, sig } = z.object({ exp: z.coerce.number(), sig: z.string().length(64) }).parse(req.query)
    if (exp < ctx.now().getTime() || !safeEqual(sig, sign(id, exp))) throw forbidden()
    const audio = await db.audioAsset.findFirst({ where: { id, deletedAt: null } })
    if (!audio) throw notFound()
    const data = await storage.get(audio.storageKey)
    reply
      .header('content-type', audio.mimeType)
      .header('cache-control', 'no-store, private')
      .header('content-disposition', 'inline')
    return reply.send(data)
  })

  /** Transcription HUMAINE par un agent de l'équipe (aucune transcription automatique par défaut). */
  app.post('/api/agent/audio/:id/transcription', {
    schema: { params: idParam, body: z.object({ text: z.string().trim().min(1).max(2000) }), tags: ['audio'] },
  }, async (req) => {
    const actor = requireRole(req, 'AGENT')
    const { text } = z.object({ text: z.string().trim().min(1).max(2000) }).parse(req.body)
    const audio = await db.audioAsset.findFirst({
      where: { id: idParam.parse(req.params).id, deletedAt: null, request: { teamId: actor.teamId! } },
      include: { request: { select: { id: true } } },
    })
    if (!audio || !audio.request) throw notFound()
    await db.$transaction(async (tx) => {
      await tx.audioAsset.update({ where: { id: audio.id }, data: { transcription: text, transcribedById: actor.accountId } })
      await recordEvent(tx, { requestId: audio.request!.id, type: 'AUDIO_TRANSCRIBED_BY_HUMAN', actor })
    })
    return { saved: true }
  })
}
