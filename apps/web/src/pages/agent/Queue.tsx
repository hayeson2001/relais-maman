import { useState } from 'react'
import { Link, NavLink } from '../../router.tsx'
import { useTranslation } from 'react-i18next'
import { Layout } from '../../components/Layout.tsx'
import { LoadState, StateBadge, formatDateTime, useLoad } from '../../components/ui.tsx'
import { api } from '../../api/client.ts'

export const AgentNav = () => {
  const { t } = useTranslation()
  return (
    <>
      <NavLink to="/agent">{t('agent.queue')}</NavLink>
      <NavLink to="/agent/beneficiaires">{t('agent.beneficiaries')}</NavLink>
    </>
  )
}

interface Row {
  id: string; state: string; category: string | null; categorySource: string; healthReviewCue: boolean; createdAt: string
  viewed: boolean; beneficiary: string; zone: string; assignedTo: string | null; hasAudio: boolean
}
const STATES = ['RECEIVED', 'UNDER_REVIEW', 'ACTION_AGREED', 'AWAITING_COMPLETION', 'CARE_DECLARED', 'CARE_VERIFIED', 'CLOSED_WITHOUT_CARE']
const CATS = ['TRANSPORT', 'COST', 'AVAILABILITY', 'UNDERSTANDING', 'OTHER_CALLBACK', 'HEALTH_QUESTION']

export function Queue() {
  const { t } = useTranslation()
  const [f, setF] = useState({ state: '', assigned: 'all', category: '', from: '', to: '', open: 'true' })
  const qs = new URLSearchParams(Object.entries(f).filter(([, v]) => v)).toString()
  const rows = useLoad(() => api.get<Row[]>(`/api/agent/requests?${qs}`), [qs])

  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value })
  return (
    <Layout wide nav={<AgentNav />}>
      <h1>{t('agent.queue')}</h1>
      <fieldset className="card filters">
        <legend className="visually-hidden">{t('agent.filters')}</legend>
        <div><label htmlFor="f-state">{t('agent.state')}</label>
          <select id="f-state" value={f.state} onChange={set('state')}>
            <option value="">{t('agent.all')}</option>
            {STATES.map((s) => <option key={s} value={s}>{t(`states.${s}`)}</option>)}
          </select></div>
        <div><label htmlFor="f-assigned">{t('agent.assigned')}</label>
          <select id="f-assigned" value={f.assigned} onChange={set('assigned')}>
            <option value="all">{t('agent.assignedAll')}</option>
            <option value="me">{t('agent.assignedMe')}</option>
            <option value="unassigned">{t('agent.assignedNone')}</option>
          </select></div>
        <div><label htmlFor="f-cat">{t('agent.category')}</label>
          <select id="f-cat" value={f.category} onChange={set('category')}>
            <option value="">{t('agent.all')}</option>
            {CATS.map((c) => <option key={c} value={c}>{t(`categories.${c}`)}</option>)}
          </select></div>
        <div><label htmlFor="f-from">{t('agent.from')}</label><input id="f-from" type="date" value={f.from} onChange={set('from')} /></div>
        <div><label htmlFor="f-to">{t('agent.to')}</label><input id="f-to" type="date" value={f.to} onChange={set('to')} /></div>
        <label className="check"><input type="checkbox" checked={f.open === 'true'} onChange={(e) => setF({ ...f, open: e.target.checked ? 'true' : '' })} />{t('agent.openOnly')}</label>
      </fieldset>
      <LoadState loading={rows.loading} error={rows.error} onRetry={rows.reload} />
      {rows.data && rows.data.length === 0 && <p>{t('agent.empty')}</p>}
      {rows.data && rows.data.length > 0 && (
        <div className="table-wrap">
          <table>
            <thead><tr><th>Bénéficiaire</th><th>{t('agent.category')}</th><th>{t('agent.state')}</th><th>Reçue</th><th>{t('agent.assigned')}</th><th><span className="visually-hidden">Ouvrir</span></th></tr></thead>
            <tbody>
              {rows.data.map((r) => (
                <tr key={r.id}>
                  {/* Lien dans la 1re colonne : atteignable sur téléphone sans faire défiler le tableau. */}
                  <td><Link to={`/agent/demande/${r.id}`}>{r.beneficiary}</Link><br /><span className="small muted">{r.zone}</span></td>
                  <td>
                    {t(`categories.${r.category ?? 'none'}`)}
                    {r.categorySource === 'MODEL_SUGGESTION' && <><br /><span className="badge">{t('agent.suggestion')}</span></>}
                    {r.healthReviewCue && <><br /><span className="badge">⚠ {t('agent.healthCue')}</span></>}
                    {r.hasAudio && <><br /><span className="badge">🎙 {t('agent.audio')}</span></>}
                  </td>
                  <td><StateBadge state={r.state} viewed={r.viewed} /><br /><span className="small">{r.viewed ? t('agent.viewed') : t('agent.notViewed')}</span></td>
                  <td>{formatDateTime(r.createdAt)}</td>
                  <td>{r.assignedTo ?? '—'}</td>
                  <td><Link className="btn secondary" to={`/agent/demande/${r.id}`}>Ouvrir</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Layout>
  )
}
