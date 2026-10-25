import { z } from 'zod'

const schema = z.object({
  APP_ENV: z.enum(['local', 'test', 'demo', 'pilot', 'production']).default('local'),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().min(1),
  APP_SECRET: z.string().min(32, 'APP_SECRET : au moins 32 caractères (openssl rand -hex 32)'),
  COOKIE_SECURE: z.enum(['true', 'false']).default('false').transform((v) => v === 'true'),
  DEFAULT_COUNTRY: z.string().length(2).default('TG'),
  STORAGE_DRIVER: z.enum(['local', 's3']).default('local'),
  STORAGE_LOCAL_DIR: z.string().default('.local/audio'),
  S3_ENDPOINT: z.string().optional(),
  S3_REGION: z.string().default('us-east-1'),
  S3_BUCKET: z.string().default('relais-maman-audio'),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  SMS_PROVIDER: z.string().default('simulator'),
  VOICE_PROVIDER: z.string().default('simulator'),
  TRANSCRIPTION_PROVIDER: z.string().default('none'),
  WEBHOOK_SIGNING_SECRET: z.string().min(16).default('test-webhook-secret-not-for-prod'),
  WEB_DIST_DIR: z.string().optional(),
  /** 0.0.0.0 derrière un hébergeur (conteneur) ; 127.0.0.1 par défaut sur un poste. */
  HOST: z.string().default('127.0.0.1'),
  /** Fait tourner le worker dans le processus de l'API (démo à un seul service). */
  WORKER_INLINE: z.enum(['true', 'false']).default('false').transform((v) => v === 'true'),
  /** Démo publique : remise à zéro automatique chaque nuit, et données fictives créées si la base est vide. */
  DEMO_AUTO_RESET: z.enum(['true', 'false']).default('false').transform((v) => v === 'true'),
  DEMO_RESET_HOUR: z.coerce.number().int().min(0).max(23).default(3),
  /** Démo publique : remplacent le mot de passe et le secret TOTP admin publiés dans le dépôt. */
  DEMO_ADMIN_PASSWORD: z.string().min(12).optional(),
  DEMO_ADMIN_TOTP_SECRET: z.string().regex(/^[A-Z2-7]{16,}$/, 'secret base32 (A-Z, 2-7), au moins 16 caractères').optional(),
})

export type AppConfig = z.infer<typeof schema>

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = schema.safeParse(env)
  if (!parsed.success) {
    throw new Error(
      'Configuration invalide :\n' + parsed.error.issues.map((i) => `- ${i.path.join('.')} : ${i.message}`).join('\n'),
    )
  }
  const config = parsed.data
  if ((config.APP_ENV === 'pilot' || config.APP_ENV === 'production') && !config.COOKIE_SECURE) {
    throw new Error('COOKIE_SECURE=true est obligatoire en pilote et en production (HTTPS).')
  }
  if (config.DEMO_AUTO_RESET && !demoResetAllowed(config)) {
    throw new Error(`DEMO_AUTO_RESET est refusé avec APP_ENV=${config.APP_ENV} : il effacerait des données réelles.`)
  }
  return config
}

/** La remise à zéro de démonstration est interdite hors local/test/demo. */
export const demoResetAllowed = (config: AppConfig) => ['local', 'test', 'demo'].includes(config.APP_ENV)
