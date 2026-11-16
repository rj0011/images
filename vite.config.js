import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  base: './',
  build: { chunkSizeWarningLimit: 1000 },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg', 'apple-touch-icon.png', 'favicon-64.png', 'share-target.js'],
      manifest: {
        id: './',
        name: 'Images',
        short_name: 'Images',
        description: 'Premium offline gallery: photos, videos and music with pro players.',
        theme_color: '#0a0710',
        background_color: '#0a0710',
        display: 'standalone',
        orientation: 'any',
        start_url: './',
        scope: './',
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ],
        share_target: {
          action: './share-target',
          method: 'POST',
          enctype: 'multipart/form-data',
          params: { files: [{ name: 'media', accept: ['image/*', 'video/*', 'audio/*'] }] }
        },
        file_handlers: [
          { action: './', accept: { 'image/*': ['.jpg', '.jpeg', '.png', '.webp', '.gif'], 'video/*': ['.mp4', '.webm', '.mkv'], 'audio/*': ['.mp3', '.m4a', '.ogg', '.wav', '.flac'] } }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png}'],
        importScripts: ['share-target.js'],
        navigateFallbackDenylist: [/share-target/]
      }
    })
  ]
})
