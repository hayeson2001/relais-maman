import { useState } from 'react'
import { Link, useParams } from '../../router.tsx'
import { useTranslation } from 'react-i18next'
import { Layout } from '../../components/Layout.tsx'
import { ListenButton } from '../../components/ListenButton.tsx'
import { Alert, LoadState, StateBadge, errorMessage, formatDate, formatDateTime, todayCivil, useLoad } from '../../components/ui.tsx'
import { api } from '../../api/client.ts'

interface Detail {
  id: string
  state: string
  version: number
  category: string | null
  createdAt: string
  viewedByAgent: boolean
  text: string
  slots: Array<{ id: string; startsAt: string; status: string; facility: { name: string }; note: string | null }>
  messages: Array<{ id: string; body: string; fromMe: boolean; at: string }>
  declarations: Array<{ careDate: string }>
  verifications: Array<{ careDate: string; source: string }>
}

const ORDER = ['RECEIVED', 'UNDER_REVIEW', 'ACTION_AGREED', 'AWAITING_COMPLETION', 'CARE_DECLARED', 'CARE_VERIFIED']

export function RequestDetail() {
  const { t } = useTranslation()
  const { id } = useParams()
  const detail = useLoad(() => api.get<Detail>(`/api/me/requests/${id}`), [id])
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [reply, setReply] = useState('')
  const [careDate, setCareDate] = useState(todayCivil())

  const act = async (fn: () => Promise<unknown>, ok: string) => {
    setError(null)
    setNotice(null)
    try {
      await fn()
      setNotice(ok)
      await detail.reload()
    } catch (e) {
      setError(errorMessage(e, t))
    }
  }

  const d = detail.data
  const stepIndex = d ? ORDER.indexOf(d.state) : -1
  const pendingSlot = d?.slots.find((s) => s.status === 'PROPOSED')
  const activeSlot = d?.slots.filter((s) => s.status !== 'SUPERSEDED').at(-1)

  return (
    <Layout>
      <Link to="/b" className="btn secondary">{t('app.back')}</Link>
      <LoadState loading={detail.loading} error={detail.error} onRetry={detail.reload} />
      {notice && <Alert>{notice}</Alert>}
      {error && <Alert kind="error">{error}</Alert>}
      {d && (
        <>
          <h1>{t(`categories.${d.category ?? 'none'}`)}</h1>
          <p><StateBadge state={d.state} viewed={d.viewedByAgent} /></p>

          <h2>{t('request.timeline')}</h2>
          {d.state === 'CLOSED_WITHOUT_CARE' ? (
            <p>{t('states.CLOSED_WITHOUT_CARE')}</p>
          ) : (
            <ol className="steps">
              <li className="done">{t('states.RECEIVED')}</li>
              <li className={d.viewedByAgent ? 'done' : ''}>{t('states.VIEWED')}</li>
              {ORDER.slice(2).map((s, i) => (
                <li key={s} className={stepIndex >= i + 2 ? 'done' : ''}>{t(`states.${s}`)}</li>
              ))}
            </ol>
          )}

          {pendingSlot && (
            <div className="card highlight">
              <h2>{t('request.proposedSlot')}</h2>
              <p><strong>{formatDateTime(pendingSlot.startsAt)}</strong></p>
              <p>{pendingSlot.facility.name}</p>
              {pendingSlot.note && <p>{pendingSlot.note}</p>}
              <ListenButton text={`${t('request.proposedSlot')} : ${formatDateTime(pendingSlot.startsAt)}, ${pendingSlot.facility.name}`} />
              <div className="stack">
                <button className="btn block" type="button" onClick={() => act(() => api.post(`/api/me/slots/${pendingSlot.id}/respond`, { response: 'ACCEPT' }), t('request.responseSaved'))}>✓ {t('request.accept')}</button>
                <button className="btn secondary block" type="button" onClick={() => act(() => api.post(`/api/me/slots/${pendingSlot.id}/respond`, { response: 'ASK_OTHER' }), t('request.responseSaved'))}>↻ {t('request.askOther')}</button>
                <button className="btn secondary block" type="button" onClick={() => act(() => api.post(`/api/me/slots/${pendingSlot.id}/respond`, { response: 'DECLINE' }), t('request.responseSaved'))}>✕ {t('request.decline')}</button>
              </div>
            </div>
          )}
          {!pendingSlot && activeSlot && (
            <div className="card">
              <p><strong>{formatDateTime(activeSlot.startsAt)}</strong> · {activeSlot.facility.name}</p>
              <p className="small">{t(`slotStatus.${activeSlot.status}`)}</p>
            </div>
          )}

          {d.messages.length > 0 && (
            <>
              <h2>{t('request.messages')}</h2>
              {d.messages.map((m) => (
                <div key={m.id} className={`card ${m.fromMe ? '' : 'highlight'}`}>
                  <p>{m.body}</p>
                  <p className="small">{formatDateTime(m.at)}</p>
                  {!m.fromMe && <ListenButton text={m.body} />}
                </div>
              ))}
            </>
          )}
          {!['CARE_VERIFIED', 'CLOSED_WITHOUT_CARE'].includes(d.state) && (
            <form onSubmit={(e) => { e.preventDefault(); void act(async () => { await api.post(`/api/me/requests/${d.id}/messages`, { body: reply }); setReply('') }, t('request.responseSaved')) }}>
              <label htmlFor="reply">{t('request.reply')}</label>
              <textarea id="reply" maxLength={1000} value={reply} placeholder={t('request.replyPlaceholder')} onChange={(e) => setReply(e.target.value)} />
              <button className="btn secondary" type="submit" disabled={!reply.trim()}>{t('request.reply')}</button>
            </form>
          )}

          {['ACTION_AGREED', 'AWAITING_COMPLETION'].includes(d.state) && (
            <div className="card" style={{ marginTop: '1rem' }}>
              <h2>{t('request.declareTitle')}</h2>
              <p>{t('request.declareHelp')}</p>
              <label htmlFor="care-date">{t('request.careDate')}</label>
              <input id="care-date" type="date" max={todayCivil()} value={careDate} onChange={(e) => setCareDate(e.target.value)} />
              <button className="btn block" type="button" style={{ marginTop: '.75rem' }}
                onClick={() => act(() => api.post(`/api/me/requests/${d.id}/declare-care`, { expectedVersion: d.version, careDate }), t('request.declared'))}>
                {t('request.declare')}
              </button>
            </div>
          )}
          {d.declarations.length > 0 && <p>✓ {t('states.CARE_DECLARED')} ({formatDate(d.declarations.at(-1)!.careDate)})</p>}
          {d.verifications.length > 0 && (
            <p>✓✓ {t('request.verifiedBy', { source: t(`agent.sources.${d.verifications[0]!.source}`) })}</p>
          )}
        </>
      )}
    </Layout>
  )
}
