import { createHash } from 'node:crypto'
import type { AppConfig } from '../config.ts'

/**
 * Connecteurs interchangeables (SMS, appel/serveur vocal, transcription, structures).
 *
 * État au 25/10/2026 : SEUL le simulateur local est implémenté. Aucun fournisseur
 * (opérateur télécom, agrégateur SMS, service vocal) n'est retenu : aucun adaptateur réel
 * n'a donc été écrit, pour ne pas inventer d'endpoint ni de réponse de succès. Un adaptateur
 * réel devra suivre la documentation officielle du fournisseur choisi (docs/integrations.md).
 */
export interface OutboundMessage {
  notificationId: string
  channel: 'SMS' | 'VOICE_CALL'
  to: string
  text: string
  locale: string
}

export type SendResult =
  | { ok: true; providerMessageId: string; status: 'SENT_SIMULATED' | 'SENT'; costMicroUnits?: number; costCurrency?: string }
  | { ok: false; retryable: boolean; error: string }

export interface MessagingConnector {
  readonly provider: string
  readonly simulated: boolean
  send(message: OutboundMessage): Promise<SendResult>
}

/**
 * Simulateur : n'envoie RIEN. Produit un identifiant déterministe et un statut « simulé ».
 * Comportements d'erreur reproductibles pour les tests, selon le numéro (fictif) :
 * - se terminant par 0000 : erreur définitive du fournisseur (numéro invalide) ;
 * - se terminant par 9999 : erreur temporaire (réessayée par le worker).
 */
export function createSimulator(): MessagingConnector {
  return {
    provider: 'simulator',
    simulated: true,
    async send(m) {
      if (m.to.endsWith('0000')) return { ok: false, retryable: false, error: 'SIMULATED_INVALID_NUMBER' }
      if (m.to.endsWith('9999')) return { ok: false, retryable: true, error: 'SIMULATED_PROVIDER_TIMEOUT' }
      const providerMessageId = 'sim_' + createHash('sha256').update(m.notificationId).digest('hex').slice(0, 24)
      return { ok: true, providerMessageId, status: 'SENT_SIMULATED', costMicroUnits: 0, costCurrency: 'XOF' }
    },
  }
}

export interface ConnectorStatus {
  kind: 'SMS' | 'VOICE' | 'TRANSCRIPTION' | 'FACILITY'
  requestedProvider: string
  implemented: boolean
  simulated: boolean
  /** Raison lisible par l'administrateur quand le connecteur réel n'est pas utilisable. */
  blockedReason: string | null
}

const IMPLEMENTED = new Set(['simulator'])

export function connectorStatuses(config: AppConfig): ConnectorStatus[] {
  const describe = (kind: ConnectorStatus['kind'], provider: string): ConnectorStatus => {
    if (provider === 'none') return { kind, requestedProvider: 'none', implemented: false, simulated: false, blockedReason: 'Désactivé (aucun fournisseur).' }
    const implemented = IMPLEMENTED.has(provider)
    return {
      kind,
      requestedProvider: provider,
      implemented,
      simulated: provider === 'simulator',
      blockedReason: implemented ? null : `Aucun adaptateur pour « ${provider} » : fournisseur à retenir, puis adaptateur à écrire d’après sa documentation officielle.`,
    }
  }
  return [
    describe('SMS', config.SMS_PROVIDER),
    describe('VOICE', config.VOICE_PROVIDER),
    describe('TRANSCRIPTION', config.TRANSCRIPTION_PROVIDER),
    describe('FACILITY', 'none'),
  ]
}

/** Renvoie le connecteur à utiliser, ou null : l'absence d'adaptateur bloque ce canal, pas l'application. */
export function messagingConnector(config: AppConfig, channel: 'SMS' | 'VOICE_CALL'): MessagingConnector | null {
  const provider = channel === 'SMS' ? config.SMS_PROVIDER : config.VOICE_PROVIDER
  return provider === 'simulator' ? createSimulator() : null
}
