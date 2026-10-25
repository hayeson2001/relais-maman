/** Mêmes règles de normalisation que le prototype v0.1, pour des résultats comparables. */
const STOP_WORDS = new Set(
  'je tu il elle nous vous ils elles le la les un une des de du au aux à et ou mais pour mon ma mes ce cette ces se en est sont ai pas ne que qui peut plus très me moi avec dans par on'.split(
    ' ',
  ),
)

export const normalizeText = (s: string): string =>
  String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

export const tokenize = (s: string): string[] =>
  normalizeText(s)
    .replace(/[^a-z0-9 ]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 2 && !STOP_WORDS.has(t))
