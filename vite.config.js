import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  // Set base path for htdocs root deployment
  base: '/',
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks: undefined
      }
    }
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: process.env.NODE_ENV === 'production' ? 'auto' : null,
      devOptions: {
        enabled: false // Disable PWA in development
      },
      workbox: {
        cleanupOutdatedCaches: true,
        globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
        globIgnores: ['**/Desktop cards icons/**', '**/Mobile cards icons/**', '**/Desktop*/**', '**/Mobile*/**'],
        navigateFallback: null, // Prevent service worker from intercepting navigation
        manifestTransforms: [
          async (entries) => {
            // Filter out problematic assets (spaces encoded, percent chars, or icons folders)
            const filtered = entries.filter((e) => {
              const url = e.url || ''
              if (url.includes('Desktop%20cards%20icons') || url.includes('Mobile%20cards%20icons')) return false
              if (url.includes('Desktop cards icons') || url.includes('Mobile cards icons')) return false
              if (url.includes('%')) return false
              return true
            })
            return { manifest: filtered }
          }
        ],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/api\.brokereye\.app\/.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-cache',
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 300 // 5 minutes
              }
            }
          }
        ]
      },
      manifest: process.env.NODE_ENV === 'production' ? {
        name: 'Broker Eyes',
        short_name: 'BrokerEyes',
        description: 'Professional trading platform with advanced authentication',
        theme_color: '#2563eb',
        background_color: '#ffffff',
        display: 'standalone',
        orientation: 'portrait-primary',
        // Use relative scope/start_url so builds work under subpaths (e.g., /amari-capital or /broker)
        scope: '.',
        start_url: '.',
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png'
          }
        ]
      } : false
    })
  ],
  server: {
    host: '0.0.0.0',
    port: 3001,
    proxy: {
      // IB endpoints use the same API domain as other broker endpoints
      '/api/amari/ib': {
        target: 'https://api.brokereye.app',
        changeOrigin: true,
        secure: false,
        ws: false,
        rewrite: (path) => path,
        configure: (proxy, options) => {
          proxy.on('error', (err, req, res) => {
            console.log('IB Proxy error:', err)
          })
          proxy.on('proxyReq', (proxyReq, req, res) => {
            console.log('IB Proxying request:', req.method, req.url)
          })
          proxy.on('proxyRes', (proxyRes, req, res) => {
            console.log('IB Proxy response:', proxyRes.statusCode, req.url)
          })
        }
      },
      '/api': {
        target: 'https://api.brokereye.app',
        changeOrigin: true,
        secure: false, // Disable SSL verification for development (avoid certificate issues)
        ws: true, // Enable WebSocket proxying
        rewrite: (path) => path,
        configure: (proxy, options) => {
          proxy.on('error', (err, req, res) => {
            console.log('Proxy error:', err)
          })
          proxy.on('proxyReq', (proxyReq, req, res) => {
            console.log('Proxying request:', req.method, req.url)
          })
          proxy.on('proxyRes', (proxyRes, req, res) => {
            console.log('Proxy response:', proxyRes.statusCode, req.url)
          })
        }
      }
    }
  }
})
