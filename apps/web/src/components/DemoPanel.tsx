import { useTranslation } from 'react-i18next'
import { api } from '../api/client.ts'
import { useLoad } from './ui.tsx'

interface DemoAccounts {
  resetHour: number | null
  accounts: Array<{ space: 'beneficiary' | 'staff'; name: string; login: string; secret: string }>
}

/**
 * Démo publique seulement (l'API répond 404 ailleurs, et rien ne s'affiche). Texte bilingue
 * français/anglais pour les évaluateurs : ce panneau ne fait pas partie du produit et n'est
 * donc pas dans les fichiers de langue.
 */
export function DemoPanel() {
  const { t } = useTranslation()
  const demo = useLoad(() => api.get<DemoAccounts>('/api/public/demo-accounts'))
  if (!demo.data) return null
  const { accounts, resetHour } = demo.data
  const hour = resetHour === null ? null : `${String(resetHour).padStart(2, '0')}:00`
  return (
    <section className="card" aria-labelledby="demo-title" lang="en" style={{ marginTop: '1.5rem' }}>
      <h2 id="demo-title">Public demo · Démonstration publique</h2>
      <p>
        All people, facilities and phone numbers are <strong>fictional</strong>. Do not enter real personal data.
        {hour && <> Data is reset every night at {hour} (Lomé time).</>}
      </p>
      <p lang="fr" className="small muted">
        Toutes les personnes, structures et numéros sont fictifs. N’entrez aucune donnée réelle.
        {hour && <> Les données sont remises à zéro chaque nuit à {hour} (heure de Lomé).</>}
      </p>
      <p className="small">
        Suggested path: sign in as Ama (“<span lang="fr">{t('home.iAmBeneficiary')}</span>”) and report a barrier, then as Esi (“<span lang="fr">{t('home.iAmStaff')}</span>”)
        in another browser or private window, then as Facility A. Afi and Facility B show that access is limited to each
        team and facility. SMS and calls are simulated.
      </p>
      <ul className="stack" style={{ listStyle: 'none', padding: 0 }}>
        {accounts.map((a) => (
          <li key={a.login} className="card">
            <strong>{a.name}</strong>
            <span className="small muted" lang="fr"> · {a.space === 'beneficiary' ? t('home.iAmBeneficiary') : t('home.iAmStaff')}</span>
            <br />
            Login: <code style={{ whiteSpace: 'nowrap' }}>{a.login}</code>
            <br />
            {a.space === 'beneficiary' ? 'PIN' : 'Password'}: <code style={{ whiteSpace: 'nowrap' }}>{a.secret}</code>
          </li>
        ))}
      </ul>
    </section>
  )
}
