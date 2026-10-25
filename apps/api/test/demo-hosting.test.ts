import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Writable } from 'node:stream'
import { DEMO, Session, setupTestEnv, type TestEnv } from './helpers.ts'
import { buildApp } from '../src/app.ts'
import { loadConfig } from '../src/config.ts'
import { createContext } from '../src/context.ts'
import { truncateAll } from '../src/demo/reset.ts'
import { localDayHour, resetDue, startDemoAutoReset } from '../src/demo/autoReset.ts'
import { workerTick } from '../src/worker/loop.ts'

const silent = { info: () => {}, error: () => {} }
const sink = new Writable({ write: (_chunk, _enc, done) => done() })
const demoConfig = (extra: Record<string, string> = {}) =>
  loadConfig({
    ...process.env,
    APP_ENV: 'demo',
    DATABASE_URL: process.env.TEST_DATABASE_URL ?? 'postgresql://relais@127.0.0.1:54329/relais_maman_test',
    STORAGE_LOCAL_DIR: '../../.local/test-demo-audio',
    ...extra,
  })

describe('Configuration de la démo hébergée', () => {
  it('écoute sur 127.0.0.1 par défaut, worker séparé, pas de remise à zéro automatique', () => {
    const c = demoConfig()
    expect(c.HOST).toBe('127.0.0.1')
    expect(c.WORKER_INLINE).toBe(false)
    expect(c.DEMO_AUTO_RESET).toBe(false)
    expect(c.DEMO_RESET_HOUR).toBe(3)
  })

  it('remise à zéro automatique refusée en pilote et en production', () => {
    for (const APP_ENV of ['pilot', 'production']) {
      expect(() => demoConfig({ APP_ENV, COOKIE_SECURE: 'true', DEMO_AUTO_RESET: 'true' })).toThrow(/DEMO_AUTO_RESET est refusé/)
    }
    expect(demoConfig({ DEMO_AUTO_RESET: 'true' }).DEMO_AUTO_RESET).toBe(true)
  })

  it('secret TOTP admin de remplacement : base32 exigé', () => {
    expect(() => demoConfig({ DEMO_ADMIN_TOTP_SECRET: 'pas-du-base32' })).toThrow(/base32/)
  })
})

describe('Remise à zéro nocturne', () => {
  it('jour et heure civils de Lomé', () => {
    expect(localDayHour(new Date('2026-10-26T03:15:00Z'), 'Africa/Lome')).toEqual({ day: '2026-10-26', hour: 3 })
  })

  it('une seule fois par jour, pendant l’heure prévue', () => {
    const tz = 'Africa/Lome'
    expect(resetDue(new Date('2026-10-26T03:01:00Z'), '2026-10-25', 3, tz)).toBe(true)
    expect(resetDue(new Date('2026-10-26T03:30:00Z'), '2026-10-26', 3, tz)).toBe(false)
    expect(resetDue(new Date('2026-10-26T04:00:00Z'), '2026-10-25', 3, tz)).toBe(false)
    expect(resetDue(new Date('2026-10-26T02:59:00Z'), '2026-10-25', 3, tz)).toBe(false)
  })
})

describe('Démo publique : base vide, comptes affichés, secrets admin remplacés', () => {
  let env: TestEnv
  beforeEach(async () => {
    env = await setupTestEnv()
  })
  afterEach(async () => {
    delete process.env.DEMO_ADMIN_PASSWORD
    await env.app.close()
  })

  it('crée les données fictives au démarrage si la base est vide, et ne touche pas une base remplie', async () => {
    await truncateAll(env.db)
    const ctx = createContext({ db: env.db, config: demoConfig({ DEMO_AUTO_RESET: 'true' }), storage: env.ctx.storage })
    const stop = await startDemoAutoReset(ctx, silent, 3_600_000)
    stop()
    expect(await env.db.account.count()).toBeGreaterThan(0)

    const before = await env.db.request.count()
    await env.db.request.deleteMany({ where: {} })
    const stop2 = await startDemoAutoReset(ctx, silent, 3_600_000)
    stop2()
    expect(before).toBeGreaterThan(0)
    expect(await env.db.request.count()).toBe(0) // base non vide : rien n'est recréé au démarrage
  })

  it('la liste des comptes n’existe qu’en démo et ne contient pas l’administration', async () => {
    expect((await env.app.inject({ method: 'GET', url: '/api/public/demo-accounts' })).statusCode).toBe(404)

    const app = await buildApp(createContext({ db: env.db, config: demoConfig({ DEMO_AUTO_RESET: 'true' }), storage: env.ctx.storage }), { logStream: sink })
    const res = await app.inject({ method: 'GET', url: '/api/public/demo-accounts' })
    await app.close()
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.resetHour).toBe(3)
    expect(body.accounts.map((a: { login: string }) => a.login)).toContain(DEMO.ama.identifier)
    expect(JSON.stringify(body)).not.toContain(DEMO.admin.loginId)
    expect(JSON.stringify(body)).not.toContain(DEMO.admin.totpSecret)
  })

  it('DEMO_ADMIN_PASSWORD remplace le mot de passe admin publié dans le dépôt', async () => {
    process.env.DEMO_ADMIN_PASSWORD = 'mot-de-passe-demo-prive'
    await truncateAll(env.db)
    const ctx = createContext({ db: env.db, config: demoConfig({ DEMO_AUTO_RESET: 'true' }), storage: env.ctx.storage })
    ;(await startDemoAutoReset(ctx, silent, 3_600_000))()
    const s = new Session(env.app)
    expect((await s.staff(DEMO.admin.loginId, DEMO.admin.password)).statusCode).toBe(401)
    expect((await s.staff(DEMO.admin.loginId, 'mot-de-passe-demo-prive')).statusCode).toBe(200)
  })

  it('un passage du worker renvoie son bilan', async () => {
    const summary = await workerTick(env.ctx)
    expect(summary).toHaveProperty('outbox')
    expect(summary).toHaveProperty('due')
    expect(summary).toHaveProperty('purge')
  })
})
