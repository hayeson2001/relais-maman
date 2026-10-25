export interface Overview {
  displayName: string
  identifier: string
  preferredLocale: string
  children: Array<{ id: string; firstName: string; ageMonths: number }>
  preferences: { channels: string[]; callWindowStart: string; callWindowEnd: string } | null
  consents: Partial<Record<'TRANSMIT_REQUEST' | 'RECEIVE_CALLBACK' | 'KEEP_AUDIO' | 'RESEARCH', { granted: boolean; textVersion: string }>>
  appointments: Array<{ id: string; title: string; startsAt: string; facility: string; forChild: string | null }>
  requests: Array<{
    id: string
    state: string
    version: number
    category: string | null
    createdAt: string
    viewedByAgent: boolean
    slots: Array<{ id: string; startsAt: string; status: string; facility: string; note: string | null }>
    lastMessage: { body: string; at: string } | null
    declaredCareDate: string | null
    verification: { careDate: string; source: string } | null
  }>
}

export interface ConsentText {
  purpose: 'TRANSMIT_REQUEST' | 'RECEIVE_CALLBACK' | 'KEEP_AUDIO' | 'RESEARCH'
  version: string
  body: string
  reviewed: boolean
}
