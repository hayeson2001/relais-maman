import {classify} from '../dist/core.mjs';
import {evaluation,training} from '../dist/training.mjs';
import {writeFile} from 'node:fs/promises';
const rows=evaluation.map(([expected,text])=>({text,expected,predicted:classify(text).label,source:classify(text).source}));
const correct=rows.filter(r=>r.predicted===r.expected).length,abstentions=rows.filter(r=>r.predicted==='human').length;
const report={model:'Multinomial Naive Bayes, author-written French synthetic logistics examples',trainingExamples:Object.values(training).flat().length,testExamples:rows.length,correct,abstentions,incorrectNonAbstained:rows.filter(r=>r.predicted!=='human'&&r.predicted!==r.expected).length,overallAccuracy:correct/rows.length,coverage:(rows.length-abstentions)/rows.length,limitations:'Small synthetic test set, same authors as training data, not an independent or field evaluation. No local-language, speech, medical, usability or impact validation. No claim of calibrated confidence.',rows};
await writeFile(new URL('../docs/evaluation-synthetique.json',import.meta.url),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({trainingExamples:report.trainingExamples,testExamples:report.testExamples,correct,abstentions,incorrectNonAbstained:report.incorrectNonAbstained,overallAccuracy:report.overallAccuracy,coverage:report.coverage},null,2));
