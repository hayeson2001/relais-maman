import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { DEMO, Session, setupTestEnv, type TestEnv } from './helpers.ts'

describe('Authentification', () => {
  let env: TestEnv
  beforeEach(async () => {
    env = await setupTestEnv()
  })
  afterEach(() => env.app.close())

  it('cookie de session HttpOnly, SameSite=Strict, jamais de jeton dans la réponse JSON', async () => {
    const res = await env.app.inject({ method: 'POST', url: '/api/auth/staff/login', payload: { username: DEMO.agentEst.loginId, password: DEMO.agentEst.password } })
    const cookie = String(res.headers['set-cookie'])
    expect(cookie).toMatch(/HttpOnly/i)
    expect(cookie).toMatch(/SameSite=Strict/i)
    expect(Object.keys(res.json())).not.toContain('token')
  })

  it('le hash de session est seul stocké en base, pas le jeton', async () => {
    const s = new Session(env.app)
    await s.staff(DEMO.agentEst.loginId, DEMO.agentEst.password)
    const token = decodeURIComponent(s.cookie.split('=')[1]!)
    expect(await env.db.session.findUnique({ where: { id: token } })).toBeNull()
    expect(await env.db.session.count()).toBe(1)
  })

  it('mauvais identifiants : message générique, sans dire lequel est faux', async () => {
    const s = new Session(env.app)
    const unknown = await s.staff('inconnu', 'x')
    const wrong = await s.staff(DEMO.agentEst.loginId, 'mauvais')
    expect(unknown.statusCode).toBe(401)
    expect(wrong.json().message).toBe(unknown.json().message)
  })

  it('déconnexion : la session est révoquée côté serveur et l’interface doit purger ses données', async () => {
    const s = new Session(env.app)
    await s.beneficiary(DEMO.ama.identifier, DEMO.ama.pin)
    const out = await s.post('/api/auth/logout')
    expect(out.json()).toEqual({ loggedOut: true, purgeLocalData: true })
    expect((await s.get('/api/me/overview')).statusCode).toBe(401)
  })

  describe('Bénéficiaire : activation assistée et récupération supervisée', () => {
    it('activation avec le code à usage unique remis par l’agent', async () => {
      const yawa = new Session(env.app)
      const res = await yawa.activate(DEMO.yawa.identifier, DEMO.yawa.activationCode, '804217')
      expect(res.statusCode).toBe(200)
      expect((await yawa.get('/api/me/overview')).statusCode).toBe(200)
      // Le même code ne fonctionne pas deux fois.
      const again = await new Session(env.app).activate(DEMO.yawa.identifier, DEMO.yawa.activationCode, '559102')
      expect(again.statusCode).toBe(401)
      // Le nouveau code personnel fonctionne.
      expect((await new Session(env.app).beneficiary(DEMO.yawa.identifier, '804217')).statusCode).toBe(200)
    })

    it('un code personnel trop simple est refusé', async () => {
      for (const pin of ['123456', '000000', '654321']) {
        const res = await new Session(env.app).activate(DEMO.yawa.identifier, DEMO.yawa.activationCode, pin)
        expect(res.json().error, pin).toBe('WEAK_PIN')
      }
    })

    it('un compte non activé ne se connecte pas avec un code personnel', async () => {
      expect((await new Session(env.app).beneficiary(DEMO.yawa.identifier, '804217')).statusCode).toBe(401)
    })

    it('5 échecs : verrouillage temporaire ; le bon code est alors refusé aussi', async () => {
      for (let i = 0; i < 5; i++) await new Session(env.app).beneficiary(DEMO.ama.identifier, '111222')
      const res = await new Session(env.app).beneficiary(DEMO.ama.identifier, DEMO.ama.pin)
      expect(res.statusCode).toBe(423)
      expect(res.json().error).toBe('ACCOUNT_TEMPORARILY_LOCKED')
    })

    it('10 échecs : blocage, puis déblocage supervisé par l’agent de son équipe', async () => {
      const account = await env.db.account.findUniqueOrThrow({ where: { loginId: DEMO.ama.identifier } })
      await env.db.account.update({ where: { id: account.id }, data: { failedAttempts: 9 } })
      await new Session(env.app).beneficiary(DEMO.ama.identifier, '111222')
      expect((await env.db.account.findUniqueOrThrow({ where: { id: account.id } })).status).toBe('LOCKED')
      expect((await new Session(env.app).beneficiary(DEMO.ama.identifier, DEMO.ama.pin)).json().error).toBe('ACCOUNT_LOCKED')

      const esi = new Session(env.app)
      await esi.staff(DEMO.agentEst.loginId, DEMO.agentEst.password)
      const beneficiary = await env.db.beneficiary.findUniqueOrThrow({ where: { accountId: account.id } })
      const recovery = await esi.post(`/api/agent/beneficiaries/${beneficiary.id}/recovery`)
      expect(recovery.json()).toMatchObject({ shownOnce: true })
      const code = recovery.json().activationCode as string
      // Le code n'est stocké que haché.
      const stored = await env.db.activationCode.findFirstOrThrow({ where: { accountId: account.id, purpose: 'SUPERVISED_RECOVERY' } })
      expect(stored.codeHash).not.toContain(code)

      const amaS = new Session(env.app)
      expect((await amaS.activate(DEMO.ama.identifier, code, '305718')).statusCode).toBe(200)
      expect((await env.db.account.findUniqueOrThrow({ where: { id: account.id } })).status).toBe('ACTIVE')
    })

    it('inscription assistée par un agent, sans e-mail', async () => {
      const esi = new Session(env.app)
      await esi.staff(DEMO.agentEst.loginId, DEMO.agentEst.password)
      const res = await esi.post('/api/agent/beneficiaries', {
        displayName: 'Sena A.', activityLabel: 'Revendeuse', phoneIsShared: true, preferredLocale: 'fr',
        children: [{ firstName: 'Kossi', birthYearMonth: '2026-06' }],
      })
      expect(res.statusCode).toBe(201)
      const { identifier, activationCode } = res.json()
      expect(identifier).toMatch(/^RM-[A-Z2-9]{4}-[A-Z2-9]{4}$/)
      expect((await new Session(env.app).activate(identifier, activationCode, '927364')).statusCode).toBe(200)
    })

    it('un code d’activation expiré est refusé', async () => {
      const account = await env.db.account.findUniqueOrThrow({ where: { loginId: DEMO.yawa.identifier } })
      await env.db.activationCode.updateMany({ where: { accountId: account.id }, data: { expiresAt: new Date(Date.now() - 1000) } })
      expect((await new Session(env.app).activate(DEMO.yawa.identifier, DEMO.yawa.activationCode, '804217')).statusCode).toBe(401)
    })
  })

  it('un compte désactivé perd l’accès immédiatement, même avec une session ouverte', async () => {
    const s = new Session(env.app)
    await s.staff(DEMO.agentEst.loginId, DEMO.agentEst.password)
    expect((await s.get('/api/agent/requests')).statusCode).toBe(200)
    await env.db.account.update({ where: { loginId: DEMO.agentEst.loginId }, data: { status: 'DISABLED' } })
    expect((await s.get('/api/agent/requests')).statusCode).toBe(401)
  })
})
