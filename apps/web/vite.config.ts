import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: false,
      manifest: {
        name: 'Relais Maman',
        short_name: 'Relais Maman',
        description: 'Du premier message au soin reçu.',
        lang: 'fr',
        theme_color: '#174f46',
        background_color: '#f7f5ef',
        display: 'standalone',
        start_url: '/',
        icons: [{ src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }],
      },
      workbox: {
        // Seule l'interface publique est mise en cache. AUCUNE réponse /api (privée) n'est
        // jamais placée dans le cache du service worker, qui est partagé sur l'appareil.
        globPatterns: ['**/*.{js,css,html,svg,webmanifest}'],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: [],
      },
    }),
  ],
  server: {
    port: 5173,
    proxy: { '/api': { target: 'http://127.0.0.1:3000', changeOrigin: false } },
  },
  build: { target: 'es2020', sourcemap: false },
})
