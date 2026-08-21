import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.js',
      registerType: 'autoUpdate',
      injectRegister: 'auto',
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
      // El NetworkOnly de /api/ ahora vive dentro de src/sw.js (registerRoute),
      // porque en modo injectManifest el service worker es código propio, no
      // generado automáticamente a partir de esta config.
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico}']
      }
    })
  ],
  build: {
    outDir: 'dist'
  }
})
