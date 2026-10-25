import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Layout } from '../../components/Layout.tsx'
import { Alert, LoadState, errorMessage, formatDateTime, useLoad } from '../../components/ui.tsx'
import { api } from '../../api/client.ts'
import { useSession } from '../../session/SessionContext.tsx'

interface Rate { numerator: number; denominator: number; value: number | null; definition: string }
interface Delay { medianHours: number | null; meanHours: number | null; measured: number; missing: number; definition: string }
interface Metrics {
  period: { from: string; to: string; basis: string }
  requests: { received: number; open: number; closed: number }
  firstHumanResponse: Delay
  actionAgreed: Delay
  careDeclared: Rate
  careVerified: Rate
  closedWithoutCare: Rate & { reasons: Record<string, number> }
  obstacles: { byCategory: Record<string, number>; definition: string }
  agentLoad: Array<{ agent: string; team: string | null; openAssigned: number }>
  notifications: Rate & { byChannelAndStatus: Array<{ channel: string; status: string; count: number }> }
  caveat: string
}

function RateRow({ label, rate }: { label: string; rate: Rate }) {
  const { t } = useTranslation()
  return (
    <tr>
      <th scope="row">{label}</th>
      <td>{rate.value === null ? t('admin.notAvailable') : `${Math.round(rate.value * 100)} %`}</td>
      <td>{rate.numerator} / {rate.denominator}</td>
      <td className="small">{rate.definition}</td>
    </tr>
  )
}

function MfaGate() {
  const { t } = useTranslation()
  const { me, refresh } = useSession()
  const [setup, setSetup] = useState<{ secret: string; otpauthUri: string } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const code = String(new FormData(e.currentTarget).get('code'))
    setError(null)
    try {
      await api.post(me?.totpEnabled ? '/api/auth/totp/verify' : '/api/auth/totp/enable', { code })
      await refresh()
    } catch (err) {
      setError(errorMessage(err, t))
    }
  }
  return (
    <div className="card">
      <h2>{t('login.totpTitle')}</h2>
      <p>{t('admin.mfaNeeded')}</p>
      {error && <Alert kind="error">{error}</Alert>}
      {!me?.totpEnabled && !setup && (
        <button className="btn" type="button" onClick={async () => setSetup(await api.post('/api/auth/totp/setup'))}>{t('admin.setupMfa')}</button>
      )}
      {setup && <p className="small">Clé à saisir dans votre application : <code>{setup.secret}</code></p>}
      {(me?.totpEnabled || setup) && (
        <form onSubmit={submit}>
          <label htmlFor="totp">{t('login.totpCode')}</label>
          <input id="totp" name="code" inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} required />
          <p className="small muted">{t('login.totpHelp')}</p>
          <button className="btn" type="submit">{t('login.verify')}</button>
        </form>
      )}
    </div>
  )
}

export function AdminHome() {
  const { t } = useTranslation()
  const { me } = useSession()
  const [tab, setTab] = useState<'metrics' | 'accounts' | 'languages' | 'connectors'>('metrics')
  if (!me?.mfaVerified) return <Layout><h1>{t('admin.title')}</h1><MfaGate /></Layout>

  return (
    <Layout wide>
      <h1>{t('admin.title')}</h1>
      <div className="row" role="tablist" aria-label={t('admin.title')}>
        {(['metrics', 'accounts', 'languages', 'connectors'] as const).map((k) => (
          <button key={k} role="tab" aria-selected={tab === k} type="button" className={tab === k ? 'btn' : 'btn secondary'} onClick={() => setTab(k)}>{t(`admin.${k}`)}</button>
        ))}
        <a className="btn secondary" href="/api/admin/export/requests.csv">{t('admin.export')}</a>
      </div>
      <div style={{ marginTop: '1rem' }}>
        {tab === 'metrics' && <MetricsTab />}
        {tab === 'accounts' && <AccountsTab />}
        {tab === 'languages' && <LanguagesTab />}
        {tab === 'connectors' && <ConnectorsTab />}
      </div>
    </Layout>
  )
}

function MetricsTab() {
  const { t } = useTranslation()
  const m = useLoad(() => api.get<Metrics>('/api/admin/metrics'))
  if (!m.data) return <LoadState loading={m.loading} error={m.error} onRetry={m.reload} />
  const d = m.data
  const hours = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 })
  const delay = (x: Delay) => (x.medianHours === null || x.meanHours === null ? t('admin.notAvailable') : `médiane ${hours.format(x.medianHours)} h · moyenne ${hours.format(x.meanHours)} h (${x.measured} mesurées, ${x.missing} sans valeur)`)
  return (
    <>
      {/* Avertissement traduisible seulement : celui du serveur répétait la même idée. */}
      <Alert>{t('admin.caveat')}</Alert>
      <p className="small">{t('admin.period')} : {formatDateTime(d.period.from)} → {formatDateTime(d.period.to)} — {d.period.basis}</p>
      <p>Reçues : <strong>{d.requests.received}</strong> · en cours : {d.requests.open} · clôturées : {d.requests.closed}</p>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Indicateur</th><th>Valeur</th><th>{t('admin.denominator')}</th><th>Définition</th></tr></thead>
          <tbody>
            <RateRow label="Soins déclarés reçus" rate={d.careDeclared} />
            <RateRow label="Soins vérifiés" rate={d.careVerified} />
            <RateRow label="Clôtures sans soin confirmé" rate={d.closedWithoutCare} />
            <RateRow label="Échecs de notification" rate={d.notifications} />
          </tbody>
        </table>
      </div>
      <p><strong>Première réponse humaine :</strong> {delay(d.firstHumanResponse)}</p>
      <p><strong>Action convenue :</strong> {delay(d.actionAgreed)}</p>
      <h2>Obstacles</h2>
      <ul>{Object.entries(d.obstacles.byCategory).map(([k, v]) => <li key={k}>{t(`categories.${k}`, { defaultValue: k })} : {v}</li>)}</ul>
      <h2>Motifs de clôture sans soin</h2>
      <ul>{Object.entries(d.closedWithoutCare.reasons).map(([k, v]) => <li key={k}>{t(`agent.closeReasons.${k}`, { defaultValue: k })} : {v}</li>)}</ul>
      <h2>Charge par agent (dossiers ouverts affectés)</h2>
      <ul>{d.agentLoad.map((a) => <li key={a.agent}>{a.agent} ({a.team}) : {a.openAssigned}</li>)}</ul>
    </>
  )
}

