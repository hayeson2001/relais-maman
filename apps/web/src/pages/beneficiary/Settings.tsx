import { useEffect, useState } from 'react'
import { Link } from '../../router.tsx'
import { useTranslation } from 'react-i18next'
import { Layout } from '../../components/Layout.tsx'
import { Alert, LoadState, errorMessage, useLoad } from '../../components/ui.tsx'
import { api } from '../../api/client.ts'
import type { ConsentText, Overview } from './types.ts'

const CHANNELS = [
  { key: 'IN_APP', label: 'settings.channelInApp' },
  { key: 'SMS', label: 'settings.channelSms' },
  { key: 'VOICE_CALL', label: 'settings.channelCall' },
] as const

export function Settings() {
  const { t } = useTranslation()
  const data = useLoad(async () => ({
    overview: await api.get<Overview>('/api/me/overview'),
    texts: await api.get<ConsentText[]>('/api/public/consent-texts?locale=fr'),
  }))
  const [channels, setChannels] = useState<string[]>(['IN_APP'])
  const [from, setFrom] = useState('15:00')
  const [to, setTo] = useState('19:00')
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const p = data.data?.overview.preferences
    if (p) {
      setChannels(p.channels)
      setFrom(p.callWindowStart)
      setTo(p.callWindowEnd)
    }
  }, [data.data])

  const run = async (fn: () => Promise<string>) => {
    setError(null)
    setNotice(null)
    try {
      setNotice(await fn())
      await data.reload()
    } catch (e) {
      setError(errorMessage(e, t))
    }
  }

  const o = data.data?.overview
  return (
    <Layout>
      <Link to="/b" className="btn secondary">{t('app.back')}</Link>
      <h1>{t('settings.title')}</h1>
      <LoadState loading={data.loading} error={data.error} onRetry={data.reload} />
      {notice && <Alert>{notice}</Alert>}
      {error && <Alert kind="error">{error}</Alert>}
      {o && data.data && (
        <>
          <h2>{t('settings.contact')}</h2>
          <fieldset className="card">
            <legend className="visually-hidden">{t('settings.contact')}</legend>
            {CHANNELS.map((c) => (
              <label key={c.key} className="check">
                <input type="checkbox" checked={channels.includes(c.key)} disabled={c.key === 'IN_APP'}
                  onChange={(e) => setChannels(e.target.checked ? [...channels, c.key] : channels.filter((x) => x !== c.key))} />
                <span>{t(c.label)}</span>
              </label>
            ))}
            <p><strong>{t('settings.callWindow')}</strong></p>
            <div className="row">
              <div className="field"><label htmlFor="from">{t('settings.from')}</label><input id="from" type="time" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
              <div className="field"><label htmlFor="to">{t('settings.to')}</label><input id="to" type="time" value={to} onChange={(e) => setTo(e.target.value)} /></div>
            </div>
            <button type="button" className="btn" onClick={() => run(async () => {
              await api.put('/api/me/preferences', { channels, preferredLocale: 'fr', callWindowStart: from, callWindowEnd: to })
              return t('settings.saved')
            })}>{t('app.save')}</button>
          </fieldset>

          <h2>{t('settings.consents')}</h2>
          {data.data.texts.map((text) => {
            const current = o.consents[text.purpose]
            const granted = current?.granted ?? false
            return (
              <div className="card" key={text.purpose}>
                <p><strong>{t(`settings.purposes.${text.purpose}`)}</strong></p>
                <p className="small">{text.body}</p>
                <p><span className="status">{granted ? '✓ ' + t('settings.consentGranted') : '○ ' + t('settings.consentNotGranted')}</span></p>
                {text.purpose === 'RESEARCH' && <p className="small muted">{t('settings.optional')}</p>}
                <button type="button" className={granted ? 'btn secondary' : 'btn'} onClick={() => run(async () => {
                  const res = await api.post<{ effects: string[] }>('/api/me/consents', { purpose: text.purpose, granted: !granted, textVersion: text.version })
                  return res.effects.length ? t('settings.withdrawEffects', { effects: res.effects.join(', ') }) : t('settings.saved')
                })}>
                  {granted ? t('settings.withdraw') : t('settings.grant')}
                </button>
              </div>
            )
          })}

          <h2>{t('settings.deleteTitle')}</h2>
          <div className="card">
            <p>{t('settings.deleteHelp')}</p>
            <button type="button" className="btn danger" onClick={() => run(async () => {
              await api.post('/api/me/deletion-request')
              return t('settings.deleteRequested')
            })}>{t('settings.deleteButton')}</button>
          </div>
        </>
      )}
    </Layout>
  )
}
