# Image de la DÉMONSTRATION PUBLIQUE (données fictives) : API + interface + worker dans un seul
# processus. Un pilote réel exige d'abord les prérequis de docs/prerequis-pilote.md.
FROM node:22-bookworm-slim

WORKDIR /app

# Dépendances d'abord (cache), y compris celles de compilation (Prisma, tsx, Vite).
COPY package.json package-lock.json ./
COPY packages/core/package.json packages/core/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm ci --no-audit --no-fund

COPY . .
RUN npm run build

# Valeurs par défaut de la démo ; les secrets (APP_SECRET, DATABASE_URL, DEMO_ADMIN_*) sont
# fournis par l'hébergeur, jamais inscrits ici.
ENV APP_ENV=demo \
    HOST=0.0.0.0 \
    PORT=3000 \
    COOKIE_SECURE=true \
    WORKER_INLINE=true \
    DEMO_AUTO_RESET=true \
    WEB_DIST_DIR=../web/dist \
    SMS_PROVIDER=simulator \
    VOICE_PROVIDER=simulator \
    TRANSCRIPTION_PROVIDER=none

EXPOSE 3000

# Migrations versionnées non destructives, puis démarrage.
CMD ["sh", "-c", "npm run db:migrate && npm run start -w apps/api"]
