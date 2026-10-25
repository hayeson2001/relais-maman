import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

/**
 * Lecture à voix haute À LA DEMANDE, avec arrêt, pause, reprise ; le texte reste affiché.
 * Proposée UNIQUEMENT si le navigateur dispose d'une voix dans la langue du texte. Aucune
 * voix « mina » n'est supposée : sans contenu ou moteur compatible, le bouton n'apparaît
 * pas (pas de fausse lecture vocale fonctionnelle).
 */
function hasVoice(locale: string) {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return false
  return window.speechSynthesis.getVoices().some((v) => v.lang.toLowerCase().startsWith(locale))
}

export function ListenButton({ text, locale = 'fr' }: { text: string; locale?: string }) {
  const { t } = useTranslation()
  const [available, setAvailable] = useState(() => hasVoice(locale))
  const [state, setState] = useState<'idle' | 'speaking' | 'paused'>('idle')

  useEffect(() => {
    if (!('speechSynthesis' in window)) return
    const update = () => setAvailable(hasVoice(locale))
    window.speechSynthesis.addEventListener('voiceschanged', update)
    return () => {
      window.speechSynthesis.removeEventListener('voiceschanged', update)
      window.speechSynthesis.cancel()
    }
  }, [locale])

  if (!available) return null

  const speak = () => {
    const u = new SpeechSynthesisUtterance(text)
    u.lang = locale === 'fr' ? 'fr-FR' : locale
    u.onend = () => setState('idle')
    u.onerror = () => setState('idle')
    window.speechSynthesis.cancel()
    window.speechSynthesis.speak(u)
    setState('speaking')
  }

  return (
    <div className="row" role="group" aria-label={t('app.listen')}>
      {state === 'idle' && (
        <button type="button" className="btn secondary" onClick={speak}>
          <span aria-hidden="true">🔊</span> {t('app.listen')}
        </button>
      )}
      {state === 'speaking' && (
        <button type="button" className="btn secondary" onClick={() => { window.speechSynthesis.pause(); setState('paused') }}>
          <span aria-hidden="true">⏸</span> {t('app.pauseListening')}
        </button>
      )}
      {state === 'paused' && (
        <button type="button" className="btn secondary" onClick={() => { window.speechSynthesis.resume(); setState('speaking') }}>
          <span aria-hidden="true">▶</span> {t('app.resumeListening')}
        </button>
      )}
      {state !== 'idle' && (
        <button type="button" className="btn secondary" onClick={() => { window.speechSynthesis.cancel(); setState('idle') }}>
          <span aria-hidden="true">⏹</span> {t('app.stopListening')}
        </button>
      )}
    </div>
  )
}
