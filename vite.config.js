import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    host: true, // Permet d'exposer le serveur sur le réseau local du Chromebook
    port: 5173,
    proxy: {
      // Redirige tous les appels commençant par /api vers FastAPI
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
        secure: false,
        // On ne réécrit PAS le path car le backend a maintenant le préfixe /api
      }
    }
  }
})