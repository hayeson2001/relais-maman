# Model card — French logistics baseline v0.1

## Purpose

Suggest the type of practical barrier expressed in a fictional maternal/child-care coordination demonstration. Categories: transport, cost, availability, understanding. This is a multinomial Naive Bayes model implemented in JavaScript, fitted in browser memory from the included author-written examples. It is not a large language model or a speech recognizer.

## Data and evaluation

48 synthetic French training phrases, 12 per category. Separate 20 synthetic French evaluation phrases. No patient records, audio, contact details or external datasets. The same authoring process produced both sets. Code, data and documentation: MIT.

Observed: 14 correct categories out of 20 examples (70% overall); 6 abstentions (30%); no incorrect output among the 14 non-abstained examples in this small set. These figures are not independent, population-representative or clinically meaningful. Evaluation phrases must not be added to training while preserving this report as an unseen evaluation.

## Decision mechanism

Accent folding, French word tokenization and limited stop-word removal. Laplace-smoothed multinomial counts. Fewer than two known tokens, a top score below 0.62, or a margin below 0.18 produces abstention. Scores are not calibrated probabilities. Explicit user choices bypass the classifier and are separately marked as choices; the ML laboratory accepts free text without a category selection.

A separate broad keyword rule catches some health/safety words and blocks logistics planning. It is an incomplete routing guard, not a detector that can establish or rule out urgency. Its limitations include euphemisms, spelling mistakes, negation, unlisted symptoms, local languages and code-switching. A negative result never means medically safe. All categories require human review.

## Unsupported uses

Clinical triage, diagnoses, treatment, pregnancy assessment, predictive medical risk, automatic eligibility, emergency dispatch, real patient records, local-language comprehension, autonomous worker prioritization or unsupervised field deployment. No voice recordings are retained by this software. Optional dictation uses the browser’s provider and may be processed remotely.

## Next evidence needed

Clinician-reviewed boundaries, participatory language selection, separately consented real-world utterances, local-language speech baselines, a genuinely independent test set, dialect/code-switching testing, subgroup analysis where justified, reliable human fallback, usability with low-literacy users and a supervised assessment of care completion. The frontier-technology contribution still needs to be developed and evidenced.
