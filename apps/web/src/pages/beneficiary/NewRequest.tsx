import { useEffect, useState } from 'react'
import { Link, useNavigate } from '../../router.tsx'
import { useTranslation } from 'react-i18next'
// Point d'entrée léger : évite d'embarquer Zod et le modèle dans l'interface des mamans.
import { hasHealthReviewCue } from '@relais-maman/core/health-review'
import { Layout } from '../../components/Layout.tsx'
import { AudioRecorder } from '../../components/AudioRecorder.tsx'
import { Alert, LoadState, formatDateTime, useLoad } from '../../components/ui.tsx'
import { api } from '../../api/client.ts'
import { discard, enqueue, retry, subscribe, type PendingRequest } from '../../offline/sendQueue.ts'
import type { ConsentText, Overview } from './types.ts'

const CATEGORIES = [
  { key: 'AVAILABILITY', icon: '🕒' },
  { key: 'TRANSPORT', icon: '🚕' },
  { key: 'COST', icon: '💰' },
  { key: 'UNDERSTANDING', icon: '❓' },
  { key: 'OTHER_CALLBACK', icon: '📞' },
] as const

type Step = 'what' | 'which' | 'explain' | 'who' | 'review' | 'status'

/**
 * Parcours de demande : une tâche par écran. Le brouillon n'existe qu'en mémoire (états
 * locaux « à envoyer » / « envoi en attente »), jamais sur disque.
 */
