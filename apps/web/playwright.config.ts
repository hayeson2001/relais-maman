import { defineConfig, devices } from '@playwright/test'

const PORT = 3100
const DB = process.env.TEST_DATABASE_URL ?? 'postgresql://relais@127.0.0.1:54329/relais_maman_test'

/**
 * Parcours navigateur sur l'interface COMPILÉE servie par l'API (même origine, cookies
 * stricts, CSP réelle), comme en production. Base de test réinitialisée avec les données
 * fictives avant l'exécution (e2e/global-setup.ts).
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [['list'], ['html', { open: 'never', outputFolder: '../../artifacts/playwright-report' }]],
  globalSetup: './e2e/global-setup.ts',
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    locale: 'fr-FR',
    timezoneId: 'Africa/Lome',
    trace: 'retain-on-failure',
  },
  projects: [
    // Priorité au petit écran Android (section 7).
    { name: 'android-petit-ecran', use: { ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 } } },
  ],
  webServer: {
    command: `npm run build && node --import tsx ../api/src/server.ts`,
    url: `http://127.0.0.1:${PORT}/api/health`,
    reuseExistingServer: false,
    timeout: 180_000,
    env: {
      APP_ENV: 'test',
      PORT: String(PORT),
      DATABASE_URL: DB,
      APP_SECRET: process.env.APP_SECRET ?? 'e2e-app-secret-0123456789abcdef0123456789abcdef',
      WEB_DIST_DIR: 'dist',
      STORAGE_LOCAL_DIR: '../../.local/e2e-audio',
      SMS_PROVIDER: 'simulator',
      VOICE_PROVIDER: 'simulator',
    },
  },
})
