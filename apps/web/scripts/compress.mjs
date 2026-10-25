#!/usr/bin/env node
/** Pré-compresse l'interface compilée (gzip + brotli) pour un service sans calcul à la volée. */
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { brotliCompressSync, constants, gzipSync } from 'node:zlib'

const dist = resolve(import.meta.dirname, '../dist')
const walk = (d) => readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : [join(d, f)]))
let n = 0
for (const file of walk(dist).filter((f) => /\.(js|css|html|svg|webmanifest|json)$/.test(f))) {
  const data = readFileSync(file)
  writeFileSync(`${file}.gz`, gzipSync(data, { level: 9 }))
  writeFileSync(`${file}.br`, brotliCompressSync(data, { params: { [constants.BROTLI_PARAM_QUALITY]: 11 } }))
  n++
}
console.log(`${n} fichiers pré-compressés (gzip, brotli).`)
