import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from './router.tsx'
import { registerSW } from 'virtual:pwa-register'
import './i18n/index.ts'
import './styles.css'
import { SessionProvider } from './session/SessionContext.tsx'
import { router } from './routes.tsx'

// Service worker : met en cache l'interface publique après le premier chargement.
// Les réponses de l'API ne sont jamais mises en cache (cf. vite.config.ts).
if ('serviceWorker' in navigator && import.meta.env.PROD) registerSW({ immediate: true })

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <SessionProvider>
      <RouterProvider router={router} />
    </SessionProvider>
  </StrictMode>,
)
