#!/usr/bin/env node
/** Calcule les contrastes WCAG 2.1 des couleurs de l'interface. Échoue si un usage texte < 4,5. */
const lum = (hex) => {
  const c = [0, 2, 4].map((i) => parseInt(hex.slice(1).slice(i, i + 2), 16) / 255)
  const [r, g, b] = c.map((x) => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
const ratio = (a, b) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}
// [premier plan, arrière-plan, usage, seuil]
const usages = [
  ['#243a34', '#f7f5ef', 'texte principal sur fond', 4.5],
  ['#4a5c56', '#f7f5ef', 'texte secondaire sur fond', 4.5],
  ['#174f46', '#f7f5ef', 'titres et liens verts sur fond', 4.5],
  ['#ffffff', '#174f46', 'texte des boutons', 4.5],
  ['#ffffff', '#123b35', 'texte sur vert profond', 4.5],
  ['#123b35', '#f3bc98', 'texte sur bandeau pêche', 4.5],
  ['#8a1c1c', '#fbe9e7', 'message d’erreur', 4.5],
  ['#123b35', '#e3efe9', 'message d’information', 4.5],
  ['#174f46', '#ffffff', 'bouton secondaire', 4.5],
  ['#123b35', '#f7f5ef', 'contour de focus (élément d’interface)', 3],
]
let failed = false
for (const [fg, bg, usage, min] of usages) {
  const r = ratio(fg, bg)
  const ok = r >= min
  if (!ok) failed = true
  console.log(`${ok ? 'OK ' : 'KO '} ${r.toFixed(2).padStart(5)} (min ${min})  ${usage}`)
}
console.log(`Non utilisé comme texte (échec connu) : pêche #f3bc98 sur fond #f7f5ef = ${ratio('#f3bc98', '#f7f5ef').toFixed(2)}`)
process.exit(failed ? 1 : 0)
