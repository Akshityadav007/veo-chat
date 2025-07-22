import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()], 
  server: {
    port: 3000, // Change the port to your desired value
    host: true, // Optional:  Enables network access (you can access the app from your network IP)
  },
})
