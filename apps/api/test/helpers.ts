import type { FastifyInstance, LightMyRequestResponse } from 'fastify'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { buildApp } from '../src/app.ts'
import { loadConfig } from '../src/config.ts'
import { createContext, type AppContext } from '../src/context.ts'
import { createDb, type Db } from '../src/db.ts'
import { createLocalStorage } from '../src/storage/index.ts'
import { truncateAll } from '../src/demo/reset.ts'
import { DEMO, seedDemo } from '../src/demo/seed.ts'
import { currentTotp } from '../src/auth/totp.ts'

export { DEMO }

const TEST_URL = process.env.TEST_DATABASE_URL ?? 'postgresql://relais@127.0.0.1:54329/relais_maman_test'
process.env.APP_SECRET ??= 'test-app-secret-0123456789abcdef0123456789abcdef'

/** Horloge contrôlable : permet de « faire passer le temps » sans attendre. */
export class Clock {
  current = new Date('2026-10-26T09:00:00.000Z')
  now = () => new Date(this.current)
  advance(ms: number) {
    this.current = new Date(this.current.getTime() + ms)
  }
}
export const HOUR = 3_600_000
export const DAY = 24 * HOUR

let sharedDb: Db | null = null

export interface TestEnv {
  app: FastifyInstance
  ctx: AppContext
  db: Db
  clock: Clock
  seeded: Awaited<ReturnType<typeof seedDemo>>
}

export async function setupTestEnv(): Promise<TestEnv> {
  sharedDb ??= createDb(TEST_URL)
  const db = sharedDb
  const clock = new Clock()
  const config = loadConfig({
    ...process.env,
    APP_ENV: 'test',
    DATABASE_URL: TEST_URL,
    APP_SECRET: process.env.APP_SECRET,
    WEBHOOK_SIGNING_SECRET: 'test-webhook-signing-secret',
    SMS_PROVIDER: 'simulator',
    VOICE_PROVIDER: 'simulator',
  })
  await truncateAll(db)
  const seeded = await seedDemo(db, clock.now())
  const storage = createLocalStorage(mkdtempSync(join(tmpdir(), 'rm-audio-')))
  const ctx = createContext({ db, config, storage, now: clock.now })
  const app = await buildApp(ctx)
  return { app, ctx, db, clock, seeded }
}

/** Client HTTP de test : conserve le cookie de session et le jeton CSRF, comme le navigateur. */
export class Session {
  cookie = ''
  csrf = ''
  constructor(private app: FastifyInstance) {}

  private captureCookie(res: LightMyRequestResponse) {
    const set = res.headers['set-cookie']
    const raw = Array.isArray(set) ? set[0] : set
    if (raw) this.cookie = raw.split(';')[0]!
  }

  async refreshCsrf() {
    const me = await this.get('/api/auth/me')
    this.csrf = me.json().csrfToken
    return me
  }

  async staff(username: string, password: string) {
    const res = await this.app.inject({ method: 'POST', url: '/api/auth/staff/login', payload: { username, password } })
    this.captureCookie(res)
    if (res.statusCode === 200) await this.refreshCsrf()
    return res
  }

  async beneficiary(identifier: string, pin: string) {
    const res = await this.app.inject({ method: 'POST', url: '/api/auth/beneficiary/login', payload: { identifier, pin } })
    this.captureCookie(res)
    if (res.statusCode === 200) await this.refreshCsrf()
    return res
  }

  async activate(identifier: string, activationCode: string, newPin: string) {
    const res = await this.app.inject({ method: 'POST', url: '/api/auth/beneficiary/activate', payload: { identifier, activationCode, newPin } })
    this.captureCookie(res)
    if (res.statusCode === 200) await this.refreshCsrf()
    return res
  }

  /** Admin de démo avec double vérification. */
  async strongAdmin(clock: Clock) {
    await this.staff(DEMO.admin.loginId, DEMO.admin.password)
    return this.post('/api/auth/totp/verify', { code: currentTotp(DEMO.admin.totpSecret, clock.now().getTime()) })
  }

  get(url: string) {
    return this.app.inject({ method: 'GET', url, headers: this.cookie ? { cookie: this.cookie } : {} })
  }

  post(url: string, payload?: unknown, opts: { csrf?: boolean } = {}) {
    const headers: Record<string, string> = {}
    if (this.cookie) headers.cookie = this.cookie
    if (opts.csrf !== false && this.csrf) headers['x-csrf-token'] = this.csrf
    return this.app.inject({ method: 'POST', url, headers, payload: payload as never })
  }

  put(url: string, payload?: unknown) {
    return this.app.inject({ method: 'PUT', url, headers: { cookie: this.cookie, 'x-csrf-token': this.csrf }, payload: payload as never })
  }

  delete(url: string) {
    return this.app.inject({ method: 'DELETE', url, headers: { cookie: this.cookie, 'x-csrf-token': this.csrf } })
  }
}

export const newKey = () => crypto.randomUUID()
export const CONSENT = 'fr-2026-10-v1'
