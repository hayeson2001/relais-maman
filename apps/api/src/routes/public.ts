import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import type { AppContext } from '../context.ts'

/** Informations publiques nécessaires avant connexion. Aucune donnée personnelle. */
export async function publicRoutes(app: FastifyInstance, ctx: AppContext) {
  const { db } = ctx

  app.get('/api/health', { schema: { tags: ['public'] } }, async () => {
    await db.$queryRaw`SELECT 1`
    return { status: 'ok', env: ctx.config.APP_ENV }
  })

  /** Seules les langues réellement disponibles sont proposées aux bénéficiaires. */
  app.get('/api/public/languages', { schema: { tags: ['public'] } }, async () =>
    db.language.findMany({ where: { uiAvailable: true }, select: { code: true, name: true, nativeName: true } }),
  )

  app.get('/api/public/consent-texts', { schema: { querystring: z.object({ locale: z.string().default('fr') }), tags: ['public'] } }, async (req) => {
    const { locale } = z.object({ locale: z.string().default('fr') }).parse(req.query)
    const texts = await db.consentText.findMany({ where: { locale }, orderBy: { createdAt: 'desc' } })
    const latest = new Map<string, (typeof texts)[number]>()
    for (const t of texts) if (!latest.has(t.purpose)) latest.set(t.purpose, t)
    return [...latest.values()].map((t) => ({ purpose: t.purpose, version: t.version, body: t.body, reviewed: t.reviewed }))
  })

  /** Contenus audio VALIDÉS seulement : pas de fausse lecture vocale pour une langue non prête. */
  app.get('/api/public/audio-contents', { schema: { querystring: z.object({ locale: z.string() }), tags: ['public'] } }, async (req) => {
    const { locale } = z.object({ locale: z.string() }).parse(req.query)
    return db.audioContent.findMany({
      where: { locale, validation: 'VALIDATED', storageKey: { not: null } },
      select: { messageKey: true, version: true, transcript: true },
    })
  })
}
