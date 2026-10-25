import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { CONSENT, DAY, DEMO, newKey, Session, setupTestEnv, type TestEnv } from './helpers.ts'

/**
 * Autorisations côté serveur (section 4) : masquer un bouton ne suffit pas, chaque appel
 * direct à l'API est contrôlé objet par objet.
 */
describe('Autorisations par rôle et par périmètre', () => {
  let env: TestEnv
  let amaRequestId: string
  let abibaRequestId: string
  let akouRequestId: string
  let amaSlotId: string

  beforeAll(async () => {
    env = await setupTestEnv()
    abibaRequestId = (await env.db.request.findFirstOrThrow({ where: { category: 'TRANSPORT' } })).id
    akouRequestId = (await env.db.request.findFirstOrThrow({ where: { category: 'COST' } })).id

    // Ama crée une demande, l'agente Esi la prépare et propose un créneau au centre A.
    const ama = new Session(env.app)
    await ama.beneficiary(DEMO.ama.identifier, DEMO.ama.pin)
    amaRequestId = (await ama.post('/api/me/requests', {
      idempotencyKey: newKey(), appointmentId: null, category: 'UNDERSTANDING',
      text: 'Je ne sais pas quels papiers apporter.', locale: 'fr', transmissionConsentVersion: CONSENT,
    })).json().id
    const esi = new Session(env.app)
    await esi.staff(DEMO.agentEst.loginId, DEMO.agentEst.password)
    await esi.post(`/api/agent/requests/${amaRequestId}/transitions/START_REVIEW`, { expectedVersion: 0 })
    amaSlotId = (await esi.post(`/api/agent/requests/${amaRequestId}/slots`, {
      expectedVersion: 1, facilityId: env.seeded.centreA.id, startsAt: new Date(env.clock.now().getTime() + 2 * DAY).toISOString(),
    })).json().id
  })
  afterAll(() => env.app.close())

  describe('Sans session', () => {
    it('toute donnée privée exige une connexion', async () => {
      const anon = new Session(env.app)
      for (const url of ['/api/me/overview', '/api/agent/requests', '/api/facility/requests', '/api/admin/metrics', `/api/agent/requests/${amaRequestId}`]) {
        expect((await anon.get(url)).statusCode, url).toBe(401)
      }
    })
  })

  describe('Bénéficiaire', () => {
    it('ne voit que ses propres demandes', async () => {
      const abiba = new Session(env.app)
      await abiba.beneficiary(DEMO.abiba.identifier, DEMO.abiba.pin)
      const ids = (await abiba.get('/api/me/overview')).json().requests.map((r: { id: string }) => r.id)
      expect(ids).toEqual([abibaRequestId])
      expect((await abiba.get(`/api/me/requests/${amaRequestId}`)).statusCode).toBe(404)
    })

    it('ne peut pas répondre à un créneau destiné à une autre femme', async () => {
      const abiba = new Session(env.app)
      await abiba.beneficiary(DEMO.abiba.identifier, DEMO.abiba.pin)
      expect((await abiba.post(`/api/me/slots/${amaSlotId}/respond`, { response: 'DECLINE' })).statusCode).toBe(404)
    })

    it('ne peut pas viser le rendez-vous d’une autre femme', async () => {
      const abiba = new Session(env.app)
      await abiba.beneficiary(DEMO.abiba.identifier, DEMO.abiba.pin)
      const amaAppointment = env.seeded.amaAppointmentId
      const res = await abiba.post('/api/me/requests', {
        idempotencyKey: newKey(), appointmentId: amaAppointment, category: 'COST', text: 'Combien coûte la consultation ?',
        locale: 'fr', transmissionConsentVersion: CONSENT,
      })
      expect(res.statusCode).toBe(422)
    })

    it('n’a accès à aucune route agent, structure ou administration', async () => {
      const ama = new Session(env.app)
      await ama.beneficiary(DEMO.ama.identifier, DEMO.ama.pin)
      expect((await ama.get('/api/agent/requests')).statusCode).toBe(403)
      expect((await ama.get('/api/facility/requests')).statusCode).toBe(403)
      expect((await ama.get('/api/admin/metrics')).statusCode).toBe(403)
      expect((await ama.post(`/api/agent/requests/${amaRequestId}/transitions/CLOSE_WITHOUT_CARE`, { expectedVersion: 0, reason: 'OTHER' })).statusCode).toBe(403)
    })
  })

  describe('Agent', () => {
    it('un agent ne parcourt pas les dossiers d’une autre équipe', async () => {
      const afi = new Session(env.app) // équipe Ouest
      await afi.staff(DEMO.agentOuest.loginId, DEMO.agentOuest.password)
      const ids = (await afi.get('/api/agent/requests')).json().map((r: { id: string }) => r.id)
      expect(ids).toEqual([akouRequestId])
      expect((await afi.get(`/api/agent/requests/${amaRequestId}`)).statusCode).toBe(404)
      expect((await afi.post(`/api/agent/requests/${abibaRequestId}/transitions/START_REVIEW`, { expectedVersion: 0 })).statusCode).toBe(404)
      expect((await afi.post(`/api/agent/requests/${abibaRequestId}/messages`, { body: 'Bonjour' })).statusCode).toBe(404)
    })

    it('ne peut pas réaffecter vers un agent d’une autre équipe', async () => {
      const esi = new Session(env.app)
      await esi.staff(DEMO.agentEst.loginId, DEMO.agentEst.password)
      const afiId = (await env.db.account.findUniqueOrThrow({ where: { loginId: DEMO.agentOuest.loginId } })).id
      const res = await esi.post(`/api/agent/requests/${abibaRequestId}/reassign`, { expectedVersion: 0, agentId: afiId, reason: 'Test interdit' })
      expect(res.statusCode).toBe(422)
    })

    it('ne liste et ne rétablit que les bénéficiaires de son équipe', async () => {
      const afi = new Session(env.app)
      await afi.staff(DEMO.agentOuest.loginId, DEMO.agentOuest.password)
      const names = (await afi.get('/api/agent/beneficiaries')).json().map((b: { displayName: string }) => b.displayName)
      expect(names).toEqual(['Akou D.'])
      const amaBeneficiary = await env.db.beneficiary.findFirstOrThrow({ where: { account: { loginId: DEMO.ama.identifier } } })
      expect((await afi.post(`/api/agent/beneficiaries/${amaBeneficiary.id}/recovery`)).statusCode).toBe(404)
    })

    it('ne vérifie pas un soin en se faisant passer pour une structure', async () => {
      const afi = new Session(env.app)
      await afi.staff(DEMO.agentOuest.loginId, DEMO.agentOuest.password)
      const res = await afi.post(`/api/agent/requests/${akouRequestId}/transitions/VERIFY_CARE`, {
        expectedVersion: 3, careDate: env.clock.now().toISOString().slice(0, 10), source: 'FACILITY_CONFIRMATION', method: 'PHONE_CALL', note: 'Tentative de confusion de source',
      })
      expect(res.statusCode).toBe(422)
      expect(res.json().error).toBe('SOURCE_MISMATCH')
    })
  })

  describe('Référent de structure', () => {
    it('une structure ne voit pas les dossiers d’une autre structure', async () => {
      const refB = new Session(env.app)
      await refB.staff(DEMO.referentB.loginId, DEMO.referentB.password)
      const ids = (await refB.get('/api/facility/requests')).json().requests.map((r: { id: string }) => r.id)
      expect(ids).not.toContain(amaRequestId)
      expect((await refB.post(`/api/facility/slots/${amaSlotId}/confirm`)).statusCode).toBe(403) // non habilité de toute façon
    })

    it('une structure habilitée ne confirme pas un créneau d’une autre structure', async () => {
      const refA = new Session(env.app)
      await refA.staff(DEMO.referentA.loginId, DEMO.referentA.password)
      const abibaSlot = await env.db.slotProposal.create({
        data: { requestId: abibaRequestId, facilityId: env.seeded.centreB.id, startsAt: new Date(env.clock.now().getTime() + DAY), proposedById: env.seeded.agentEst.id, status: 'ACCEPTED' },
      })
      expect((await refA.post(`/api/facility/slots/${abibaSlot.id}/confirm`)).statusCode).toBe(404)
    })

    it('la vue structure ne contient ni texte libre, ni téléphone, ni messages', async () => {
      const refA = new Session(env.app)
      await refA.staff(DEMO.referentA.loginId, DEMO.referentA.password)
      const body = JSON.stringify((await refA.get('/api/facility/requests')).json())
      expect(body).toContain(amaRequestId)
      expect(body).not.toContain('papiers')
      expect(body).not.toContain('+999')
    })

    it('n’accède pas au dossier complet côté agent', async () => {
      const refA = new Session(env.app)
      await refA.staff(DEMO.referentA.loginId, DEMO.referentA.password)
      expect((await refA.get(`/api/agent/requests/${amaRequestId}`)).statusCode).toBe(403)
    })
  })

  describe('Administrateur', () => {
    it('les fonctions d’administration exigent la double vérification', async () => {
      const admin = new Session(env.app)
      await admin.staff(DEMO.admin.loginId, DEMO.admin.password)
      const res = await admin.get('/api/admin/metrics')
      expect(res.statusCode).toBe(403)
      expect(res.json().error).toBe('MFA_REQUIRED')
      expect((await admin.post('/api/auth/totp/verify', { code: '000000' })).statusCode).toBe(401)
    })

    it('un code de double vérification ne peut pas être rejoué', async () => {
      const { currentTotp } = await import('../src/auth/totp.ts')
      const code = currentTotp(DEMO.admin.totpSecret, env.clock.now().getTime())
      const a1 = new Session(env.app)
      await a1.staff(DEMO.admin.loginId, DEMO.admin.password)
      expect((await a1.post('/api/auth/totp/verify', { code })).statusCode).toBe(200)
      const a2 = new Session(env.app)
      await a2.staff(DEMO.admin.loginId, DEMO.admin.password)
      expect((await a2.post('/api/auth/totp/verify', { code })).statusCode).toBe(401)
      env.clock.advance(30_000)
    })

    it('n’a pas accès au contenu individuel des demandes (moindre privilège)', async () => {
      const admin = new Session(env.app)
      await admin.strongAdmin(env.clock)
      expect((await admin.get(`/api/agent/requests/${amaRequestId}`)).statusCode).toBe(403)
      expect((await admin.get('/api/me/overview')).statusCode).toBe(403)
      env.clock.advance(30_000)
    })

    it('l’export est pseudonymisé : ni nom, ni texte, ni téléphone', async () => {
      const admin = new Session(env.app)
      await admin.strongAdmin(env.clock)
      const res = await admin.get('/api/admin/export/requests.csv')
      expect(res.statusCode).toBe(200)
      expect(res.headers['cache-control']).toBe('no-store')
      for (const forbiddenValue of ['Ama', 'Abiba', 'papiers', 'transport depuis', '+999', DEMO.ama.identifier]) {
        expect(res.body).not.toContain(forbiddenValue)
      }
      expect(res.body.split('\n')[0]).toMatch(/^pseudo_id,/)
      expect(await env.db.auditLog.count({ where: { action: 'export.requests' } })).toBe(1)
      env.clock.advance(30_000)
    })
  })

  describe('Protection CSRF', () => {
    it('une modification sans jeton CSRF est refusée, même avec une session valide', async () => {
      const ama = new Session(env.app)
      await ama.beneficiary(DEMO.ama.identifier, DEMO.ama.pin)
      const res = await ama.post('/api/me/deletion-request', undefined, { csrf: false })
      expect(res.statusCode).toBe(403)
      expect(res.json().error).toBe('CSRF')
    })

    it('une connexion depuis une origine étrangère est refusée', async () => {
      const res = await env.app.inject({
        method: 'POST', url: '/api/auth/staff/login', headers: { origin: 'https://site-malveillant.example', host: 'localhost' },
        payload: { username: DEMO.agentEst.loginId, password: DEMO.agentEst.password },
      })
      expect(res.statusCode).toBe(403)
    })
  })
})
