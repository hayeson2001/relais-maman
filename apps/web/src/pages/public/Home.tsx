import { Link, Navigate } from '../../router.tsx'
import { useTranslation } from 'react-i18next'
import { Layout } from '../../components/Layout.tsx'
import { ListenButton } from '../../components/ListenButton.tsx'
import { useLoad } from '../../components/ui.tsx'
import { api } from '../../api/client.ts'
import { useSession } from '../../session/SessionContext.tsx'
import { homePath } from '../../routes.tsx'

export function Home() {
  const { t, i18n } = useTranslation()
  const { me } = useSession()
  const languages = useLoad(() => api.get<Array<{ code: string; name: string; nativeName: string | null }>>('/api/public/languages'))
  if (me) return <Navigate to={homePath(me.role)} replace />

  const intro = `${t('home.title')}. ${t('home.intro')}`
  return (
    <Layout>
      <h1>{t('home.title')}</h1>
      <div className="card highlight">
        <p>{t('home.intro')}</p>
        <p>{t('home.what')}</p>
        <ListenButton text={intro} locale={i18n.language} />
      </div>
      <p className="muted">{t('home.notMedical')}</p>

      <div className="stack">
        <Link className="btn block" to="/connexion">{t('home.iAmBeneficiary')}</Link>
        <Link className="btn secondary block" to="/equipe">{t('home.iAmStaff')}</Link>
      </div>

      {languages.data && languages.data.length > 0 && (
        <div className="field" style={{ marginTop: '1.5rem' }}>
          <label htmlFor="lang">{t('home.language')}</label>
          <select id="lang" value={i18n.language} onChange={(e) => void i18n.changeLanguage(e.target.value)}>
            {languages.data.map((l) => (
              <option key={l.code} value={l.code}>{l.nativeName ?? l.name}</option>
            ))}
          </select>
          <p className="small muted">{t('home.languageOnlyAvailable')}</p>
        </div>
      )}
    </Layout>
  )
}