function AccountsTab() {
  const { t } = useTranslation()
  const accounts = useLoad(() => api.get<Array<{ id: string; role: string; loginId: string; displayName: string; status: string; canConfirmCare: boolean; totpEnabled: boolean; team: { name: string } | null; facility: { name: string } | null }>>('/api/admin/accounts'))
  if (!accounts.data) return <LoadState loading={accounts.loading} error={accounts.error} onRetry={accounts.reload} />
  return (
    <div className="table-wrap">
      <table>
        <thead><tr><th>Nom</th><th>Rôle</th><th>Identifiant</th><th>Périmètre</th><th>État</th></tr></thead>
        <tbody>{accounts.data.map((a) => (
          <tr key={a.id}><td>{a.displayName}</td><td>{a.role}</td><td>{a.loginId}</td>
            <td>{a.team?.name ?? a.facility?.name ?? '—'}{a.role === 'FACILITY_REFERENT' && (a.canConfirmCare ? ' · habilité' : ' · non habilité')}</td>
            <td>{a.status}{a.role === 'ADMIN' && (a.totpEnabled ? ' · double vérification' : ' · sans double vérification')}</td></tr>
        ))}</tbody>
      </table>
      <p className="small muted">{t('admin.createAccount')} : POST /api/admin/accounts (voir docs/guide-administration.md).</p>
    </div>
  )
}

function LanguagesTab() {
  const { t } = useTranslation()
  const langs = useLoad(() => api.get<Array<{ code: string; name: string; uiAvailable: boolean; uiValidation: string; audio: { total: number; validated: number; missing: number; items: Array<{ messageKey: string; version: number; transcript: string; hasFile: boolean; validation: string; provenance: string }> } }>>('/api/admin/languages'))
  if (!langs.data) return <LoadState loading={langs.loading} error={langs.error} onRetry={langs.reload} />
  return (
    <>
      {langs.data.map((l) => (
        <section className="card" key={l.code}>
          <h2>{l.name} ({l.code})</h2>
          <p>{t('admin.langUi')} : <strong>{l.uiAvailable ? 'oui' : 'non'}</strong> · {t('admin.langValidation')} : {l.uiValidation}</p>
          {l.audio.missing > 0 && <Alert kind="error">{t('admin.audioMissing', { count: l.audio.missing })}</Alert>}
          <div className="table-wrap"><table>
            <thead><tr><th>Message</th><th>v</th><th>Transcription</th><th>Fichier</th><th>Statut</th><th>Provenance</th></tr></thead>
            <tbody>{l.audio.items.map((i) => (
              <tr key={`${i.messageKey}-${i.version}`}><td>{i.messageKey}</td><td>{i.version}</td><td>{i.transcript}</td><td>{i.hasFile ? 'oui' : 'non'}</td><td>{i.validation}</td><td className="small">{i.provenance}</td></tr>
            ))}</tbody>
          </table></div>
        </section>
      ))}
    </>
  )
}

function ConnectorsTab() {
  const { t } = useTranslation()
  const c = useLoad(() => api.get<{ connectors: Array<{ kind: string; requestedProvider: string; implemented: boolean; simulated: boolean; blockedReason: string | null }>; outbox: Array<{ id: string; channel: string; templateKey: string; status: string; provider: string | null; attempts: number; lastError: string | null; createdAt: string }> }>('/api/admin/connectors'))
  if (!c.data) return <LoadState loading={c.loading} error={c.error} onRetry={c.reload} />
  return (
    <>
      <div className="table-wrap"><table>
        <thead><tr><th>Canal</th><th>Fournisseur</th><th>État</th></tr></thead>
        <tbody>{c.data.connectors.map((x) => (
          <tr key={x.kind}><td>{x.kind}</td><td>{x.requestedProvider}</td>
            <td>{x.simulated ? t('admin.simulated') : x.implemented ? 'Actif' : `${t('admin.notImplemented')} — ${x.blockedReason ?? ''}`}</td></tr>
        ))}</tbody>
      </table></div>
      <h2>Envois récents (hors application)</h2>
      <div className="table-wrap"><table>
        <thead><tr><th>Date</th><th>Canal</th><th>Modèle</th><th>Statut</th><th>Essais</th><th>Erreur</th></tr></thead>
        <tbody>{c.data.outbox.map((n) => (
          <tr key={n.id}><td>{formatDateTime(n.createdAt)}</td><td>{n.channel}</td><td>{n.templateKey}</td><td>{n.status}</td><td>{n.attempts}</td><td>{n.lastError ?? '—'}</td></tr>
        ))}</tbody>
      </table></div>
    </>
  )
}
