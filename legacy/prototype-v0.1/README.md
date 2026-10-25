# Relais Maman — research prototype v0.1

Project owner: **ADEC Consulting**, the commercial name of **ADEC Ingénierie Culturelle SARL**, Togo. Prepared for the UNICEF Femtech funding application, 25 October 2026.

## Run and inspect

Requires Node.js 18 or later. No third-party packages or paid API are required.

```sh
npm start
# Open http://127.0.0.1:4173
npm test
npm run evaluate
```

The static application can also be hosted from `dist/` with any HTTP server. Browser speech and local caching depend on browser support and context.

## What works

- Fictional mother interface and community-worker workspace.
- Explicit demonstration consent, practical barrier reporting, human-reviewed action planning, declared human-source care confirmation, event history and computed indicators.
- Browser-local state and synthetic-data JSON export.
- Multinomial Naive Bayes baseline trained on 48 author-written synthetic French phrases, with abstention.
- French browser speech output and optional dictation; cached interface after the initial loading.

## Evidence and limitations

Eleven automated workflow tests pass. The separate author-written synthetic evaluation returns 14 correct categories and six abstentions on 20 French phrases. This is not an independent benchmark or a medical validation.

No user interviews or field usability tests have been conducted. No clinical or Mina-language validation is claimed. The intended initial setting is Lomé and its outskirts, with Mina proposed for subsequent validation.

The two roles share storage in one browser. There are no secure multi-user accounts, real facility connections, real calls or SMS, real bookings or actual care confirmations. Do not enter real patient data. Health keyword detection is incomplete and is not clinical triage. Language and telecommunications partnerships remain to be established.

## Demonstration

[Silent screen demonstration with English annotations — draft](https://drive.google.com/file/d/1Ok9Hwe0VqoSbUL3vb9gTa5ildQ1dxRar/view?usp=drivesdk). This is a 60-second montage of the working prototype using fictional cases. It is not yet the application pitch: a real-team recording must be added before submission.

[UNICEF Femtech call](https://www.unicef.org/innovation/FemTechCall).

## Licence and contents

Code, synthetic examples and included technical documentation are available under MIT; see LICENSE. This repository deliberately excludes administrative records, CVs, financial application information, browser storage and internal hosting configuration.

This is the source-code repository for the working research prototype. The application remains a draft; no field results, clinical partnership or local-language capability are claimed.
