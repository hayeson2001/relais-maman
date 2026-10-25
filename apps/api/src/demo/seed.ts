import type { Db } from '../db.ts'
import { encrypt, hashSecret } from '../auth/secrets.ts'

/**
 * Données de DÉMONSTRATION, entièrement fictives (personnes, structures, zones, numéros).
 * Les identifiants ci-dessous sont publics par nature : ne jamais les utiliser hors local/démo.
 * Les dates sont relatives à `now` pour rester cohérentes quel que soit le jour.
 */
export const DEMO = {
  admin: { loginId: 'admin.demo', password: 'demo-admin-2026', totpSecret: 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP' },
  agentEst: { loginId: 'agent.esi', password: 'demo-agent-2026' },
  agentEst2: { loginId: 'agent.kodjo', password: 'demo-agent-2026' },
  agentOuest: { loginId: 'agent.ouest', password: 'demo-agent-2026' },
  referentA: { loginId: 'ref.centre-a', password: 'demo-ref-2026' },
  referentB: { loginId: 'ref.centre-b', password: 'demo-ref-2026' },
  ama: { identifier: 'RM-AMAK-4M2X', pin: '482915' },
  abiba: { identifier: 'RM-ABBT-7P3Q', pin: '739264' },
  akou: { identifier: 'RM-AKUD-9R4W', pin: '615083' },
  yawa: { identifier: 'RM-YAWA-2K8N', activationCode: 'DEMO-YAWA' },
} as const

export const CONSENT_VERSION = 'fr-2026-10-v1'

const CONSENT_TEXTS = {
  TRANSMIT_REQUEST:
    'J’accepte que ma demande soit transmise à l’équipe Relais Maman qui me suit, pour qu’une personne m’aide à organiser mon rendez-vous. Je peux retirer cet accord à tout moment.',
  RECEIVE_CALLBACK:
    'J’accepte d’être rappelée par l’équipe Relais Maman au numéro donné, aux heures que j’ai choisies.',
  KEEP_AUDIO:
    'J’accepte que mon message vocal soit conservé et écouté par l’équipe qui me suit, le temps de traiter ma demande. Je peux le supprimer.',
  RESEARCH:
    'J’accepte, si je le souhaite, que mes réponses anonymisées servent à améliorer le service. Si je refuse, je garde accès à tout le service.',
} as const

export async function seedDemo(db: Db, now = new Date()) {
  const day = 86_400_000
  // Togo : Africa/Lome = UTC+0 toute l'année, donc heure locale = heure UTC.
  const at = (daysFromNow: number, hh: number, mm: number) => {
    const d = new Date(now.getTime() + daysFromNow * day)
    d.setUTCHours(hh, mm, 0, 0)
    return d
  }

  await db.country.create({ data: { code: 'TG', name: 'Togo', timeZone: 'Africa/Lome', currency: 'XOF' } })
  const zoneEst = await db.zone.create({ data: { name: 'Lomé Est · zone fictive', countryCode: 'TG' } })
  const zoneOuest = await db.zone.create({ data: { name: 'Lomé Ouest · zone fictive', countryCode: 'TG' } })
  const org = await db.organization.create({ data: { name: 'ADEC Consulting · démonstration' } })
  const teamEst = await db.team.create({ data: { name: 'Équipe Est', organizationId: org.id, zoneId: zoneEst.id } })
  const teamOuest = await db.team.create({ data: { name: 'Équipe Ouest', organizationId: org.id, zoneId: zoneOuest.id } })
  const centreA = await db.healthFacility.create({ data: { name: 'Centre partenaire A · fictif', zoneId: zoneEst.id } })
  const centreB = await db.healthFacility.create({ data: { name: 'Centre partenaire B · fictif', zoneId: zoneEst.id } })
  const centreC = await db.healthFacility.create({ data: { name: 'Centre partenaire C · fictif', zoneId: zoneOuest.id } })

  await db.language.createMany({
    data: [
      { code: 'fr', name: 'Français', nativeName: 'Français', uiAvailable: true, uiValidation: 'IN_PROGRESS' },
      // Mina (gen, ISO 639-3 « gej ») : non disponible tant que des locutrices n'ont pas validé.
      { code: 'gej', name: 'Mina (gen)', nativeName: null, uiAvailable: false, uiValidation: 'NOT_STARTED' },
    ],
  })

  for (const [purpose, body] of Object.entries(CONSENT_TEXTS)) {
    await db.consentText.create({
      data: { purpose: purpose as keyof typeof CONSENT_TEXTS, version: CONSENT_VERSION, locale: 'fr', body, reviewed: false },
    })
  }

  // Registre audio : textes français rédigés, AUCUN enregistrement produit ni validé ;
  // mina vide. Les manques restent visibles dans l'espace administrateur.
  const audioKeys = {
    welcome: 'Bienvenue sur Relais Maman. Nous vous aidons à aller à vos rendez-vous de soin.',
    how_it_works: 'Dites-nous ce qui vous empêche d’aller au rendez-vous. Une personne de l’équipe vous répond.',
    request_sent: 'Votre demande est bien arrivée. Une personne de l’équipe va la lire.',
  }
  for (const [messageKey, transcript] of Object.entries(audioKeys)) {
    await db.audioContent.create({
      data: { messageKey, locale: 'fr', transcript, provenance: 'Texte rédigé par l’équipe projet ; enregistrement à produire', validation: 'MISSING' },
    })
    await db.audioContent.create({
      data: { messageKey, locale: 'gej', transcript: '(à fournir et valider par des locutrices compétentes)', provenance: 'À définir', validation: 'MISSING' },
    })
  }

  for (const kind of ['SMS', 'VOICE', 'TRANSCRIPTION', 'FACILITY'] as const) {
    await db.connectorSetting.create({ data: { kind, provider: kind === 'TRANSCRIPTION' || kind === 'FACILITY' ? 'none' : 'simulator' } })
  }

  const staff = async (loginId: string, password: string, data: Record<string, unknown>) =>
    db.account.create({ data: { loginId, secretHash: await hashSecret(password), status: 'ACTIVE', ...data } as never })

  const appSecret = process.env.APP_SECRET ?? ''
  const admin = await staff(DEMO.admin.loginId, DEMO.admin.password, {
    role: 'ADMIN', displayName: 'Administratrice démo',
    totpEnabled: true, totpSecretEnc: encrypt(appSecret, DEMO.admin.totpSecret),
  })
  const agentEst = await staff(DEMO.agentEst.loginId, DEMO.agentEst.password, { role: 'AGENT', displayName: 'Esi (agente, équipe Est)', teamId: teamEst.id, spokenLanguages: ['fr', 'gej'] })
  await staff(DEMO.agentEst2.loginId, DEMO.agentEst2.password, { role: 'AGENT', displayName: 'Kodjo (agent, équipe Est)', teamId: teamEst.id, spokenLanguages: ['fr'] })
  const agentOuest = await staff(DEMO.agentOuest.loginId, DEMO.agentOuest.password, { role: 'AGENT', displayName: 'Afi (agente, équipe Ouest)', teamId: teamOuest.id, spokenLanguages: ['fr'] })
  await staff(DEMO.referentA.loginId, DEMO.referentA.password, { role: 'FACILITY_REFERENT', displayName: 'Référente centre A', facilityId: centreA.id, canConfirmCare: true })
  await staff(DEMO.referentB.loginId, DEMO.referentB.password, { role: 'FACILITY_REFERENT', displayName: 'Référent centre B (non habilité)', facilityId: centreB.id, canConfirmCare: false })

  const woman = async (
    loginId: string, pin: string | null, displayName: string, teamId: string, zoneId: string, activityLabel: string,
    phoneE164: string, children: Array<{ firstName: string; birthYearMonth: string }>, createdById: string,
  ) => {
    const account = await db.account.create({
      data: { role: 'BENEFICIARY', loginId, displayName, status: pin ? 'ACTIVE' : 'PENDING_ACTIVATION', secretHash: pin ? await hashSecret(pin) : null },
    })
    const b = await db.beneficiary.create({
      data: {
        accountId: account.id, teamId, zoneId, activityLabel, createdById,
        contact: { create: { phoneE164, phoneIsShared: true } },
        preferences: { create: { channels: ['IN_APP', 'SMS'], callWindowStart: '15:00', callWindowEnd: '19:00' } },
        children: { create: children },
      },
      include: { children: true },
    })
    return { account, beneficiary: b }
  }

  const months = (n: number) => {
    const d = new Date(now.getTime())
    d.setUTCMonth(d.getUTCMonth() - n)
    return d.toISOString().slice(0, 7)
  }
  // Numéros fictifs sous l'indicatif +999, non attribué à un pays par l'UIT : aucun abonné
  // réel ne peut être visé (une plage +228 réelle aurait pu l'être). Le simulateur n'envoie rien.
  const ama = await woman(DEMO.ama.identifier, DEMO.ama.pin, 'Ama K.', teamEst.id, zoneEst.id, 'Vendeuse au marché', '+99900000101', [{ firstName: 'Koffi', birthYearMonth: months(4) }], agentEst.id)
  const abiba = await woman(DEMO.abiba.identifier, DEMO.abiba.pin, 'Abiba T.', teamEst.id, zoneEst.id, 'Agricultrice', '+99900000102', [], agentEst.id)
  const akou = await woman(DEMO.akou.identifier, DEMO.akou.pin, 'Akou D.', teamOuest.id, zoneOuest.id, 'Couturière', '+99900000103', [{ firstName: 'Adjo', birthYearMonth: months(8) }], agentOuest.id)
  const yawa = await woman(DEMO.yawa.identifier, null, 'Yawa (activation en attente)', teamEst.id, zoneEst.id, 'Commerçante', '+99900000104', [], agentEst.id)
  await db.activationCode.create({
    data: { accountId: yawa.account.id, codeHash: await hashSecret(DEMO.yawa.activationCode), purpose: 'FIRST_ACTIVATION', issuedById: agentEst.id, expiresAt: new Date(now.getTime() + 3 * day) },
  })

  for (const w of [ama, abiba, akou]) {
    await db.consent.create({ data: { beneficiaryId: w.beneficiary.id, purpose: 'RECEIVE_CALLBACK', granted: true, textVersion: CONSENT_VERSION, recordedById: agentEst.id, assisted: true } })
  }

  // Rendez-vous saisis par une agente d'après l'information (fictive) des centres.
  const amaAppt = await db.appointment.create({ data: { beneficiaryId: ama.beneficiary.id, facilityId: centreA.id, title: 'Votre suivi après la naissance', startsAt: at(3, 8, 30), createdById: agentEst.id } })
  await db.appointment.create({ data: { beneficiaryId: ama.beneficiary.id, childId: ama.beneficiary.children[0]!.id, facilityId: centreA.id, title: 'Le rendez-vous de Koffi', startsAt: at(4, 9, 0), createdById: agentEst.id } })
  const abibaAppt = await db.appointment.create({ data: { beneficiaryId: abiba.beneficiary.id, facilityId: centreB.id, title: 'Consultation de suivi de grossesse', startsAt: at(3, 10, 0), createdById: agentEst.id } })
  const akouAppt = await db.appointment.create({ data: { beneficiaryId: akou.beneficiary.id, childId: akou.beneficiary.children[0]!.id, facilityId: centreC.id, title: 'Visite de suivi d’Adjo', startsAt: at(4, 8, 0), createdById: agentOuest.id } })

  // Demande d'Abiba (déplacement) : reçue, pas encore consultée.
  const abibaReq = await db.request.create({
    data: {
      idempotencyKey: crypto.randomUUID(), beneficiaryId: abiba.beneficiary.id, teamId: teamEst.id, appointmentId: abibaAppt.id,
      category: 'TRANSPORT', categorySource: 'BENEFICIARY_CHOICE', text: "Je n'ai pas de transport depuis mon village.", locale: 'fr',
      createdAt: new Date(now.getTime() - 2 * 3_600_000),
    },
  })
  await db.consent.create({ data: { beneficiaryId: abiba.beneficiary.id, purpose: 'TRANSMIT_REQUEST', granted: true, textVersion: CONSENT_VERSION, recordedById: abiba.account.id } })
  await db.requestEvent.create({ data: { requestId: abibaReq.id, type: 'REQUEST_RECEIVED', actorId: abiba.account.id, actorRole: 'BENEFICIARY', toState: 'RECEIVED', createdAt: abibaReq.createdAt } })

  // Demande d'Akou (frais), équipe Ouest : action convenue, frais « à vérifier ».
  const akouReq = await db.request.create({
    data: {
      idempotencyKey: crypto.randomUUID(), beneficiaryId: akou.beneficiary.id, teamId: teamOuest.id, appointmentId: akouAppt.id,
      assignedAgentId: agentOuest.id, state: 'ACTION_AGREED', version: 3, category: 'COST', categorySource: 'AGENT_DECISION',
      text: 'Je voudrais connaître les frais de la consultation.', locale: 'fr',
      createdAt: new Date(now.getTime() - day), firstViewedAt: new Date(now.getTime() - day + 1_800_000),
      firstHumanResponseAt: new Date(now.getTime() - day + 3_600_000), actionAgreedAt: new Date(now.getTime() - day + 3_600_000),
    },
  })
  await db.consent.create({ data: { beneficiaryId: akou.beneficiary.id, purpose: 'TRANSMIT_REQUEST', granted: true, textVersion: CONSENT_VERSION, recordedById: akou.account.id } })
  await db.action.create({ data: { requestId: akouReq.id, agentId: agentOuest.id, description: 'Vérifier les frais avec le centre C et les expliquer à Akou par téléphone.', costStatus: 'TO_VERIFY' } })
  for (const [type, toState, offset] of [['REQUEST_RECEIVED', 'RECEIVED', 0], ['START_REVIEW', 'UNDER_REVIEW', 1_800_000], ['AGREE_ACTION', 'ACTION_AGREED', 3_600_000]] as const) {
    await db.requestEvent.create({ data: { requestId: akouReq.id, type, actorId: agentOuest.id, actorRole: type === 'REQUEST_RECEIVED' ? 'BENEFICIARY' : 'AGENT', toState, createdAt: new Date(akouReq.createdAt.getTime() + offset) } })
  }

  return { admin, agentEst, amaAppointmentId: amaAppt.id, centreA, centreB, centreC, teamEst, teamOuest }
}
