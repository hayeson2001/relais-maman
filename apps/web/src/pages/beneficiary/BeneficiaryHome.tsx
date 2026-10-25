import { Link } from '../../router.tsx'
import { useTranslation } from 'react-i18next'
import { Layout } from '../../components/Layout.tsx'
import { LoadState, StateBadge, formatDateTime, useLoad } from '../../components/ui.tsx'
import { api } from '../../api/client.ts'
import type { Overview } from './types.ts'

export function BeneficiaryHome() {
  const { t } = useTranslation()
  const overview = useLoad(() => api.get<Overview>('/api/me/overview'))
  const o = overview.data

  return (
    <Layout>
      <LoadState loading={overview.loading} error={overview.error} onRetry={overview.reload} />
      {o && (
        <>
          <h1>{t('beneficiary.hello', { name: o.displayName })}</h1>

          <Link className="btn block" to="/b/demande">{t('beneficiary.report')}</Link>

          <h2>{t('beneficiary.nextAppointments')}</h2>
          {o.appointments.length === 0 && <p className="muted">{t('beneficiary.noAppointments')}</p>}
          {o.appointments.map((a) => (
            <div className="card" key={a.id}>
              <p><strong>{a.title}</strong></p>
              <p>{formatDateTime(a.startsAt)}</p>
              <p className="muted">{a.facility} · {a.forChild ? t('beneficiary.forChild', { name: a.forChild }) : t('beneficiary.forMe')}</p>
            </div>
          ))}

          <h2>{t('beneficiary.myRequests')}</h2>
          {o.requests.length === 0 && <p className="muted">{t('beneficiary.noRequests')}</p>}
          {o.requests.map((r) => {
            const waiting = r.slots.some((s) => s.status === 'PROPOSED') || r.lastMessage !== null
            return (
              <div className="card" key={r.id}>
                <p className="row" style={{ justifyContent: 'space-between' }}>
                  <strong>{t(`categories.${r.category ?? 'none'}`)}</strong>
                  <StateBadge state={r.state} viewed={r.viewedByAgent} />
                </p>
                {waiting && <p><span className="badge">{t('beneficiary.newAnswer')}</span></p>}
                <Link className="btn secondary" to={`/b/demande/${r.id}`}>{t('beneficiary.openRequest')}</Link>
              </div>
            )
          })}

          <Link className="btn secondary block" to="/b/preferences" style={{ marginTop: '1rem' }}>{t('beneficiary.settings')}</Link>
        </>
      )}
    </Layout>
  )
}
