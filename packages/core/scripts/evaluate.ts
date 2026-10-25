import { writeFileSync, mkdirSync } from 'node:fs'
import { defaultClassifier, evaluate, EVALUATION_FR } from '../src/index.js'

const report = evaluate(defaultClassifier, EVALUATION_FR, 'fr')
mkdirSync(new URL('../../../docs/model/', import.meta.url), { recursive: true })
writeFileSync(new URL('../../../docs/model/evaluation-fr.json', import.meta.url), JSON.stringify(report, null, 2) + '\n')
console.log(JSON.stringify({ ...report, confusion: report.confusion.length }, null, 2))
