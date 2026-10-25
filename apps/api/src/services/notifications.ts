import type { ContactChannel, Prisma } from '../generated/prisma/client.ts'

type Tx = Prisma.TransactionClient

/**
 * Modèles de notification NEUTRES : rien sur la santé, la grossesse ou l'enfant, car le
 * téléphone peut être partagé. Le détail n'est visible qu'après connexion dans l'application.
 */
export const NOTIFICATION_TEMPLATES = {
  NEW_MESSAGE: { fr: 'Relais Maman : vous avez un nouveau message. Ouvrez l’application pour le lire.' },
  SLOT_PROPOSED: { fr: 'Relais Maman : une réponse vous attend. Ouvrez l’application.' },
  REQUEST_UPDATED: { fr: 'Relais Maman : votre demande a avancé. Ouvrez l’application.' },
  AGENT_NEW_REQUEST: { fr: 'Relais Maman : une nouvelle demande est arrivée dans votre file.' },
} as const
export type TemplateKey = keyof typeof NOTIFICATION_TEMPLATES

/**
 * Écrit les notifications d'une bénéficiaire dans l'outbox, dans la transaction de
 * l'événement métier. Respecte ses canaux préférés et ses accords : sans accord de rappel,
 * aucun appel vocal n'est mis en file. Le canal IN_APP est toujours écrit (visible à la
 * connexion), les canaux externes passent par le worker et le connecteur configuré.
 */
export async function notifyBeneficiary(tx: Tx, beneficiaryId: string, templateKey: TemplateKey, eventKey: string) {
  const beneficiary = await tx.beneficiary.findUniqueOrThrow({
    where: { id: beneficiaryId },
    select: { accountId: true, preferredLocale: true, preferences: true, contact: { select: { phoneE164: true } } },
  })
  const callbackConsent = await latestConsent(tx, beneficiaryId, 'RECEIVE_CALLBACK')
  const channels = new Set<ContactChannel>(beneficiary.preferences?.channels ?? ['IN_APP'])
  channels.add('IN_APP')
  if (!beneficiary.contact?.phoneE164) {
    channels.delete('SMS')
    channels.delete('VOICE_CALL')
  }
  if (!callbackConsent) channels.delete('VOICE_CALL')

  for (const channel of channels) {
    await tx.notification.create({
      data: {
        idempotencyKey: `${eventKey}:${channel}`,
        channel,
        recipientId: beneficiary.accountId,
        templateKey,
        locale: beneficiary.preferredLocale in NOTIFICATION_TEMPLATES[templateKey] ? beneficiary.preferredLocale : 'fr',
        status: channel === 'IN_APP' ? 'SENT' : 'PENDING',
        sentAt: channel === 'IN_APP' ? new Date() : null,
      },
    })
  }
}

export async function notifyAccount(tx: Tx, accountId: string, templateKey: TemplateKey, eventKey: string) {
  await tx.notification.create({
    data: { idempotencyKey: `${eventKey}:IN_APP`, channel: 'IN_APP', recipientId: accountId, templateKey, locale: 'fr', status: 'SENT', sentAt: new Date() },
  })
}

/** Dernière décision pour une finalité : l'historique n'est jamais réécrit, on lit la plus récente. */
export async function latestConsent(
  tx: Tx | Prisma.TransactionClient,
  beneficiaryId: string,
  purpose: 'TRANSMIT_REQUEST' | 'RECEIVE_CALLBACK' | 'KEEP_AUDIO' | 'RESEARCH',
): Promise<boolean> {
  const last = await tx.consent.findFirst({
    where: { beneficiaryId, purpose },
    orderBy: { createdAt: 'desc' },
    select: { granted: true },
  })
  return last?.granted ?? false
}
