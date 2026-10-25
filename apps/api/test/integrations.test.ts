import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Writable } from 'node:stream'
import { CONSENT, DAY, DEMO, HOUR, newKey, Session, setupTestEnv, type TestEnv } from './helpers.ts'
import { processOutbox } from '../src/worker/jobs.ts'
import { signWebhook } from '../src/routes/webhooks.ts'
import { buildApp } from '../src/app.ts'

/** Faux fichier WebM : en-tête EBML réel suivi d'octets quelconques. */
const fakeWebm = () => Buffer.concat([Buffer.from([0x1a, 0x45, 0xdf, 0xa3]), Buffer.alloc(2000, 7)])

function multipart(fields: Record<string, string>, file: Buffer, filename = 'message.webm', type = 'audio/webm') {
  const boundary = '----rmtest' + Math.random().toString(16).slice(2)
  const parts: Buffer[] = []
  for (const [k, v] of Object.entries(fields)) {
    parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`))
  }
  parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: ${type}\r\n\r\n`))
  parts.push(file, Buffer.from(`\r\n--${boundary}--\r\n`))
  return { payload: Buffer.concat(parts), contentType: `multipart/form-data; boundary=${boundary}` }
}

describe('Intégrations : audio, envois simulés, webhooks, journaux', () => {
  let env: TestEnv
  let ama: Session

  beforeEach(async () => {
    env = await setupTestEnv()
    ama = new Session(env.app)
    await ama.beneficiary(DEMO.ama.identifier, DEMO.ama.pin)
  })
  afterEach(() => env.app.close())

  const upload = (s: Session, file: Buffer, fields: Partial<Record<string, string>> = {}, type?: string) => {
    const { payload, contentType } = multipart(
      { locale: 'fr', durationSeconds: '12', keepAudioConsentVersion: CONSENT, ...fields } as Record<string, string>,
      file, 'message.webm', type,
    )
    return env.app.inject({ method: 'POST', url: '/api/me/audio', payload, headers: { cookie: s.cookie, 'x-csrf-token': s.csrf, 'content-type': contentType } })
  }

  describe('Audio', () => {
    it('enregistrement accepté, accord « conserver l’audio » tracé, écoute par lien signé temporaire', async () => {
      const res = await upload(ama, fakeWebm())
      expect(res.statusCode).toBe(201)
      expect(res.json().mimeType).toBe('audio/webm')
      expect(await env.db.consent.count({ where: { purpose: 'KEEP_AUDIO', granted: true } })).toBe(1)

      const access = (await ama.get(`/api/audio/${res.json().id}/access`)).json()
      expect(access.url).toMatch(/sig=/)
      const stream = await env.app.inject({ method: 'GET', url: access.url })
      expect(stream.statusCode).toBe(200)
      expect(stream.headers['cache-control']).toBe('no-store, private')
      expect(stream.rawPayload.subarray(0, 4)).toEqual(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]))
    })

    it('le type réel est vérifié : un faux fichier « audio » est refusé', async () => {
      const res = await upload(ama, Buffer.from('<html>pas un audio</html>'.repeat(10)))
      expect(res.json().error).toBe('AUDIO_TYPE_INVALID')
    })

    it('durée au-delà de 120 s refusée', async () => {
      expect((await upload(ama, fakeWebm(), { durationSeconds: '600' })).json().error).toBe('AUDIO_META_INVALID')
    })

    it('fichier trop volumineux refusé', async () => {
      const big = Buffer.concat([fakeWebm(), Buffer.alloc(2.5 * 1024 * 1024)])
      expect((await upload(ama, big)).statusCode).toBe(413)
    })

    it('une autre femme ne peut pas obtenir le lien ; signature falsifiée ou expirée refusée', async () => {
      const id = (await upload(ama, fakeWebm())).json().id
      const abiba = new Session(env.app)
      await abiba.beneficiary(DEMO.abiba.identifier, DEMO.abiba.pin)
      expect((await abiba.get(`/api/audio/${id}/access`)).statusCode).toBe(404)

      const { url } = (await ama.get(`/api/audio/${id}/access`)).json()
      const tampered = url.replace(/sig=[0-9a-f]/, (m: string) => m.slice(0, -1) + (m.endsWith('0') ? '1' : '0'))
      expect((await env.app.inject({ method: 'GET', url: tampered })).statusCode).toBe(403)
      env.clock.advance(6 * 60_000)
      expect((await env.app.inject({ method: 'GET', url })).statusCode).toBe(403)
    })

    it('suppression par la femme : l’enregistrement n’est plus accessible', async () => {
      const id = (await upload(ama, fakeWebm())).json().id
      expect((await ama.delete(`/api/me/audio/${id}`)).statusCode).toBe(200)
      expect((await ama.get(`/api/audio/${id}/access`)).statusCode).toBe(404)
    })

    it('un audio envoyé dans une demande est écoutable par l’équipe, pas par une autre équipe', async () => {
      const audioId = (await upload(ama, fakeWebm())).json().id
      const reqId = (await ama.post('/api/me/requests', {
        idempotencyKey: newKey(), appointmentId: null, category: null, text: '', audioId, locale: 'fr', transmissionConsentVersion: CONSENT,
      })).json().id
      expect(reqId).toBeDefined()
      const esi = new Session(env.app)
      await esi.staff(DEMO.agentEst.loginId, DEMO.agentEst.password)
      expect((await esi.get(`/api/audio/${audioId}/access`)).statusCode).toBe(200)
      const afi = new Session(env.app)
      await afi.staff(DEMO.agentOuest.loginId, DEMO.agentOuest.password)
      expect((await afi.get(`/api/audio/${audioId}/access`)).statusCode).toBe(404)
      // Transcription humaine par l'équipe.
      expect((await esi.post(`/api/agent/audio/${audioId}/transcription`, { text: 'Je ne peux pas venir le matin.' })).statusCode).toBe(200)
    })

    it('retirer l’accord « conserver l’audio » supprime les enregistrements', async () => {
      const id = (await upload(ama, fakeWebm())).json().id
      await ama.post('/api/me/consents', { purpose: 'KEEP_AUDIO', granted: false, textVersion: CONSENT })
      expect((await env.db.audioAsset.findUniqueOrThrow({ where: { id } })).deletedAt).not.toBeNull()
      expect((await ama.get(`/api/audio/${id}/access`)).statusCode).toBe(404)
    })
  })

  describe('Envois simulés (outbox + worker)', () => {
    async function proposeSlotToAma() {
      const reqId = (await ama.post('/api/me/requests', {
        idempotencyKey: newKey(), appointmentId: null, category: 'TRANSPORT', text: 'Je ne trouve pas de taxi pour venir', locale: 'fr', transmissionConsentVersion: CONSENT,
      })).json().id
      const esi = new Session(env.app)
      await esi.staff(DEMO.agentEst.loginId, DEMO.agentEst.password)
      await esi.post(`/api/agent/requests/${reqId}/transitions/START_REVIEW`, { expectedVersion: 0 })
      await esi.post(`/api/agent/requests/${reqId}/slots`, { expectedVersion: 1, facilityId: env.seeded.centreA.id, startsAt: new Date(env.clock.now().getTime() + 2 * DAY).toISOString() })
    }

    it('le SMS est neutre, respecte l’horaire choisi, puis part en « simulé »', async () => {
      await proposeSlotToAma()
      const sms = await env.db.notification.findFirstOrThrow({ where: { channel: 'SMS' } })
      expect(sms.status).toBe('PENDING')
      // 09:00 à Lomé : hors de la plage 15:00-19:00 choisie par Ama -> report.
      expect(await processOutbox(env.ctx)).toMatchObject({ deferred: 1, sent: 0 })
      env.clock.advance(7 * HOUR) // 16:00
      expect(await processOutbox(env.ctx)).toMatchObject({ sent: 1 })
      const sent = await env.db.notification.findUniqueOrThrow({ where: { id: sms.id } })
      expect(sent).toMatchObject({ status: 'SENT_SIMULATED', provider: 'simulator' })
      expect(sent.providerMessageId).toMatch(/^sim_/)
    })

    it('aucun appel n’est mis en file sans accord de rappel', async () => {
      const beneficiaryId = (await env.db.beneficiary.findFirstOrThrow({ where: { account: { loginId: DEMO.ama.identifier } } })).id
      await env.db.contactPreference.update({ where: { beneficiaryId }, data: { channels: ['IN_APP', 'VOICE_CALL'] } })
      await ama.post('/api/me/consents', { purpose: 'RECEIVE_CALLBACK', granted: false, textVersion: CONSENT })
      await env.db.contactPreference.update({ where: { beneficiaryId }, data: { channels: ['IN_APP', 'VOICE_CALL'] } })
      await proposeSlotToAma()
      expect(await env.db.notification.count({ where: { channel: 'VOICE_CALL' } })).toBe(0)
    })

    it('erreur définitive du fournisseur : échec immédiat, visible ; erreur temporaire : reprise limitée', async () => {
      const amaB = await env.db.beneficiary.findFirstOrThrow({ where: { account: { loginId: DEMO.ama.identifier } } })
      env.clock.advance(7 * HOUR) // dans la plage horaire
      await env.db.contactInfo.update({ where: { beneficiaryId: amaB.id }, data: { phoneE164: '+99900000000' } })
      await proposeSlotToAma()
      expect(await processOutbox(env.ctx)).toMatchObject({ failed: 1 })
      expect((await env.db.notification.findFirstOrThrow({ where: { channel: 'SMS' } })).lastError).toBe('SIMULATED_INVALID_NUMBER')

      await env.db.notification.deleteMany({})
      await env.db.contactInfo.update({ where: { beneficiaryId: amaB.id }, data: { phoneE164: '+99900009999' } })
      await env.db.request.deleteMany({ where: { beneficiaryId: amaB.id } })
      await proposeSlotToAma()
      expect(await processOutbox(env.ctx)).toMatchObject({ retried: 1 })
      env.clock.advance(2 * 60_000)
      expect(await processOutbox(env.ctx)).toMatchObject({ retried: 1 })
      env.clock.advance(6 * 60_000)
      expect(await processOutbox(env.ctx)).toMatchObject({ failed: 1 })
      const n = await env.db.notification.findFirstOrThrow({ where: { channel: 'SMS' } })
      expect(n).toMatchObject({ status: 'FAILED', attempts: 3 })
    })

    it('connecteur réel absent : ce canal échoue proprement, le reste fonctionne', async () => {
      env.clock.advance(7 * HOUR)
      await proposeSlotToAma()
      const res = await processOutbox(env.ctx, () => null)
      expect(res).toMatchObject({ failed: 1 })
      expect((await env.db.notification.findFirstOrThrow({ where: { channel: 'SMS' } })).lastError).toBe('CONNECTOR_UNAVAILABLE')
      expect((await ama.get('/api/me/overview')).statusCode).toBe(200)
    })
  })

  describe('Webhooks', () => {
    const send = (body: object, opts: { secret?: string; ts?: number; eventId?: string } = {}) => {
      const raw = JSON.stringify(body)
      const ts = String(opts.ts ?? env.clock.now().getTime())
      return env.app.inject({
        method: 'POST', url: '/api/webhooks/simulator', payload: raw,
        headers: {
          'content-type': 'application/json', 'x-rm-timestamp': ts, 'x-rm-event-id': opts.eventId ?? newKey(),
          'x-rm-signature': signWebhook(opts.secret ?? 'test-webhook-signing-secret', ts, raw),
        },
      })
    }

    it('signature valide : l’accusé d’échec est appliqué une seule fois (anti-rejeu)', async () => {
      const account = await env.db.account.findUniqueOrThrow({ where: { loginId: DEMO.ama.identifier } })
      await env.db.notification.create({ data: { idempotencyKey: 'wh:1', channel: 'SMS', recipientId: account.id, templateKey: 'NEW_MESSAGE', locale: 'fr', status: 'SENT_SIMULATED', providerMessageId: 'sim_abc' } })
      const eventId = newKey()
      const first = await send({ providerMessageId: 'sim_abc', status: 'FAILED', error: 'Non distribué' }, { eventId })
      expect(first.json()).toEqual({ accepted: true, replay: false })
      expect((await env.db.notification.findUniqueOrThrow({ where: { idempotencyKey: 'wh:1' } })).status).toBe('FAILED')
      const replay = await send({ providerMessageId: 'sim_abc', status: 'FAILED' }, { eventId })
      expect(replay.json()).toEqual({ accepted: true, replay: true })
    })

    it('signature invalide ou horodatage trop ancien : refus', async () => {
      expect((await send({ providerMessageId: 'x', status: 'DELIVERED' }, { secret: 'mauvais-secret' })).statusCode).toBe(401)
      expect((await send({ providerMessageId: 'x', status: 'DELIVERED' }, { ts: env.clock.now().getTime() - 10 * 60_000 })).statusCode).toBe(401)
    })
  })

  describe('Journaux techniques', () => {
    it('aucun téléphone, message personnel ni secret n’apparaît dans les journaux', async () => {
      const lines: string[] = []
      const sink = new Writable({ write(chunk, _enc, cb) { lines.push(String(chunk)); cb() } })
      // Vrai journaliseur de l'application (pino), redirigé vers un tampon mémoire.
      const app = await buildApp({ ...env.ctx, config: { ...env.ctx.config, APP_ENV: 'local' } }, { logStream: sink })
      const s = new Session(app)
      try {
        await s.beneficiary(DEMO.ama.identifier, DEMO.ama.pin)
        await s.post('/api/me/requests', {
          idempotencyKey: newKey(), appointmentId: null, category: 'TRANSPORT', text: 'Message très personnel de test', locale: 'fr', transmissionConsentVersion: CONSENT,
        })
        await s.get('/api/me/overview')
        await new Session(app).beneficiary(DEMO.ama.identifier, '999111') // échec de connexion
      } finally {
        await app.close()
      }
      const all = lines.join('')
      expect(all.length).toBeGreaterThan(0)
      for (const secret of ['Message très personnel', '+999', DEMO.ama.pin, '999111', 'rm_session=', s.csrf]) {
        expect(all, secret).not.toContain(secret)
      }
    })
  })
})
