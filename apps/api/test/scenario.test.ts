import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { CONSENT, DAY, DEMO, HOUR, newKey, Session, setupTestEnv, type TestEnv } from './helpers.ts'
import { markDueRequests } from '../src/worker/jobs.ts'

/**
 * Scénario de référence (section 14) : Ama, vendeuse au marché, mère de Koffi (4 mois),
 * n'est pas disponible avant 15 h. Elle donne son accord. Une agente vérifie la demande,
 * propose un créneau de 15 h 30, puis les confirmations et la vérification humaine sont
 * enregistrées par les rôles habilités. Chaque étape passe par un compte distinct.
 */
describe('Scénario Ama : du premier message au soin vérifié', () => {
  let env: TestEnv
  const ama = () => new Session(env.app)
  let amaS: Session
  let esi: Session
  let refA: Session
  let requestId: string
  let slotId: string

  beforeAll(async () => {
    env = await setupTestEnv()
    amaS = ama()
    esi = new Session(env.app)
    refA = new Session(env.app)
    expect((await amaS.beneficiary(DEMO.ama.identifier, DEMO.ama.pin)).statusCode).toBe(200)
    expect((await esi.staff(DEMO.agentEst.loginId, DEMO.agentEst.password)).statusCode).toBe(200)
    expect((await refA.staff(DEMO.referentA.loginId, DEMO.referentA.password)).statusCode).toBe(200)
  })
  afterAll(() => env.app.close())

  it('Ama voit ses rendez-vous et celui de Koffi', async () => {
    const res = await amaS.get('/api/me/overview')
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.children).toEqual([expect.objectContaining({ firstName: 'Koffi', ageMonths: 4 })])
    expect(body.appointments.map((a: { forChild: string | null }) => a.forChild)).toEqual([null, 'Koffi'])
  })

  it('Ama envoie sa demande avec son accord ; un nouvel essai ne crée pas de doublon', async () => {
    const overview = (await amaS.get('/api/me/overview')).json()
    const payload = {
      idempotencyKey: newKey(),
      appointmentId: overview.appointments[0].id,
      category: 'AVAILABILITY',
      text: 'Je vends au marché, je ne suis pas disponible avant 15 heures.',
      locale: 'fr',
      transmissionConsentVersion: CONSENT,
    }
    const first = await amaS.post('/api/me/requests', payload)
    expect(first.statusCode).toBe(201)
    expect(first.json()).toMatchObject({ state: 'RECEIVED', duplicate: false })
    requestId = first.json().id

    // Coupure réseau simulée : le client renvoie la même requête avec la même clé.
    const retry = await amaS.post('/api/me/requests', payload)
    expect(retry.statusCode).toBe(200)
    expect(retry.json()).toMatchObject({ id: requestId, duplicate: true })
    expect(await env.db.request.count({ where: { idempotencyKey: payload.idempotencyKey } })).toBe(1)

    const r = (await amaS.get('/api/me/overview')).json().requests.find((x: { id: string }) => x.id === requestId)
    expect(r.viewedByAgent).toBe(false) // « transmis au service », pas encore « consulté »
  })

  it('l’agente voit la demande, l’ouvre : elle devient « consultée par un agent »', async () => {
    const list = (await esi.get('/api/agent/requests?open=true')).json()
    expect(list.map((x: { id: string }) => x.id)).toContain(requestId)
    const detail = await esi.get(`/api/agent/requests/${requestId}`)
    expect(detail.statusCode).toBe(200)
    expect(detail.json().category).toBe('AVAILABILITY')
    expect(detail.json().categorySource).toBe('BENEFICIARY_CHOICE')
    const r = (await amaS.get('/api/me/overview')).json().requests.find((x: { id: string }) => x.id === requestId)
    expect(r.viewedByAgent).toBe(true)
  })

  it('l’agente prend en charge, note l’action et propose 15 h 30 au centre A', async () => {
    let v = (await esi.get(`/api/agent/requests/${requestId}`)).json().version
    const review = await esi.post(`/api/agent/requests/${requestId}/transitions/START_REVIEW`, { expectedVersion: v })
    expect(review.json().state).toBe('UNDER_REVIEW')
    v = review.json().version

    const action = await esi.post(`/api/agent/requests/${requestId}/actions`, {
      expectedVersion: v,
      description: 'Déplacer la consultation l’après-midi, après la vente au marché.',
      cost: { status: 'TO_VERIFY' },
    })
    expect(action.statusCode).toBe(201)
    v++

    const startsAt = new Date(env.clock.now().getTime() + 3 * DAY)
    startsAt.setUTCHours(15, 30, 0, 0) // Africa/Lome = UTC+0
    const slot = await esi.post(`/api/agent/requests/${requestId}/slots`, {
      expectedVersion: v, facilityId: env.seeded.centreA.id, startsAt: startsAt.toISOString(),
    })
    expect(slot.statusCode).toBe(201)
    slotId = slot.json().id
  })

  it('une note d’agent n’est pas une réservation : le créneau reste « proposé »', async () => {
    const s = await env.db.slotProposal.findUniqueOrThrow({ where: { id: slotId } })
    expect(s.status).toBe('PROPOSED')
    expect(s.facilityConfirmedAt).toBeNull()
  })

  it('Ama accepte le créneau ; l’agente enregistre l’action convenue', async () => {
    const accept = await amaS.post(`/api/me/slots/${slotId}/respond`, { response: 'ACCEPT' })
    expect(accept.json()).toEqual({ status: 'ACCEPTED' })
    const v = (await esi.get(`/api/agent/requests/${requestId}`)).json().version
    const agree = await esi.post(`/api/agent/requests/${requestId}/transitions/AGREE_ACTION`, {
      expectedVersion: v, agreementObtainedBy: 'ACCEPTED_SLOT_IN_APP',
    })
    expect(agree.statusCode).toBe(200)
    expect(agree.json().state).toBe('ACTION_AGREED')
  })

  it('la référente du centre A confirme le créneau, sans voir le message d’Ama', async () => {
    const list = (await refA.get('/api/facility/requests')).json()
    const r = list.requests.find((x: { id: string }) => x.id === requestId)
    expect(r).toBeDefined()
    expect(r).not.toHaveProperty('text')
    expect(JSON.stringify(list)).not.toContain('marché')
    expect((await refA.post(`/api/facility/slots/${slotId}/confirm`)).statusCode).toBe(200)
    expect((await env.db.slotProposal.findUniqueOrThrow({ where: { id: slotId } })).status).toBe('CONFIRMED_BY_FACILITY')
  })

  it('une fois le créneau passé, le worker bascule en « réalisation à confirmer »', async () => {
    env.clock.advance(3 * DAY + 8 * HOUR)
    expect(await markDueRequests(env.ctx)).toEqual({ moved: 1 })
    expect((await env.db.request.findUniqueOrThrow({ where: { id: requestId } })).state).toBe('AWAITING_COMPLETION')
  })

  it('Ama déclare avoir reçu le soin : c’est une déclaration, pas une vérification', async () => {
    const r = (await amaS.get('/api/me/overview')).json().requests.find((x: { id: string }) => x.id === requestId)
    const today = env.clock.now().toISOString().slice(0, 10)
    const res = await amaS.post(`/api/me/requests/${requestId}/declare-care`, { expectedVersion: r.version, careDate: today })
    expect(res.json().state).toBe('CARE_DECLARED')
    expect(await env.db.careVerification.count({ where: { requestId } })).toBe(0)
  })

  it('la référente habilitée vérifie le soin, avec source, méthode, auteur et note', async () => {
    const r = (await refA.get('/api/facility/requests')).json().requests.find((x: { id: string }) => x.id === requestId)
    const today = env.clock.now().toISOString().slice(0, 10)
    const res = await refA.post(`/api/facility/requests/${requestId}/transitions/VERIFY_CARE`, {
      expectedVersion: r.version, careDate: today, source: 'FACILITY_CONFIRMATION', method: 'FACILITY_REGISTER', note: 'Présente au registre du centre.',
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().state).toBe('CARE_VERIFIED')
    const v = await env.db.careVerification.findFirstOrThrow({ where: { requestId } })
    expect(v).toMatchObject({ source: 'FACILITY_CONFIRMATION', method: 'FACILITY_REGISTER', verifiedByRole: 'FACILITY_REFERENT' })
  })

  it('une correction de la confirmation conserve l’historique', async () => {
    const r = (await refA.get('/api/facility/requests')).json().requests.find((x: { id: string }) => x.id === requestId)
    const yesterday = new Date(env.clock.now().getTime() - DAY).toISOString().slice(0, 10)
    const res = await refA.post(`/api/facility/requests/${requestId}/transitions/CORRECT_VERIFICATION`, {
      expectedVersion: r.version, careDate: yesterday, source: 'FACILITY_CONFIRMATION', method: 'FACILITY_REGISTER',
      note: 'Date relevée au registre.', correctionReason: 'Erreur de date à la première saisie.',
    })
    expect(res.statusCode).toBe(200)
    const all = await env.db.careVerification.findMany({ where: { requestId }, orderBy: { createdAt: 'asc' } })
    expect(all).toHaveLength(2)
    expect(all[0]!.supersededById).toBe(all[1]!.id)
    expect(all[1]!.careDate).toBe(yesterday)
  })

  it('l’historique des événements retrace chaque étape dans l’ordre', async () => {
    const events = await env.db.requestEvent.findMany({ where: { requestId }, orderBy: { createdAt: 'asc' } })
    expect(events.map((e) => e.type)).toEqual([
      'REQUEST_RECEIVED', 'VIEWED_BY_AGENT', 'START_REVIEW', 'ACTION_RECORDED', 'SLOT_PROPOSED', 'SLOT_ACCEPTED',
      'AGREE_ACTION', 'SLOT_CONFIRMED_BY_FACILITY', 'MARK_AWAITING_COMPLETION', 'DECLARE_CARE', 'VERIFY_CARE', 'CORRECT_VERIFICATION',
    ])
    // Aucun texte libre de la femme dans le journal d'événements.
    expect(JSON.stringify(events)).not.toContain('marché')
  })

  it('les indicateurs séparent soin déclaré et soin vérifié, avec leurs dénominateurs', async () => {
    const admin = new Session(env.app)
    expect((await admin.strongAdmin(env.clock)).statusCode).toBe(200)
    const m = (await admin.get('/api/admin/metrics')).json()
    expect(m.requests.received).toBe(3) // Abiba, Akou (démo) + Ama
    expect(m.careDeclared).toMatchObject({ numerator: 1, denominator: 3 })
    expect(m.careVerified).toMatchObject({ numerator: 1, denominator: 3 })
    expect(m.firstHumanResponse.missing).toBe(1) // Abiba n'a pas encore de réponse
    expect(m.caveat).toMatch(/aucun impact sanitaire/i)
  })
})
