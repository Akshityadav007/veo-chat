// vite.config.js
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'fs'
import path from 'path'

const certDir = path.resolve(process.cwd(), 'certs')
const keyPath = path.join(certDir, 'key.pem')
const certPath = path.join(certDir, 'cert.pem')

let httpsOptions = true // fallback; Vite can auto-generate if files not found
try {
  const key = fs.readFileSync(keyPath)
  const cert = fs.readFileSync(certPath)
  httpsOptions = { key, cert }
  console.log('Using certs from', certDir)
} catch (err) {
  console.warn('Could not load local certs from', certDir, '- falling back to https: true auto cert (Vite).', err.message)
}

export default defineConfig({
  plugins: [react()],
  server: {
    host: true, // expose on LAN
    port: 5173,
    https: httpsOptions,
    proxy: {
      '/ws': {
        target: 'ws://localhost:8888',
        ws: true,
        changeOrigin: true
      }
    }
  }
})