export function NewRequest() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const data = useLoad(async () => {
    const [overview, texts] = await Promise.all([
      api.get<Overview>('/api/me/overview'),
      api.get<ConsentText[]>('/api/public/consent-texts?locale=fr'),
    ])
    return { overview, texts }
  })
  const [step, setStep] = useState<Step>('what')
  const [category, setCategory] = useState<string | null>(null)
  const [appointmentId, setAppointmentId] = useState<string | null>(null)
  const [text, setText] = useState('')
  const [audioId, setAudioId] = useState<string | null>(null)
  const [consent, setConsent] = useState(false)
  const [consentError, setConsentError] = useState(false)
  const [pending, setPending] = useState<PendingRequest | null>(null)

  useEffect(() => subscribe((items) => {
    setPending((current) => (current ? items.find((i) => i.idempotencyKey === current.idempotencyKey) ?? current : null))
  }), [])

  const transmitText = data.data?.texts.find((x) => x.purpose === 'TRANSMIT_REQUEST')
  const audioText = data.data?.texts.find((x) => x.purpose === 'KEEP_AUDIO')
  const appointments = data.data?.overview.appointments ?? []
  const healthCue = text.length > 0 && hasHealthReviewCue(text)
  const canExplainContinue = text.trim().length >= 2 || audioId !== null || category === 'OTHER_CALLBACK'

  const send = () => {
    if (!consent || !transmitText) {
      setConsentError(true)
      return
    }
    // La clé d'idempotence est créée ICI, une seule fois, puis réutilisée à chaque nouvel essai.
    const item = enqueue({
      appointmentId, category, text: text.trim(), audioId, locale: 'fr', transmissionConsentVersion: transmitText.version,
    })
    setPending(item)
    setStep('status')
  }

  const reset = () => {
    if (pending) discard(pending.idempotencyKey)
    navigate('/b')
  }

  if (data.loading || data.error) return <Layout><LoadState loading={data.loading} error={data.error} onRetry={data.reload} /></Layout>

  return (
    <Layout>
      {step === 'what' && (
        <section aria-labelledby="h-what">
          <h1 id="h-what">{t('request.stepWhat')}</h1>
          <div className="choice-grid">
            {CATEGORIES.map((c) => (
              <button key={c.key} type="button" className="choice" aria-pressed={category === c.key}
                onClick={() => { setCategory(c.key); setStep(appointments.length ? 'which' : 'explain') }}>
                <span className="icon" aria-hidden="true">{c.icon}</span>
                <span><strong>{t(`categories.${c.key}`)}</strong><br /><span className="small muted">{t(`categoryHints.${c.key}`)}</span></span>
              </button>
            ))}
          </div>
          <Link to="/b" className="btn secondary block" style={{ marginTop: '1rem' }}>{t('app.cancel')}</Link>
        </section>
      )}

      {step === 'which' && (
        <section aria-labelledby="h-which">
          <h1 id="h-which">{t('request.stepWhich')}</h1>
          <div className="stack">
            {appointments.map((a) => (
              <button key={a.id} type="button" className="choice" aria-pressed={appointmentId === a.id}
                onClick={() => { setAppointmentId(a.id); setStep('explain') }}>
                <span className="icon" aria-hidden="true">📅</span>
                <span><strong>{a.title}</strong><br /><span className="small">{formatDateTime(a.startsAt)}</span></span>
              </button>
            ))}
            <button type="button" className="choice" aria-pressed={appointmentId === null}
              onClick={() => { setAppointmentId(null); setStep('explain') }}>
              <span className="icon" aria-hidden="true">—</span><span>{t('request.noAppointment')}</span>
            </button>
          </div>
          <button type="button" className="btn secondary block" style={{ marginTop: '1rem' }} onClick={() => setStep('what')}>{t('app.back')}</button>
        </section>
      )}

      {step === 'explain' && (
        <section aria-labelledby="h-explain">
          <h1 id="h-explain">{t('request.stepExplain')}</h1>
          <div className="field">
            <label htmlFor="msg">{t('request.textLabel')}</label>
            <textarea id="msg" maxLength={1000} value={text} aria-describedby="msg-hint" onChange={(e) => setText(e.target.value)} />
            <p id="msg-hint" className="small muted">{t('request.textHint')}</p>
          </div>
          {healthCue && <Alert>{t('request.healthNotice')}</Alert>}
          <h2>{t('request.orRecord')}</h2>
          {audioText && (
            <AudioRecorder consentVersion={audioText.version} onUploaded={setAudioId} onRemoved={() => setAudioId(null)} />
          )}
          <div className="stack">
            <button type="button" className="btn block" disabled={!canExplainContinue} onClick={() => setStep('who')}>{t('app.continue')}</button>
            <button type="button" className="btn secondary block" onClick={() => setStep(appointments.length ? 'which' : 'what')}>{t('app.back')}</button>
          </div>
        </section>
      )}

      {step === 'who' && (
        <section aria-labelledby="h-who">
          <h1 id="h-who">{t('request.stepWho')}</h1>
          <div className="card highlight"><p>{t('request.whoText')}</p></div>
          {transmitText && <p className="small muted">{transmitText.body}</p>}
          {consentError && !consent && <Alert kind="error">{t('request.consentRequired')}</Alert>}
          <label className="check">
            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
            <span>{t('request.consentLabel')}</span>
          </label>
          <div className="stack" style={{ marginTop: '1rem' }}>
            <button type="button" className="btn block" onClick={() => (consent ? setStep('review') : setConsentError(true))}>{t('app.continue')}</button>
            <button type="button" className="btn secondary block" onClick={() => setStep('explain')}>{t('app.back')}</button>
          </div>
        </section>
      )}

      {step === 'review' && (
        <section aria-labelledby="h-review">
          <h1 id="h-review">{t('request.stepReview')}</h1>
          <p><span className="status"><span aria-hidden="true">✎</span>{t('states.DRAFT')}</span></p>
          <dl className="card">
            <dt><strong>{t('request.summaryCategory')}</strong></dt>
            <dd>{t(`categories.${category}`)} <button type="button" className="btn secondary" onClick={() => setStep('what')}>{t('request.edit')}</button></dd>
            <dt><strong>{t('request.summaryAppointment')}</strong></dt>
            <dd>{appointments.find((a) => a.id === appointmentId)?.title ?? t('request.noAppointment')}</dd>
            {text && (<><dt><strong>{t('request.summaryMessage')}</strong></dt><dd>{text} <button type="button" className="btn secondary" onClick={() => setStep('explain')}>{t('request.edit')}</button></dd></>)}
            {audioId && <dd>🎙 {t('request.summaryAudio')}</dd>}
          </dl>
          <div className="stack">
            <button type="button" className="btn block" onClick={send}>{t('request.send')}</button>
            <button type="button" className="btn secondary block" onClick={reset}>{t('request.cancelDraft')}</button>
          </div>
        </section>
      )}

      {step === 'status' && pending && (
        <section aria-live="polite">
          {pending.status === 'SENT' && (
            <>
              <h1>{t('states.RECEIVED')}</h1>
              <Alert>{t('request.sent')}</Alert>
              <Link className="btn block" to={pending.serverId ? `/b/demande/${pending.serverId}` : '/b'}>{t('beneficiary.openRequest')}</Link>
            </>
          )}
          {(pending.status === 'PENDING_SEND' || pending.status === 'SENDING') && (
            <>
              <h1>{t('request.notSentYet')}</h1>
              <p><span className="status"><span aria-hidden="true">⏳</span>{t('states.PENDING_SEND')}</span></p>
              <Alert kind="offline">{t('request.queued')}</Alert>
            </>
          )}
          {pending.status === 'ERROR' && (
            <>
              <h1>{t('request.notSentYet')}</h1>
              <Alert kind="error">{t('request.syncError', { message: pending.error })}</Alert>
              <div className="stack">
                <button type="button" className="btn block" onClick={() => retry(pending.idempotencyKey)}>{t('app.retry')}</button>
                <button type="button" className="btn secondary block" onClick={reset}>{t('request.cancelDraft')}</button>
              </div>
            </>
          )}
        </section>
      )}
    </Layout>
  )
}
