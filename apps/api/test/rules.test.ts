import { beforeEach, afterEach, describe, expect, it } from 'vitest'
import { CONSENT, DAY, DEMO, newKey, Session, setupTestEnv, type TestEnv } from './helpers.ts'

describe('Règles métier', () => {
  let env: TestEnv
  let ama: Session
  let esi: Session

  beforeEach(async () => {
    env = await setupTestEnv()
    ama = new Session(env.app)
    await ama.beneficiary(DEMO.ama.identifier, DEMO.ama.pin)
    esi = new Session(env.app)
    await esi.staff(DEMO.agentEst.loginId, DEMO.agentEst.password)
  })
  afterEach(() => env.app.close())

  const create = async (body: Record<string, unknown>) =>
    ama.post('/api/me/requests', {
      idempotencyKey: newKey(), appointmentId: null, category: null, locale: 'fr', transmissionConsentVersion: CONSENT, text: '', ...body,
    })
  const version = async (id: string) => (await env.db.request.findUniqueOrThrow({ where: { id } })).version

  describe('Accords', () => {
    it('une demande sans texte d’accord valide est refusée', async () => {
      const res = await create({ text: 'Je ne trouve pas de taxi', transmissionConsentVersion: 'inconnue' })
      expect(res.statusCode).toBe(422)
      expect(await env.db.request.count({ where: { text: 'Je ne trouve pas de taxi' } })).toBe(0)
    })

    it('le refus de la recherche (facultative) ne bloque pas le service', async () => {
      expect((await ama.post('/api/me/consents', { purpose: 'RESEARCH', granted: false, textVersion: CONSENT })).statusCode).toBe(200)
      expect((await create({ text: 'Je ne trouve pas de taxi pour venir', category: 'TRANSPORT' })).statusCode).toBe(201)
    })

    it('retirer l’accord de transmission clôture les demandes ouvertes, avec motif', async () => {
      const id = (await create({ text: 'Je ne trouve pas de taxi pour venir', category: 'TRANSPORT' })).json().id
      const res = await ama.post('/api/me/consents', { purpose: 'TRANSMIT_REQUEST', granted: false, textVersion: CONSENT })
      expect(res.json().effects[0]).toMatch(/1 demande/)
      const r = await env.db.request.findUniqueOrThrow({ where: { id } })
      expect(r).toMatchObject({ state: 'CLOSED_WITHOUT_CARE', closeReason: 'CONSENT_WITHDRAWN' })
      // L'agent ne peut plus agir dessus.
      const action = await esi.post(`/api/agent/requests/${id}/transitions/START_REVIEW`, { expectedVersion: r.version })
      expect(action.statusCode).toBe(422)
    })

    it('retirer l’accord de rappel annule les appels en attente et empêche les nouveaux', async () => {
      const beneficiaryId = (await env.db.beneficiary.findFirstOrThrow({ where: { account: { loginId: DEMO.ama.identifier } } })).id
      await env.db.contactPreference.update({ where: { beneficiaryId }, data: { channels: ['IN_APP', 'SMS', 'VOICE_CALL'] } })
      const amaAccount = await env.db.account.findUniqueOrThrow({ where: { loginId: DEMO.ama.identifier } })
      await env.db.notification.create({ data: { idempotencyKey: 'test:call', channel: 'VOICE_CALL', recipientId: amaAccount.id, templateKey: 'NEW_MESSAGE', locale: 'fr' } })
      await ama.post('/api/me/consents', { purpose: 'RECEIVE_CALLBACK', granted: false, textVersion: CONSENT })
      expect((await env.db.notification.findUniqueOrThrow({ where: { idempotencyKey: 'test:call' } })).status).toBe('CANCELLED')
      expect((await env.db.contactPreference.findUniqueOrThrow({ where: { beneficiaryId } })).channels).not.toContain('VOICE_CALL')
    })

    it('l’historique des accords n’est jamais réécrit', async () => {
      await ama.post('/api/me/consents', { purpose: 'RESEARCH', granted: true, textVersion: CONSENT })
      await ama.post('/api/me/consents', { purpose: 'RESEARCH', granted: false, textVersion: CONSENT })
      const rows = await env.db.consent.findMany({ where: { purpose: 'RESEARCH' }, orderBy: { createdAt: 'asc' } })
      expect(rows.map((r) => r.granted)).toEqual([true, false])
    })
  })

  describe('Suggestion IA et décision humaine', () => {
    it('sans choix explicite, le modèle suggère ; la suggestion est tracée avec sa version', async () => {
      const id = (await create({ text: 'Je vends au marché le matin, je ne suis pas disponible' })).json().id
      const r = await env.db.request.findUniqueOrThrow({ where: { id }, include: { suggestion: true } })
      expect(r).toMatchObject({ category: 'AVAILABILITY', categorySource: 'MODEL_SUGGESTION' })
      expect(r.suggestion).toMatchObject({ modelVersion: 'naive-bayes-fr-0.1', abstained: false, finalCategory: null })
    })

    it('abstention : aucune catégorie n’est imposée, l’agent décide', async () => {
      const id = (await create({ text: 'Bonjour, je voudrais parler à quelqu’un' })).json().id
      const r = await env.db.request.findUniqueOrThrow({ where: { id }, include: { suggestion: true } })
      expect(r.category).toBeNull()
      expect(r.suggestion?.abstained).toBe(true)
    })

    it('une suggestion non confirmée bloque l’action convenue ; la décision de l’agent est enregistrée', async () => {
      const id = (await create({ text: 'Je vends au marché le matin, je ne suis pas disponible' })).json().id
      await esi.post(`/api/agent/requests/${id}/transitions/START_REVIEW`, { expectedVersion: 0 })
      await esi.post(`/api/agent/requests/${id}/actions`, { expectedVersion: 1, description: 'Proposer l’après-midi', cost: { status: 'TO_VERIFY' } })
      const blocked = await esi.post(`/api/agent/requests/${id}/transitions/AGREE_ACTION`, { expectedVersion: 2, agreementObtainedBy: 'AGENT_PHONE_CALL', note: 'Accord par téléphone' })
      expect(blocked.json().error).toBe('CATEGORY_DECISION_REQUIRED')

      expect((await esi.post(`/api/agent/requests/${id}/category`, { expectedVersion: 2, category: 'AVAILABILITY' })).statusCode).toBe(200)
      const s = await env.db.modelSuggestion.findUniqueOrThrow({ where: { requestId: id } })
      expect(s).toMatchObject({ suggestedCategory: 'AVAILABILITY', finalCategory: 'AVAILABILITY' })
      expect(s.decidedById).toBe(env.seeded.agentEst.id)

      const ok = await esi.post(`/api/agent/requests/${id}/transitions/AGREE_ACTION`, { expectedVersion: 3, agreementObtainedBy: 'AGENT_PHONE_CALL', note: 'Accord par téléphone' })
      expect(ok.json().state).toBe('ACTION_AGREED')
    })

    it('un message de santé est orienté vers une reprise humaine, même si une catégorie logistique est choisie', async () => {
      const id = (await create({ text: 'Mon bébé a de la fièvre depuis hier, je n’ai pas de taxi', category: 'TRANSPORT' })).json().id
      const r = await env.db.request.findUniqueOrThrow({ where: { id } })
      expect(r).toMatchObject({ category: 'HEALTH_QUESTION', categorySource: 'HEALTH_REVIEW_RULE' })
      await esi.post(`/api/agent/requests/${id}/transitions/START_REVIEW`, { expectedVersion: 0 })
      const slot = await esi.post(`/api/agent/requests/${id}/slots`, {
        expectedVersion: 1, facilityId: env.seeded.centreA.id, startsAt: new Date(env.clock.now().getTime() + DAY).toISOString(),
      })
      expect(slot.json().error).toBe('HEALTH_REVIEW_REQUIRED')
      // L'agent peut orienter vers un professionnel et clôturer avec le motif adéquat.
      const close = await esi.post(`/api/agent/requests/${id}/transitions/CLOSE_WITHOUT_CARE`, { expectedVersion: 1, reason: 'REFERRED_TO_HEALTH_PROFESSIONAL' })
      expect(close.json().state).toBe('CLOSED_WITHOUT_CARE')
    })
  })

  describe('Transitions, dates et versions', () => {
    it('on ne déclare pas un soin sur une demande à peine reçue', async () => {
      const id = (await create({ text: 'Je ne trouve pas de taxi pour venir', category: 'TRANSPORT' })).json().id
      const res = await ama.post(`/api/me/requests/${id}/declare-care`, { expectedVersion: 0, careDate: env.clock.now().toISOString().slice(0, 10) })
      expect(res.json().error).toBe('INVALID_TRANSITION')
    })

    it('dates impossibles : soin dans le futur, avant la demande, créneau passé', async () => {
      const id = (await create({ text: 'Je ne trouve pas de taxi pour venir', category: 'TRANSPORT' })).json().id
      await esi.post(`/api/agent/requests/${id}/transitions/START_REVIEW`, { expectedVersion: 0 })
      const past = await esi.post(`/api/agent/requests/${id}/slots`, { expectedVersion: 1, facilityId: env.seeded.centreA.id, startsAt: new Date(env.clock.now().getTime() - 3_600_000).toISOString() })
      expect(past.json().error).toBe('SLOT_IN_PAST')

      await esi.post(`/api/agent/requests/${id}/actions`, { expectedVersion: 1, description: 'Organiser un transport partagé', cost: { status: 'TO_VERIFY' } })
      await esi.post(`/api/agent/requests/${id}/transitions/AGREE_ACTION`, { expectedVersion: 2, agreementObtainedBy: 'AGENT_IN_PERSON', note: 'Vue au marché' })

      const tomorrow = new Date(env.clock.now().getTime() + DAY).toISOString().slice(0, 10)
      const future = await ama.post(`/api/me/requests/${id}/declare-care`, { expectedVersion: 3, careDate: tomorrow })
      expect(future.json().error).toBe('DATE_IN_FUTURE')
      const before = await ama.post(`/api/me/requests/${id}/declare-care`, { expectedVersion: 3, careDate: '2025-01-01' })
      expect(before.json().error).toBe('DATE_BEFORE_REQUEST')
      const invalid = await ama.post(`/api/me/requests/${id}/declare-care`, { expectedVersion: 3, careDate: '2026-02-30' })
      expect(invalid.statusCode).toBe(422)
    })

    it('une version périmée est refusée : pas d’écrasement silencieux', async () => {
      const id = (await create({ text: 'Je ne trouve pas de taxi pour venir', category: 'TRANSPORT' })).json().id
      const kodjo = new Session(env.app)
      await kodjo.staff(DEMO.agentEst2.loginId, DEMO.agentEst2.password)
      expect((await esi.post(`/api/agent/requests/${id}/transitions/START_REVIEW`, { expectedVersion: 0 })).statusCode).toBe(200)
      const stale = await kodjo.post(`/api/agent/requests/${id}/actions`, { expectedVersion: 0, description: 'Action concurrente', cost: { status: 'TO_VERIFY' } })
      expect(stale.statusCode).toBe(409)
      expect(stale.json().error).toBe('VERSION_CONFLICT')
      expect(await env.db.action.count({ where: { requestId: id } })).toBe(0)
    })

    it('frais inconnus : « à vérifier » ; jamais de gratuité supposée', async () => {
      const id = (await create({ text: 'Combien coûte la consultation et quels sont les frais', category: 'COST' })).json().id
      await esi.post(`/api/agent/requests/${id}/transitions/START_REVIEW`, { expectedVersion: 0 })
      await esi.post(`/api/agent/requests/${id}/actions`, { expectedVersion: 1, description: 'Appeler le centre pour connaître le prix', cost: { status: 'TO_VERIFY' } })
      const a = await env.db.action.findFirstOrThrow({ where: { requestId: id } })
      expect(a).toMatchObject({ costStatus: 'TO_VERIFY', costAmountXof: null })
      const noSource = await esi.post(`/api/agent/requests/${id}/actions`, { expectedVersion: 2, description: 'Prix connu', cost: { status: 'KNOWN', amountXof: 0 } })
      expect(noSource.statusCode).toBe(400) // un montant connu exige sa source
    })

    it('une deuxième demande ouverte pour le même rendez-vous est refusée', async () => {
      const appointmentId = env.seeded.amaAppointmentId
      expect((await create({ appointmentId, text: 'Je ne trouve pas de taxi pour venir', category: 'TRANSPORT' })).statusCode).toBe(201)
      const dup = await create({ appointmentId, text: 'Encore une demande', category: 'COST' })
      expect(dup.json().error).toBe('DUPLICATE_OPEN_REQUEST')
    })

    it('« Autre besoin / rappel » est accepté sans texte', async () => {
      const res = await create({ category: 'OTHER_CALLBACK', text: '' })
      expect(res.statusCode).toBe(201)
    })

    it('une clé d’idempotence d’une autre femme ne permet pas de lire sa demande', async () => {
      const key = newKey()
      await create({ idempotencyKey: key, text: 'Je ne trouve pas de taxi pour venir', category: 'TRANSPORT' })
      const abiba = new Session(env.app)
      await abiba.beneficiary(DEMO.abiba.identifier, DEMO.abiba.pin)
      const res = await abiba.post('/api/me/requests', {
        idempotencyKey: key, appointmentId: null, category: 'TRANSPORT', text: 'x x', locale: 'fr', transmissionConsentVersion: CONSENT,
      })
      expect(res.statusCode).toBe(409)
      expect(JSON.stringify(res.json())).not.toContain('taxi')
    })
  })
})
