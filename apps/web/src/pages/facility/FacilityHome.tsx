import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Layout } from '../../components/Layout.tsx'
import { Alert, LoadState, StateBadge, errorMessage, formatDate, formatDateTime, todayCivil, useLoad } from '../../components/ui.tsx'
import { api, ApiError } from '../../api/client.ts'

interface Data {
  canConfirmCare: boolean
  requests: Array<{
    id: string; state: string; version: number; category: string | null; beneficiary: string
    slots: Array<{ id: string; startsAt: string; status: string }>
    declaredCareDates: string[]
    verifications: Array<{ id: string; careDate: string; source: string; superseded: boolean; revoked: boolean }>
  }>
}

/** Vue réduite à la coordination : ni texte libre, ni audio, ni téléphone. */
export function FacilityHome() {
  const { t } = useTranslation()
  const data = useLoad(() => api.get<Data>('/api/facility/requests'))
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const run = async (fn: () => Promise<unknown>) => {
    setError(null)
    setNotice(null)
    try {
      await fn()
      setNotice(t('settings.saved'))
    } catch (e) {
      setError(e instanceof ApiError && e.code === 'VERSION_CONFLICT' ? t('agent.conflict') : errorMessage(e, t))
    }
    await data.reload()
  }
  const submit = (r: Data['requests'][number], action: string) => (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const f = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>
    const body: Record<string, unknown> = { expectedVersion: r.version }
    if (action === 'REVOKE_VERIFICATION') body.reason = f.reason
    else Object.assign(body, { careDate: f.careDate, source: 'FACILITY_CONFIRMATION', method: f.method, note: f.note, ...(action === 'CORRECT_VERIFICATION' ? { correctionReason: f.correctionReason } : {}) })
    void run(() => api.post(`/api/facility/requests/${r.id}/transitions/${action}`, body))
  }

  const d = data.data
  return (
    <Layout wide>
      <h1>{t('facility.title')}</h1>
      <p className="muted">{t('facility.limitedView')}</p>
      <LoadState loading={data.loading && !d} error={data.error} onRetry={data.reload} />
      {notice && <Alert>{notice}</Alert>}
      {error && <Alert kind="error">{error}</Alert>}
      {d && !d.canConfirmCare && <Alert>{t('facility.notAuthorized')}</Alert>}
      {d && d.requests.length === 0 && <p>{t('facility.empty')}</p>}
      {d?.requests.map((r) => (
        <section className="card" key={r.id}>
          <h2>{r.beneficiary} · {t(`categories.${r.category ?? 'none'}`)}</h2>
          <p><StateBadge state={r.state} /></p>
          {r.slots.map((s) => (
            <p key={s.id} className="row" style={{ alignItems: 'center' }}>
              {formatDateTime(s.startsAt)} — <strong>{t(`slotStatus.${s.status}`)}</strong>
              {d.canConfirmCare && s.status === 'ACCEPTED' && (
                <button className="btn" type="button" onClick={() => run(() => api.post(`/api/facility/slots/${s.id}/confirm`))}>{t('facility.confirmSlot')}</button>
              )}
            </p>
          ))}
          {r.declaredCareDates.map((dt) => <p key={dt}>✓ Déclaration de la maman : {formatDate(dt)}</p>)}
          {r.verifications.map((v) => (
            <p key={v.id} style={{ textDecoration: v.superseded || v.revoked ? 'line-through' : 'none' }}>✓✓ {formatDate(v.careDate)} · {t(`agent.sources.${v.source}`)}</p>
          ))}
          {d.canConfirmCare && ['ACTION_AGREED', 'AWAITING_COMPLETION', 'CARE_DECLARED', 'CARE_VERIFIED'].includes(r.state) && (
            <form onSubmit={submit(r, r.state === 'CARE_VERIFIED' ? 'CORRECT_VERIFICATION' : 'VERIFY_CARE')}>
              <div className="row">
                <div className="field"><label htmlFor={`d-${r.id}`}>{t('request.careDate')}</label><input id={`d-${r.id}`} name="careDate" type="date" max={todayCivil()} required /></div>
                <div className="field"><label htmlFor={`m-${r.id}`}>{t('agent.method')}</label>
                  <select id={`m-${r.id}`} name="method">{['FACILITY_REGISTER', 'IN_PERSON', 'PHONE_CALL', 'OTHER'].map((m) => <option key={m} value={m}>{t(`agent.methods.${m}`)}</option>)}</select></div>
              </div>
              <label htmlFor={`n-${r.id}`}>{t('agent.note')}</label>
              <input id={`n-${r.id}`} name="note" required minLength={3} />
              {r.state === 'CARE_VERIFIED' && (<><label htmlFor={`c-${r.id}`}>{t('facility.correctionReason')}</label><input id={`c-${r.id}`} name="correctionReason" required minLength={3} /></>)}
              <button className="btn" type="submit" style={{ marginTop: '.75rem' }}>{r.state === 'CARE_VERIFIED' ? t('facility.correct') : t('facility.verifyCare')}</button>
            </form>
          )}
          {d.canConfirmCare && r.state === 'CARE_VERIFIED' && (
            <form className="row" style={{ marginTop: '.75rem' }} onSubmit={submit(r, 'REVOKE_VERIFICATION')}>
              <input aria-label={t('agent.reason')} name="reason" required minLength={3} placeholder={t('agent.reason')} style={{ maxWidth: '20rem' }} />
              <button className="btn danger" type="submit">{t('facility.revoke')}</button>
            </form>
          )}
        </section>
      ))}
    </Layout>
  )
}
