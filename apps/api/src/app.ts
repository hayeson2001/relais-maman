import Fastify, { type FastifyInstance } from 'fastify'
import cookie from '@fastify/cookie'
import helmet from '@fastify/helmet'
import rateLimit from '@fastify/rate-limit'
import multipart from '@fastify/multipart'
import swagger from '@fastify/swagger'
import swaggerUi from '@fastify/swagger-ui'
import fastifyStatic from '@fastify/static'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { ZodError } from 'zod'
import {
  hasZodFastifySchemaValidationErrors,
  jsonSchemaTransform,
  serializerCompiler,
  validatorCompiler,
} from 'fastify-type-provider-zod'
import type { AppContext } from './context.ts'
import { resolveSession, SESSION_COOKIE, type Actor } from './auth/sessions.ts'
import { safeEqual, sha256 } from './auth/secrets.ts'
import { AppError } from './http/errors.ts'
import { VersionConflictError } from './db.ts'
import { authRoutes } from './routes/auth.ts'
import { beneficiaryRoutes } from './routes/beneficiary.ts'
import { agentRoutes } from './routes/agent.ts'
import { facilityRoutes } from './routes/facility.ts'
import { adminRoutes } from './routes/admin.ts'
import { audioRoutes } from './routes/audio.ts'
import { webhookRoutes } from './routes/webhooks.ts'
import { publicRoutes } from './routes/public.ts'

declare module 'fastify' {
  interface FastifyRequest {
    actor: Actor | null
  }
}

const UNSAFE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

