#!/usr/bin/env node
/**
 * Synchronise la STRUCTURE des fichiers de langue avec le français (référence complète).
 * - Ajoute les clés manquantes avec une valeur vide (jamais de traduction automatique).
 * - Conserve les traductions déjà fournies par des personnes compétentes.
 * - `--check` : échoue si une langue n'a pas exactement les mêmes clés (utilisé en CI).
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const dir = resolve(import.meta.dirname, '../apps/web/src/i18n')
const fr = JSON.parse(readFileSync(resolve(dir, 'fr.json'), 'utf8'))
const LOCALES = ['gej']
const check = process.argv.includes('--check')

function shape(ref, existing = {}) {
  const out = {}
  for (const [k, v] of Object.entries(ref)) {
    out[k] = typeof v === 'object' ? shape(v, existing[k] ?? {}) : typeof existing[k] === 'string' ? existing[k] : ''
  }
  return out
}
const keys = (o, p = '') => Object.entries(o).flatMap(([k, v]) => (typeof v === 'object' ? keys(v, `${p}${k}.`) : [`${p}${k}`]))
const count = (o) => keys(o).length
const filled = (o) => Object.values(o).reduce((n, v) => n + (typeof v === 'object' ? filled(v) : v ? 1 : 0), 0)

let failed = false
for (const locale of LOCALES) {
  const file = resolve(dir, `${locale}.json`)
  let existing = {}
  try { existing = JSON.parse(readFileSync(file, 'utf8')) } catch { /* nouveau fichier */ }
  const synced = shape(fr, existing)
  if (check) {
    const a = keys(existing).sort().join('\n')
    const b = keys(fr).sort().join('\n')
    if (a !== b) { console.error(`${locale}.json : structure différente du français. Lancez node scripts/i18n-sync.mjs`); failed = true }
  } else {
    writeFileSync(file, JSON.stringify(synced, null, 2) + '\n')
  }
  console.log(`${locale} : ${filled(synced)}/${count(fr)} textes fournis (non validés tant que le registre des langues ne l'indique pas)`)
}
process.exit(failed ? 1 : 0)
