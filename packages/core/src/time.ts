/**
 * Les instants sont toujours stockés en UTC côté serveur. Les dates civiles (« le soin a eu
 * lieu le… ») s'évaluent dans le fuseau du pays configuré (Togo : Africa/Lome).
 */
export function civilDate(instant: Date, timeZone: string): string {
  return instant.toLocaleDateString('en-CA', { timeZone }) // AAAA-MM-JJ
}

export function isValidCivilDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false
  const d = new Date(`${s}T00:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s
}

/** Date compréhensible pour l'utilisatrice, ex. « mercredi 28 octobre à 15 h 30 ». */
export function formatForUser(instant: Date, timeZone: string, locale = 'fr-FR'): string {
  const date = instant.toLocaleDateString(locale, { timeZone, weekday: 'long', day: 'numeric', month: 'long' })
  const time = instant.toLocaleTimeString(locale, { timeZone, hour: '2-digit', minute: '2-digit' }).replace(':', ' h ')
  return `${date} à ${time}`
}

/** Montant en francs CFA (XOF), sans décimales. */
export function formatXof(amount: number, locale = 'fr-FR'): string {
  return new Intl.NumberFormat(locale, { style: 'currency', currency: 'XOF', maximumFractionDigits: 0 }).format(amount)
}