export async function buildApp(ctx: AppContext, opts: { logStream?: NodeJS.WritableStream } = {}): Promise<FastifyInstance> {
  const app = Fastify({
    trustProxy: ctx.config.APP_ENV === 'pilot' || ctx.config.APP_ENV === 'production',
    logger:
      ctx.config.APP_ENV === 'test'
        ? false
        : {
            level: 'info',
            ...(opts.logStream ? { stream: opts.logStream } : {}),
            // Aucune donnée personnelle dans les journaux : ni corps, ni cookies, ni en-têtes d'auth.
            redact: ['req.headers.cookie', 'req.headers.authorization', 'req.headers["x-csrf-token"]'],
            serializers: {
              req: (r) => ({ method: r.method, url: r.url.split('?')[0] }),
            },
          },
    bodyLimit: 64 * 1024,
  })

  app.setValidatorCompiler(validatorCompiler)
  app.setSerializerCompiler(serializerCompiler)
  app.decorateRequest('actor', null)

  await app.register(cookie, { secret: ctx.config.APP_SECRET })
  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:'],
        mediaSrc: ["'self'", 'blob:'],
        connectSrc: ["'self'"],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
      },
    },
  })
  // Limite par SESSION quand l'utilisateur est connecté, par adresse sinon : plusieurs
  // agents derrière la même box (centre de santé, bureau) partagent une seule IP publique
  // et se bloquaient mutuellement avec une limite par IP. Les connexions restent limitées
  // par adresse ET par identifiant (auth/attempts.ts).
  await app.register(rateLimit, {
    global: true,
    max: 300,
    timeWindow: '1 minute',
    keyGenerator: (req) => {
      const token = req.cookies?.[SESSION_COOKIE]
      return token ? `s:${sha256(token)}` : `ip:${req.ip}`
    },
  })
  await app.register(multipart, { limits: { fileSize: 2 * 1024 * 1024, files: 1, fields: 5 } })

  await app.register(swagger, {
    openapi: {
      info: {
        title: 'Relais Maman API',
        version: '0.2.0',
        description: 'API de coordination. Données fictives uniquement hors pilote validé.',
      },
      components: { securitySchemes: { session: { type: 'apiKey', in: 'cookie', name: SESSION_COOKIE } } },
    },
    transform: jsonSchemaTransform,
  })
  if (ctx.config.APP_ENV !== 'production') await app.register(swaggerUi, { routePrefix: '/api/docs' })

  // Résolution de la session et contrôle CSRF pour chaque requête API.
  app.addHook('onRequest', async (req) => {
    if (!req.url.startsWith('/api/')) return
    req.actor = await resolveSession(ctx.db, req.cookies[SESSION_COOKIE])

    if (!UNSAFE_METHODS.has(req.method) || req.url.startsWith('/api/webhooks/')) return
    if (req.actor) {
      // Session présente : le jeton CSRF (lié à la session, servi par /api/auth/me et gardé
      // en mémoire par l'interface) doit accompagner toute modification.
      const header = req.headers['x-csrf-token']
      if (typeof header !== 'string' || !safeEqual(header, req.actor.csrfToken)) {
        throw new AppError(403, 'CSRF', 'Rechargez la page puis réessayez.')
      }
    } else {
      // Pas encore de session (connexion, activation) : on refuse les origines étrangères.
      const origin = req.headers.origin
      if (origin && new URL(origin).host !== req.headers.host) {
        throw new AppError(403, 'BAD_ORIGIN', 'Requête refusée.')
      }
    }
  })

  app.setErrorHandler((error, req, reply) => {
    if (error instanceof AppError) {
      return reply.status(error.statusCode).send({ error: error.code, message: error.message })
    }
    if (error instanceof VersionConflictError) {
      return reply.status(409).send({ error: 'VERSION_CONFLICT', message: error.message })
    }
    if (error instanceof ZodError || hasZodFastifySchemaValidationErrors(error)) {
      const issues = error instanceof ZodError ? error.issues : error.validation
      const first = issues[0] as { message?: string } | undefined
      return reply.status(400).send({
        error: 'VALIDATION',
        message: first?.message ? `Vérifiez votre saisie : ${first.message}` : 'Vérifiez votre saisie.',
      })
    }
    const status = (error as { statusCode?: number }).statusCode
    if (status === 429) {
      return reply.status(429).send({ error: 'RATE_LIMITED', message: 'Trop de demandes. Patientez une minute puis réessayez.' })
    }
    if (status === 413) {
      return reply.status(413).send({ error: 'TOO_LARGE', message: 'Fichier trop volumineux (2 Mo maximum).' })
    }
    // Erreur inattendue : journalisée sans données personnelles, message générique au client.
    const e = error as Error
    req.log.error({ err: { message: e.message, name: e.name } }, 'Erreur inattendue')
    return reply.status(500).send({ error: 'INTERNAL', message: 'Un problème est survenu. Réessayez dans un instant.' })
  })

  await authRoutes(app, ctx)
  await publicRoutes(app, ctx)
  await beneficiaryRoutes(app, ctx)
  await agentRoutes(app, ctx)
  await facilityRoutes(app, ctx)
  await adminRoutes(app, ctx)
  await audioRoutes(app, ctx)
  await webhookRoutes(app, ctx)

  // En production, l'API sert aussi l'interface compilée (même origine : cookies stricts).
  const webDist = ctx.config.WEB_DIST_DIR ? resolve(ctx.config.WEB_DIST_DIR) : null
  if (webDist && existsSync(webDist)) {
    // preCompressed : sert index.js.br / .gz générés à la compilation (scripts/compress.mjs),
    // sinon l'interface partait non compressée (329 Ko au lieu d'environ 103).
    await app.register(fastifyStatic, { root: webDist, wildcard: false, preCompressed: true })
    app.setNotFoundHandler((req, reply) => {
      if (req.url.startsWith('/api/')) return reply.status(404).send({ error: 'NOT_FOUND', message: 'Ressource inconnue.' })
      // Ressource statique absente (ex. ancienne version après redéploiement) : vraie 404,
      // jamais la page HTML, qui serait refusée par le navigateur avec une erreur obscure.
      if (/\.[a-z0-9]+$/i.test(req.url.split('?')[0]!)) return reply.status(404).send('Introuvable')
      return reply.sendFile('index.html')
    })
  }

  return app
}
