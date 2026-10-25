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
  return config
}

/** La remise à zéro de démonstration est interdite hors local/test/demo. */
export const demoResetAllowed = (config: AppConfig) => ['local', 'test', 'demo'].includes(config.APP_ENV)
