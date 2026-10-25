import { useEffect, useState, type ReactNode } from 'react'
import { Link, useNavigate } from '../router.tsx'
import { useTranslation } from 'react-i18next'
import { useSession } from '../session/SessionContext.tsx'
import { Alert, useOnline } from './ui.tsx'

export function Layout({ children, wide = false, nav }: { children: ReactNode; wide?: boolean; nav?: ReactNode }) {
  const { t } = useTranslation()
  const { me, logout } = useSession()
  const navigate = useNavigate()
  const online = useOnline()
  const [cameBack, setCameBack] = useState(false)

  useEffect(() => {
    const onOnline = () => {
      setCameBack(true)
      setTimeout(() => setCameBack(false), 4000)
    }
    window.addEventListener('online', onOnline)
    return () => window.removeEventListener('online', onOnline)
  }, [])

  return (
    <>
      <a className="skip-link" href="#contenu">{t('app.skip')}</a>
      <header className="app-header">
        <Link to="/" className="brand">
          <img src="/icon.svg" alt="" width={36} height={36} />
          <span>{t('app.name')}</span>
        </Link>
        {nav && <nav aria-label="Navigation principale" className="row">{nav}</nav>}
        {me && (
          <button
            type="button"
            className="btn secondary on-dark"
            onClick={async () => {
              await logout()
              navigate('/')
            }}
          >
            {t('app.logout')}
          </button>
        )}
      </header>
      <main id="contenu" className={wide ? 'wide' : ''} tabIndex={-1}>
        {me && ['local', 'demo', 'test'].includes(me.appEnv) && <p className="small muted">{t('app.demoBanner')}</p>}
        {!online && <Alert kind="offline">{t('app.offline')}</Alert>}
        {online && cameBack && <Alert>{t('app.online')}</Alert>}
        {children}
      </main>
      <footer>
        {t('app.tagline')} · <span>ADEC Consulting</span>
      </footer>
    </>
  )
}
