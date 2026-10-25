import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Layout } from '../../components/Layout.tsx'
import { Alert, LoadState, errorMessage, formatDateTime, useLoad } from '../../components/ui.tsx'
import { api } from '../../api/client.ts'
import { AgentNav } from './Queue.tsx'

interface Row { id: string; displayName: string; identifier: string; status: string; children: Array<{ firstName: string }>; deletionRequested: boolean }

/** Inscription assistée et récupération supervisée. Les codes ne sont affichés qu'une fois. */
export function Beneficiaries() {
  const { t } = useTranslation()
  const list = useLoad(() => api.get<Row[]>('/api/agent/beneficiaries'))
  const [created, setCreated] = useState<{ identifier?: string; activationCode: string; expiresAt: string } | null>(null)
  const [error, setError] = useState<string | null>(null)

  const register = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const formEl = e.currentTarget // l'événement n'est plus disponible après un await
    const f = Object.fromEntries(new FormData(formEl)) as Record<string, string>
    setError(null)
    try {
      const texts = await api.get<Array<{ purpose: string; version: string }>>('/api/public/consent-texts?locale=fr')
      const res = await api.post<{ identifier: string; activationCode: string; expiresAt: string }>('/api/agent/beneficiaries', {
        displayName: f.displayName,
        activityLabel: f.activity || undefined,
        phoneE164: f.phone || undefined,
        phoneIsShared: f.shared === 'on',
        preferredLocale: 'fr',
        children: f.child ? [{ firstName: f.child, birthYearMonth: f.childBirth }] : [],
        callbackConsent: f.callback === 'on',
        callbackConsentTextVersion: texts.find((x) => x.purpose === 'RECEIVE_CALLBACK')?.version,
      })
      setCreated(res)
      formEl.reset()
      await list.reload()
    } catch (err) {
      setError(errorMessage(err, t))
    }
  }

  const recover = async (id: string) => {
    setError(null)
    try {
      setCreated(await api.post(`/api/agent/beneficiaries/${id}/recovery`))
      await list.reload()
    } catch (err) {
      setError(errorMessage(err, t))
    }
  }

  return (
    <Layout wide nav={<AgentNav />}>
      <h1>{t('agent.beneficiaries')}</h1>
      {error && <Alert kind="error">{error}</Alert>}
      {created && (
        <div className="card highlight" role="status">
          <p><strong>{t('agent.codeOnce')}</strong></p>
          {created.identifier && <p>{t('agent.identifier')} : <span className="code-once">{created.identifier}</span></p>}
          <p>{t('agent.activationCode')} : <span className="code-once">{created.activationCode}</span></p>
          <p className="small">{t('agent.validUntil', { date: formatDateTime(created.expiresAt) })}</p>
          <button className="btn secondary" type="button" onClick={() => setCreated(null)}>{t('app.close')}</button>
        </div>
      )}

      <section className="card">
        <h2>{t('agent.newBeneficiary')}</h2>
        <form onSubmit={register}>
          <div className="field"><label htmlFor="dn">{t('agent.displayName')}</label><input id="dn" name="displayName" required minLength={2} maxLength={60} /></div>
          <div className="field"><label htmlFor="ac">{t('agent.activity')}</label><input id="ac" name="activity" maxLength={60} /></div>
          <div className="field"><label htmlFor="ph">{t('agent.phone')}</label><input id="ph" name="phone" inputMode="tel" pattern="^\+\d{8,15}$" /></div>
          <label className="check"><input type="checkbox" name="shared" defaultChecked />{t('agent.phoneShared')}</label>
          <div className="row">
            <div className="field"><label htmlFor="ch">{t('agent.child')}</label><input id="ch" name="child" maxLength={40} /></div>
            <div className="field"><label htmlFor="cb">{t('agent.childBirth')}</label><input id="cb" name="childBirth" type="month" /></div>
          </div>
          <label className="check"><input type="checkbox" name="callback" />{t('agent.callbackConsent')}</label>
          <button className="btn" type="submit" style={{ marginTop: '.75rem' }}>{t('agent.register')}</button>
        </form>
      </section>

      <LoadState loading={list.loading} error={list.error} onRetry={list.reload} />
      {list.data && (
        <div className="table-wrap">
          <table>
            <thead><tr><th>Nom</th><th>{t('agent.identifier')}</th><th>État</th><th>Enfants</th><th>{t('agent.recovery')}</th></tr></thead>
            <tbody>
              {list.data.map((b) => (
                <tr key={b.id}>
                  <td>{b.displayName}{b.deletionRequested && <><br /><span className="badge">Suppression demandée</span></>}</td>
                  <td>{b.identifier}</td>
                  <td>{b.status}</td>
                  <td>{b.children.map((c) => c.firstName).join(', ') || '—'}</td>
                  <td><button className="btn secondary" type="button" onClick={() => recover(b.id)} title={t('agent.recoveryHelp')}>{t('agent.recovery')}</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Layout>
  )
}
