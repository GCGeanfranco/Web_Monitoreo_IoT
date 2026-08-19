import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Monitoreo IoT — Fundo Lopez',
        short_name: 'Monitoreo IoT',
        description: 'Monitoreo en tiempo real del autotransformador y riego del Fundo Lopez',
        theme_color: '#0b0d0c',
        background_color: '#0b0d0c',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        scope: '/',
        icons: [
          { src: '/pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/pwa-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ]
      },
      workbox: {
        // No cachear llamadas a la API ni el stream SSE — siempre datos frescos
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/web-monitoreo-iot\.onrender\.com\/api\/(?!stream).*/,
            handler: 'NetworkOnly'
          },
          {
            urlPattern: /^https:\/\/web-monitoreo-iot\.onrender\.com\/api\/stream.*/,
            handler: 'NetworkOnly'
          }
        ]
      }
    })
  ],
  build: {
    outDir: 'dist'
  }
})
