import { useState, type FormEvent, type ReactNode } from 'react'
import { useParams } from '../../router.tsx'
import { useTranslation } from 'react-i18next'
import { Layout } from '../../components/Layout.tsx'
import { Alert, LoadState, StateBadge, stateLabel, errorMessage, formatDate, formatDateTime, todayCivil, useLoad } from '../../components/ui.tsx'
import { api, ApiError } from '../../api/client.ts'
import { AgentNav } from './Queue.tsx'

interface Detail {
  id: string; state: string; version: number; category: string | null; categorySource: string; text: string; locale: string; createdAt: string
  beneficiary: {
    account: { displayName: string }; zone: { name: string }; activityLabel: string | null
    children: Array<{ firstName: string; birthYearMonth: string }>
    contact: { phoneE164: string | null; phoneIsShared: boolean } | null
    preferences: { channels: string[]; callWindowStart: string; callWindowEnd: string } | null
  }
  appointment: { title: string; startsAt: string; facility: { name: string } } | null
  assignedAgent: { id: string; displayName: string } | null
  audio: { id: string; durationSeconds: number | null; deletedAt: string | null; transcription: string | null } | null
  suggestion: { modelVersion: string; suggestedCategory: string | null; topCategory: string | null; abstained: boolean; abstentionReason: string | null; score: number | null; healthReviewCue: boolean; finalCategory: string | null } | null
  actions: Array<{ id: string; description: string; costStatus: string; costAmountXof: number | null; createdAt: string }>
  slots: Array<{ id: string; startsAt: string; status: string; facility: { name: string } }>
  messages: Array<{ id: string; body: string; direction: string; createdAt: string }>
  declarations: Array<{ careDate: string; declaredByRole: string }>
  verifications: Array<{ id: string; careDate: string; source: string; method: string; note: string; supersededById: string | null; revokedAt: string | null; correctionReason: string | null; createdAt: string }>
  events: Array<{ id: string; type: string; actorRole: string; createdAt: string; toState: string | null }>
  consents: { callback: boolean; transmit: boolean }
}
interface Ctx { facilities: Array<{ id: string; name: string }>; agents: Array<{ id: string; displayName: string }>; me: string }

const CATS = ['TRANSPORT', 'COST', 'AVAILABILITY', 'UNDERSTANDING', 'OTHER_CALLBACK', 'HEALTH_QUESTION']
const CLOSE = ['UNREACHABLE', 'NO_LONGER_NEEDED', 'CARE_NOT_RECEIVED', 'REFERRED_TO_HEALTH_PROFESSIONAL', 'DUPLICATE', 'OTHER']

function Section({ title, children }: { title: string; children: ReactNode }) {
  return <section className="card"><h2>{title}</h2>{children}</section>
}

