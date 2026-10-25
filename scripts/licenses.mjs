#!/usr/bin/env node
/** Notice des licences des dépendances installées (production et développement). */
import { readFileSync, readdirSync, existsSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
const root = new URL('..', import.meta.url).pathname
const seen = new Map()
function scan(dir) {
  if (!existsSync(dir)) return
  for (const name of readdirSync(dir)) {
    if (name.startsWith('.')) continue
    if (name.startsWith('@')) { scan(join(dir, name)); continue }
    const pkg = join(dir, name, 'package.json')
    if (!existsSync(pkg)) continue
    try {
      const p = JSON.parse(readFileSync(pkg, 'utf8'))
      if (!p.name || p.private) continue
      const lic = typeof p.license === 'string' ? p.license : p.license?.type ?? (Array.isArray(p.licenses) ? p.licenses.map((l) => l.type).join(' OR ') : 'NON DÉCLARÉE')
      seen.set(`${p.name}@${p.version}`, lic)
    } catch {}
    scan(join(dir, name, 'node_modules'))
  }
}
scan(join(root, 'node_modules'))
const byLicense = {}
for (const [pkg, lic] of seen) (byLicense[lic] ??= []).push(pkg)
const lines = ['# Notice des licences des dépendances', '', `Générée par scripts/licenses.mjs le ${new Date().toISOString().slice(0, 10)} à partir de node_modules (${seen.size} paquets, dépendances de développement comprises).`, '', 'Le code propre à Relais Maman reste sous licence MIT (fichier LICENSE).', '', '## Synthèse par licence', '']
for (const [lic, pkgs] of Object.entries(byLicense).sort((a, b) => b[1].length - a[1].length)) lines.push(`- **${lic}** : ${pkgs.length}`)
const watch = Object.keys(byLicense).filter((l) => !/^(MIT|ISC|Apache-2\.0|BSD-2-Clause|BSD-3-Clause|0BSD|BlueOak-1\.0\.0|CC0-1\.0|Python-2\.0|\(MIT OR CC0-1\.0\)|MIT-0|Unlicense)$/i.test(l))
lines.push('', '## Licences à examiner', '', watch.length ? watch.map((l) => `- ${l} : ${byLicense[l].join(', ')}`).join('\n') : 'Aucune.', '', '## Liste complète', '')
for (const [pkg, lic] of [...seen].sort()) lines.push(`- ${pkg} — ${lic}`)
writeFileSync(join(root, 'THIRD_PARTY_LICENSES.md'), lines.join('\n') + '\n')
console.log(`${seen.size} paquets ; licences à examiner : ${watch.join(', ') || 'aucune'}`)
