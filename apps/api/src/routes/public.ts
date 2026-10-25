import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import type { AppContext } from '../context.ts'
import { DEMO } from '../demo/seed.ts'
import { notFound } from '../http/errors.ts'

/** Informations publiques nécessaires avant connexion. Aucune donnée personnelle. */
export async function publicRoutes(app: FastifyInstance, ctx: AppContext) {
  const { db } = ctx

  app.get('/api/health', { schema: { tags: ['public'] } }, async () => {
    await db.$queryRaw`SELECT 1`
    return { status: 'ok', env: ctx.config.APP_ENV }
  })

  /**
   * Démo publique uniquement : comptes FICTIFS à essayer (déjà publiés dans le dépôt).
   * L'administration n'y figure pas. Introuvable dans tout autre environnement.
   */
  app.get('/api/public/demo-accounts', { schema: { tags: ['public'] } }, async () => {
    if (ctx.config.APP_ENV !== 'demo') throw notFound()
    return {
      resetHour: ctx.config.DEMO_AUTO_RESET ? ctx.config.DEMO_RESET_HOUR : null,
      accounts: [
        { space: 'beneficiary', name: 'Ama K.', login: DEMO.ama.identifier, secret: DEMO.ama.pin },
        { space: 'beneficiary', name: 'Abiba T.', login: DEMO.abiba.identifier, secret: DEMO.abiba.pin },
        { space: 'staff', name: 'Esi (agent, East team)', login: DEMO.agentEst.loginId, secret: DEMO.agentEst.password },
        { space: 'staff', name: 'Afi (agent, West team)', login: DEMO.agentOuest.loginId, secret: DEMO.agentOuest.password },
        { space: 'staff', name: 'Facility A (can confirm care)', login: DEMO.referentA.loginId, secret: DEMO.referentA.password },
        { space: 'staff', name: 'Facility B (cannot confirm care)', login: DEMO.referentB.loginId, secret: DEMO.referentB.password },
      ],
    }
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