export function AgentRequest() {
  const { t } = useTranslation()
  const { id } = useParams()
  const data = useLoad(async () => ({
    d: await api.get<Detail>(`/api/agent/requests/${id}`),
    ctx: await api.get<Ctx>('/api/agent/context'),
  }), [id])
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [audioUrl, setAudioUrl] = useState<string | null>(null)

  const d = data.data?.d
  const ctx = data.data?.ctx

  /** Chaque action envoie la version attendue ; en cas de conflit, on recharge et on prévient. */
  const run = async (fn: (v: number) => Promise<unknown>, ok = t('settings.saved')) => {
    if (!d) return
    setError(null)
    setNotice(null)
    try {
      await fn(d.version)
      setNotice(ok)
    } catch (e) {
      setError(e instanceof ApiError && e.code === 'VERSION_CONFLICT' ? t('agent.conflict') : errorMessage(e, t))
    }
    await data.reload()
  }
  const tr = (action: string, body: Record<string, unknown> = {}) =>
    run((v) => api.post(`/api/agent/requests/${id}/transitions/${action}`, { expectedVersion: v, ...body }))
  const form = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    return Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>
  }

  return (
    <Layout wide nav={<AgentNav />}>
      <LoadState loading={data.loading && !d} error={data.error} onRetry={data.reload} />
      {notice && <Alert>{notice}</Alert>}
      {error && <Alert kind="error">{error}</Alert>}
      {d && ctx && (
        <div className="stack">
          <h1>{d.beneficiary.account.displayName} · {t(`categories.${d.category ?? 'none'}`)}</h1>
          <p><StateBadge staff state={d.state} /> <span className="small muted">version {d.version}</span></p>
          {!d.consents.transmit && <Alert kind="error">{t('agent.transmitWithdrawn')}</Alert>}

          <Section title="Demande">
            {d.text ? <p>« {d.text} »</p> : <p className="muted">(pas de texte)</p>}
            {d.appointment && <p>📅 {d.appointment.title} · {formatDateTime(d.appointment.startsAt)} · {d.appointment.facility.name}</p>}
            <p className="small muted">{d.beneficiary.zone.name}{d.beneficiary.activityLabel ? ` · ${d.beneficiary.activityLabel}` : ''} · reçue le {formatDateTime(d.createdAt)}</p>
            {d.audio && !d.audio.deletedAt && (
              <div className="stack">
                <button className="btn secondary" type="button" onClick={async () => {
                  const res = await api.get<{ url: string }>(`/api/audio/${d.audio!.id}/access`)
                  setAudioUrl(res.url)
                }}>🎙 Écouter le message vocal ({d.audio.durationSeconds ?? '?'} s)</button>
                {audioUrl && <audio controls src={audioUrl} />}
                <form onSubmit={(e) => { const f = form(e); void run(() => api.post(`/api/agent/audio/${d.audio!.id}/transcription`, { text: f.text })) }}>
                  <label htmlFor="trans">{t('agent.transcription')}</label>
                  <textarea id="trans" name="text" defaultValue={d.audio.transcription ?? ''} />
                  <button className="btn secondary" type="submit">{t('agent.saveTranscription')}</button>
                </form>
              </div>
            )}
          </Section>

          <Section title={t('agent.suggestion')}>
            <p className="small muted">{t('agent.suggestionNote')}</p>
            {d.suggestion ? (
              <>
                {d.suggestion.healthReviewCue && <Alert kind="error">⚠ {t('agent.healthCue')} — {t('request.healthNotice')}</Alert>}
                {d.suggestion.abstained ? <p>{t('agent.abstained')}</p> : (
                  <p>{t(`categories.${d.suggestion.suggestedCategory}`)} ({t('agent.score')} {d.suggestion.score === null ? '—' : new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 }).format(d.suggestion.score)}, {d.suggestion.modelVersion})</p>
                )}
                {d.suggestion.finalCategory && <p>✓ Décision : {t(`categories.${d.suggestion.finalCategory}`)}</p>}
              </>
            ) : <p className="muted">—</p>}
            <p>{t('agent.categorySource')} : <strong>{t(`categorySources.${d.categorySource}`)}</strong></p>
            <form className="row" onSubmit={(e) => { const f = form(e); void run((v) => api.post(`/api/agent/requests/${id}/category`, { expectedVersion: v, category: f.category })) }}>
              <label className="visually-hidden" htmlFor="cat">{t('agent.category')}</label>
              <select id="cat" name="category" defaultValue={d.category ?? 'TRANSPORT'} style={{ maxWidth: '20rem' }}>
                {CATS.map((c) => <option key={c} value={c}>{t(`categories.${c}`)}</option>)}
              </select>
              <button className="btn secondary" type="submit">{t('agent.decide')}</button>
            </form>
          </Section>

          <Section title={t('agent.contact')}>
            <p>{d.beneficiary.contact?.phoneE164 ?? '—'} {d.beneficiary.contact?.phoneIsShared && <span className="badge">téléphone partagé</span>}</p>
            <p>{d.consents.callback ? t('agent.callbackOk') : t('agent.callbackNo')}</p>
            {d.beneficiary.preferences && <p className="small">Canaux : {d.beneficiary.preferences.channels.join(', ')} · {d.beneficiary.preferences.callWindowStart}–{d.beneficiary.preferences.callWindowEnd}</p>}
          </Section>

          {d.state === 'RECEIVED' && <button className="btn block" type="button" onClick={() => tr('START_REVIEW')}>{t('agent.takeCharge')}</button>}

          {['UNDER_REVIEW', 'ACTION_AGREED'].includes(d.state) && (
            <Section title={t('agent.action')}>
              <p className="small muted">{t('agent.actionNotBooking')}</p>
              {d.actions.map((a) => (
                <p key={a.id}>• {a.description} — {t('request.fees')} : {a.costStatus === 'TO_VERIFY' ? t('request.feesToVerify') : `${a.costAmountXof} F CFA`}</p>
              ))}
              <form onSubmit={(e) => {
                const f = form(e)
                const cost = f.costKnown ? { status: 'KNOWN', amountXof: Number(f.amount), source: f.source } : { status: 'TO_VERIFY' }
                void run((v) => api.post(`/api/agent/requests/${id}/actions`, { expectedVersion: v, description: f.description, cost }))
              }}>
                <label htmlFor="desc">{t('agent.action')}</label>
                <textarea id="desc" name="description" required minLength={5} placeholder={t('agent.actionPlaceholder')} />
                <label className="check"><input type="checkbox" name="costKnown" />{t('agent.costKnown')}</label>
                <div className="row">
                  <div className="field"><label htmlFor="amount">{t('agent.costAmount')}</label><input id="amount" name="amount" type="number" min={0} /></div>
                  <div className="field"><label htmlFor="source">{t('agent.costSource')}</label><input id="source" name="source" /></div>
                </div>
                <button className="btn secondary" type="submit">{t('agent.recordAction')}</button>
              </form>
            </Section>
          )}

          {d.state === 'UNDER_REVIEW' && (
            <Section title={t('agent.proposeSlot')}>
              <form onSubmit={(e) => {
                const f = form(e)
                // Saisie en heure de Lomé (UTC+0 toute l'année).
                void run((v) => api.post(`/api/agent/requests/${id}/slots`, { expectedVersion: v, facilityId: f.facilityId, startsAt: new Date(`${f.datetime}:00Z`).toISOString(), note: f.note || undefined }))
              }}>
                <label htmlFor="fac">{t('agent.facility')}</label>
                <select id="fac" name="facilityId">{ctx.facilities.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select>
                <label htmlFor="dt">{t('agent.datetime')}</label>
                <input id="dt" name="datetime" type="datetime-local" required />
                <label htmlFor="sn">{t('agent.note')}</label>
                <input id="sn" name="note" maxLength={300} />
                <button className="btn secondary" type="submit" style={{ marginTop: '.75rem' }}>{t('agent.proposeSlot')}</button>
              </form>
            </Section>
          )}

          {d.slots.length > 0 && (
            <Section title="Créneaux">
              {d.slots.map((s) => <p key={s.id}>{formatDateTime(s.startsAt)} · {s.facility.name} — <strong>{t(`slotStatus.${s.status}`)}</strong></p>)}
            </Section>
          )}

          {d.state === 'UNDER_REVIEW' && (
            <Section title={t('agent.agree')}>
              <form onSubmit={(e) => { const f = form(e); void tr('AGREE_ACTION', { agreementObtainedBy: f.by, note: f.note || undefined }) }}>
                <label htmlFor="by">{t('agent.agreementBy')}</label>
                <select id="by" name="by">
                  <option value="ACCEPTED_SLOT_IN_APP">{t('agent.byApp')}</option>
                  <option value="AGENT_PHONE_CALL">{t('agent.byPhone')}</option>
                  <option value="AGENT_IN_PERSON">{t('agent.byPerson')}</option>
                </select>
                <label htmlFor="an">{t('agent.note')}</label>
                <input id="an" name="note" />
                <button className="btn" type="submit" style={{ marginTop: '.75rem' }}>{t('agent.agree')}</button>
              </form>
            </Section>
          )}

          {d.state === 'ACTION_AGREED' && <button className="btn secondary" type="button" onClick={() => tr('MARK_AWAITING_COMPLETION')}>{t('agent.markDue')}</button>}

          {['ACTION_AGREED', 'AWAITING_COMPLETION'].includes(d.state) && (
            <Section title={t('agent.postpone')}>
              <form className="row" onSubmit={(e) => { const f = form(e); void tr('POSTPONE', { reason: f.reason }) }}>
                <input aria-label={t('agent.reason')} name="reason" required minLength={3} placeholder={t('agent.reason')} style={{ maxWidth: '24rem' }} />
                <button className="btn secondary" type="submit">{t('agent.postpone')}</button>
              </form>
              <form className="row" style={{ marginTop: '.75rem' }} onSubmit={(e) => { const f = form(e); void tr('DECLARE_CARE', { careDate: f.careDate }) }}>
                <input aria-label={t('request.careDate')} name="careDate" type="date" max={todayCivil()} required style={{ maxWidth: '14rem' }} />
                <button className="btn secondary" type="submit">{t('agent.declareOnBehalf')}</button>
              </form>
            </Section>
          )}

          {['ACTION_AGREED', 'AWAITING_COMPLETION', 'CARE_DECLARED', 'CARE_VERIFIED'].includes(d.state) && (
            <Section title={t('agent.verify')}>
              <p className="small muted">{t('agent.verifyHelp')}</p>
              {d.declarations.map((x, i) => <p key={i}>✓ Déclaration ({x.declaredByRole === 'BENEFICIARY' ? 'par la maman' : 'recueillie par un agent'}) : {formatDate(x.careDate)}</p>)}
              {d.verifications.map((v) => (
                <p key={v.id} style={{ textDecoration: v.supersededById || v.revokedAt ? 'line-through' : 'none' }}>
                  ✓✓ {formatDate(v.careDate)} · {t(`agent.sources.${v.source}`)} · {t(`agent.methods.${v.method}`)} — {v.note}
                  {v.correctionReason && <> (correction : {v.correctionReason})</>}
                  {(v.supersededById || v.revokedAt) && <span className="visually-hidden"> (remplacée)</span>}
                </p>
              ))}
              <form onSubmit={(e) => {
                const f = form(e)
                const action = d.state === 'CARE_VERIFIED' ? 'CORRECT_VERIFICATION' : 'VERIFY_CARE'
                void tr(action, { careDate: f.careDate, source: 'AGENT_VERIFICATION', method: f.method, note: f.note, ...(action === 'CORRECT_VERIFICATION' ? { correctionReason: f.correctionReason } : {}) })
              }}>
                <div className="row">
                  <div className="field"><label htmlFor="vd">{t('request.careDate')}</label><input id="vd" name="careDate" type="date" max={todayCivil()} required /></div>
                  <div className="field"><label htmlFor="vm">{t('agent.method')}</label>
                    <select id="vm" name="method">{['PHONE_CALL', 'IN_PERSON', 'FACILITY_REGISTER', 'OTHER'].map((m) => <option key={m} value={m}>{t(`agent.methods.${m}`)}</option>)}</select></div>
                </div>
                <label htmlFor="vn">{t('agent.note')}</label>
                <input id="vn" name="note" required minLength={3} />
                {d.state === 'CARE_VERIFIED' && (<><label htmlFor="vc">{t('facility.correctionReason')}</label><input id="vc" name="correctionReason" required minLength={3} /></>)}
                <button className="btn" type="submit" style={{ marginTop: '.75rem' }}>{d.state === 'CARE_VERIFIED' ? t('facility.correct') : t('agent.verify')}</button>
              </form>
            </Section>
          )}

          {!['CARE_VERIFIED', 'CLOSED_WITHOUT_CARE'].includes(d.state) && (
            <>
              <Section title={t('agent.messageToBeneficiary')}>
                {d.messages.map((m) => <p key={m.id}><strong>{m.direction === 'TO_BENEFICIARY' ? 'Équipe' : 'Maman'} :</strong> {m.body} <span className="small muted">{formatDateTime(m.createdAt)}</span></p>)}
                <form onSubmit={(e) => { const f = form(e); void run(() => api.post(`/api/agent/requests/${id}/messages`, { body: f.body }), t('request.responseSaved')) }}>
                  <label className="visually-hidden" htmlFor="mb">{t('agent.messageToBeneficiary')}</label>
                  <textarea id="mb" name="body" required maxLength={1000} />
                  <button className="btn secondary" type="submit">{t('agent.send')}</button>
                </form>
              </Section>
              <Section title={t('agent.reassign')}>
                <form className="row" onSubmit={(e) => { const f = form(e); void run((v) => api.post(`/api/agent/requests/${id}/reassign`, { expectedVersion: v, agentId: f.agentId, reason: f.reason })) }}>
                  <select aria-label={t('agent.reassign')} name="agentId" style={{ maxWidth: '16rem' }}>{ctx.agents.map((a) => <option key={a.id} value={a.id}>{a.displayName}</option>)}</select>
                  <input aria-label={t('agent.reason')} name="reason" required minLength={3} placeholder={t('agent.reason')} style={{ maxWidth: '16rem' }} />
                  <button className="btn secondary" type="submit">{t('agent.reassign')}</button>
                </form>
              </Section>
              <Section title={t('agent.close')}>
                <form className="row" onSubmit={(e) => { const f = form(e); void tr('CLOSE_WITHOUT_CARE', { reason: f.reason, note: f.note || undefined }) }}>
                  <select aria-label={t('agent.reason')} name="reason" style={{ maxWidth: '20rem' }}>{CLOSE.map((c) => <option key={c} value={c}>{t(`agent.closeReasons.${c}`)}</option>)}</select>
                  <input aria-label={t('agent.note')} name="note" placeholder={t('agent.note')} style={{ maxWidth: '16rem' }} />
                  <button className="btn danger" type="submit">{t('agent.close')}</button>
                </form>
              </Section>
            </>
          )}

          <Section title={t('agent.history')}>
            <ol className="small">{d.events.map((e) => <li key={e.id}>{formatDateTime(e.createdAt)} — {e.type} ({e.actorRole}){e.toState ? ` → ${stateLabel(t, e.toState, true)}` : ''}</li>)}</ol>
          </Section>
        </div>
      )}
    </Layout>
  )
}
