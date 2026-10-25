import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from '../../router.tsx'
import { useTranslation } from 'react-i18next'
import { Layout } from '../../components/Layout.tsx'
import { Alert, errorMessage } from '../../components/ui.tsx'
import { api } from '../../api/client.ts'
import { useSession } from '../../session/SessionContext.tsx'
import { homePath } from '../../routes.tsx'

/**
 * Normalisation à l'ENVOI, pas à chaque frappe : réécrire la saisie lettre par lettre
 * abîmait l'identifiant tapé tel qu'imprimé (« R » devenait « RM-R »). On accepte
 * « RM-AMAK-4M2X », « rmamak4m2x » ou « AMAK-4M2X » (préfixe facultatif).
 */
export function normalizeIdentifier(v: string) {
  let raw = v.toUpperCase().replace(/[^A-Z0-9]/g, '')
  if (raw.length === 10 && raw.startsWith('RM')) raw = raw.slice(2)
  return raw.length === 8 ? `RM-${raw.slice(0, 4)}-${raw.slice(4)}` : null
}
export function normalizeActivationCode(v: string) {
  const raw = v.toUpperCase().replace(/[^A-Z0-9]/g, '')
  return raw.length === 8 ? `${raw.slice(0, 4)}-${raw.slice(4)}` : null
}

export function BeneficiaryLogin() {
  const { t } = useTranslation()
  const { refresh, expired } = useSession()
  const navigate = useNavigate()
  const [identifier, setIdentifier] = useState('')
  const [pin, setPin] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await api.post('/api/auth/beneficiary/login', { identifier: normalizeIdentifier(identifier), pin })
      const me = await refresh()
      if (me) navigate(homePath(me.role))
    } catch (err) {
      setError(errorMessage(err, t))
    } finally {
      setBusy(false)
      setPin('')
    }
  }

  return (
    <Layout>
      <h1>{t('login.beneficiaryTitle')}</h1>
      {expired && <Alert>{t('app.sessionExpired')}</Alert>}
      {error && <Alert kind="error">{error}</Alert>}
      <form onSubmit={submit} noValidate>
        <div className="field">
          <label htmlFor="identifier">{t('login.identifier')}</label>
          <input id="identifier" autoComplete="username" inputMode="text" autoCapitalize="characters" value={identifier}
            aria-describedby="identifier-hint" maxLength={14} onChange={(e) => setIdentifier(e.target.value.toUpperCase())} />
          <p id="identifier-hint" className="small muted">{t('login.identifierHint')}</p>
        </div>
        <div className="field">
          <label htmlFor="pin">{t('login.pin')}</label>
          <input id="pin" type="password" inputMode="numeric" autoComplete="current-password" maxLength={6} value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))} />
        </div>
        <button className="btn block" type="submit" disabled={busy || pin.length !== 6 || !normalizeIdentifier(identifier)}>
          {t('login.submit')}
        </button>
      </form>
      <div className="stack" style={{ marginTop: '1.25rem' }}>
        <Link className="btn secondary block" to="/activation">{t('login.firstTime')}</Link>
        <p className="small muted">{t('login.forgot')}</p>
        <p className="small muted">{t('login.sharedPhone')}</p>
      </div>
    </Layout>
  )
}

export function Activate() {
  const { t } = useTranslation()
  const { refresh } = useSession()
  const navigate = useNavigate()
  const [identifier, setIdentifier] = useState('')
  const [code, setCode] = useState('')
  const [pin, setPin] = useState('')
  const [pin2, setPin2] = useState('')
  const [error, setError] = useState<string | null>(null)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (pin !== pin2) return setError(t('login.pinMismatch'))
    setError(null)
    try {
      await api.post('/api/auth/beneficiary/activate', {
        identifier: normalizeIdentifier(identifier), activationCode: normalizeActivationCode(code), newPin: pin,
      })
      const me = await refresh()
      if (me) navigate(homePath(me.role))
    } catch (err) {
      setError(errorMessage(err, t))
    }
  }

  const digits = (v: string) => v.replace(/\D/g, '').slice(0, 6)
  return (
    <Layout>
      <h1>{t('login.activateTitle')}</h1>
      {error && <Alert kind="error">{error}</Alert>}
      <form onSubmit={submit} noValidate>
        <div className="field">
          <label htmlFor="a-id">{t('login.identifier')}</label>
          <input id="a-id" autoCapitalize="characters" maxLength={14} value={identifier} onChange={(e) => setIdentifier(e.target.value.toUpperCase())} />
        </div>
        <div className="field">
          <label htmlFor="a-code">{t('login.activationCode')}</label>
          <input id="a-code" autoCapitalize="characters" autoComplete="one-time-code" value={code}
            maxLength={10} onChange={(e) => setCode(e.target.value.toUpperCase())} />
        </div>
        <div className="field">
          <label htmlFor="a-pin">{t('login.newPin')}</label>
          <input id="a-pin" type="password" inputMode="numeric" autoComplete="new-password" value={pin} aria-describedby="a-pin-hint" onChange={(e) => setPin(digits(e.target.value))} />
          <p id="a-pin-hint" className="small muted">{t('login.newPinHint')}</p>
        </div>
        <div className="field">
          <label htmlFor="a-pin2">{t('login.confirmPin')}</label>
          <input id="a-pin2" type="password" inputMode="numeric" autoComplete="new-password" value={pin2} onChange={(e) => setPin2(digits(e.target.value))} />
        </div>
        <button className="btn block" type="submit" disabled={pin.length !== 6 || pin2.length !== 6 || !normalizeActivationCode(code) || !normalizeIdentifier(identifier)}>
          {t('login.activate')}
        </button>
      </form>
    </Layout>
  )
}

export function StaffLogin() {
  const { t } = useTranslation()
  const { refresh } = useSession()
  const navigate = useNavigate()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    try {
      await api.post('/api/auth/staff/login', { username, password })
      const me = await refresh()
      if (me) navigate(homePath(me.role))
    } catch (err) {
      setError(errorMessage(err, t))
    } finally {
      setPassword('')
    }
  }

  return (
    <Layout>
      <h1>{t('login.staffTitle')}</h1>
      {error && <Alert kind="error">{error}</Alert>}
      <form onSubmit={submit}>
        <div className="field">
          <label htmlFor="u">{t('login.username')}</label>
          <input id="u" autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="p">{t('login.password')}</label>
          <input id="p" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        <button className="btn block" type="submit">{t('login.submit')}</button>
      </form>
    </Layout>
  )
}
