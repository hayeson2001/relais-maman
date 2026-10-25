import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { api } from '../api/client.ts'
import { Alert, errorMessage } from './ui.tsx'

export const MAX_SECONDS = 120

/**
 * Enregistrement VOLONTAIRE d'un message vocal : écoute avant envoi, suppression, durée
 * limitée à 2 minutes. L'audio reste en mémoire (jamais sur disque) jusqu'à son envoi au
 * serveur, qui ne l'accepte qu'avec l'accord « conserver l'audio ». En cas d'échec (micro
 * refusé, navigateur incompatible, envoi impossible), retour au texte ou au rappel.
 */
export function AudioRecorder({
  consentVersion, onUploaded, onRemoved,
}: { consentVersion: string; onUploaded: (audioId: string) => void; onRemoved: () => void }) {
  const { t } = useTranslation()
  const [phase, setPhase] = useState<'idle' | 'recording' | 'recorded' | 'uploaded'>('idle')
  const [seconds, setSeconds] = useState(0)
  const [blobUrl, setBlobUrl] = useState<string | null>(null)
  const [blob, setBlob] = useState<Blob | null>(null)
  const [consent, setConsent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [uploadedId, setUploadedId] = useState<string | null>(null)
  const recorder = useRef<MediaRecorder | null>(null)
  const timer = useRef<ReturnType<typeof setInterval> | null>(null)

  const supported = typeof window !== 'undefined' && 'MediaRecorder' in window && !!navigator.mediaDevices?.getUserMedia

  useEffect(() => () => {
    if (timer.current) clearInterval(timer.current)
    if (blobUrl) URL.revokeObjectURL(blobUrl)
  }, [blobUrl])

  if (!supported) return <Alert>{t('audio.unsupported')}</Alert>

  const start = async () => {
    setError(null)
    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch {
      setError(t('audio.denied'))
      return
    }
    const chunks: Blob[] = []
    const rec = new MediaRecorder(stream)
    rec.ondataavailable = (e) => chunks.push(e.data)
    rec.onstop = () => {
      stream.getTracks().forEach((tr) => tr.stop())
      const b = new Blob(chunks, { type: rec.mimeType || 'audio/webm' })
      setBlob(b)
      setBlobUrl(URL.createObjectURL(b))
      setPhase('recorded')
    }
    recorder.current = rec
    rec.start()
    setSeconds(0)
    setPhase('recording')
    timer.current = setInterval(() => {
      setSeconds((s) => {
        if (s + 1 >= MAX_SECONDS) {
          stop()
          setError(t('audio.tooLong'))
        }
        return s + 1
      })
    }, 1000)
  }

  const stop = () => {
    if (timer.current) clearInterval(timer.current)
    if (recorder.current?.state === 'recording') recorder.current.stop()
  }

  const remove = async () => {
    if (uploadedId) {
      try {
        await api.delete(`/api/me/audio/${uploadedId}`)
      } catch {
        /* déjà supprimé ou hors connexion : on retire au moins localement */
      }
    }
    if (blobUrl) URL.revokeObjectURL(blobUrl)
    setBlob(null)
    setBlobUrl(null)
    setUploadedId(null)
    setPhase('idle')
    onRemoved()
  }

  const upload = async () => {
    if (!blob) return
    if (!consent) {
      setError(t('audio.consentRequired'))
      return
    }
    const form = new FormData()
    form.append('locale', 'fr')
    form.append('durationSeconds', String(Math.max(1, Math.min(seconds, MAX_SECONDS))))
    form.append('keepAudioConsentVersion', consentVersion)
    form.append('file', blob, 'message.webm')
    try {
      const res = await api.upload<{ id: string }>('/api/me/audio', form)
      setUploadedId(res.id)
      setPhase('uploaded')
      onUploaded(res.id)
    } catch (e) {
      setError(`${t('audio.uploadFailed')} ${errorMessage(e, t)}`)
    }
  }

  return (
    <div className="card stack">
      {error && <Alert kind="error">{error}</Alert>}
      {phase === 'idle' && (
        <button type="button" className="btn secondary block" onClick={start}>
          <span aria-hidden="true">🎙</span> {t('audio.record')}
        </button>
      )}
      {phase === 'recording' && (
        <>
          <p aria-live="polite">{t('audio.recording', { seconds })}</p>
          <button type="button" className="btn block" onClick={stop}>
            <span aria-hidden="true">⏹</span> {t('audio.stop')}
          </button>
        </>
      )}
      {(phase === 'recorded' || phase === 'uploaded') && blobUrl && (
        <>
          <p id="rm-audio-label"><strong>{t('audio.play')}</strong></p>
          {/* <audio> n'est pas « labelable » en HTML : nom accessible via aria-label. */}
          <audio controls src={blobUrl} aria-label={t('audio.play')} />
          {phase === 'recorded' && (
            <>
              <label className="check">
                <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
                <span>{t('audio.consent')}</span>
              </label>
              <button type="button" className="btn block" onClick={upload}>
                {t('app.continue')}
              </button>
            </>
          )}
          {phase === 'uploaded' && <Alert>{t('audio.attached')}</Alert>}
          <button type="button" className="btn secondary block" onClick={remove}>
            <span aria-hidden="true">🗑</span> {t('audio.delete')}
          </button>
        </>
      )}
    </div>
  )
}
