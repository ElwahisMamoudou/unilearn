import axios from 'axios'

// VITE_API_URL must be set in Vercel's project dashboard under
// Settings > Environment Variables. Vercel does NOT load .env or
// .env.production files automatically at build time.
//
// Required value: https://web-production-0a022.up.railway.app/api
//
// The hardcoded fallback below ensures production builds always reach
// the Railway backend even if the env var is accidentally missing,
// preventing requests from being routed through the Vercel domain.
const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'https://web-production-0a022.up.railway.app/api',
})

// Injecte le token JWT dans chaque requête
api.interceptors.request.use(cfg => {
  const token = localStorage.getItem('token')
  if (token) {
    cfg.headers.Authorization = `Bearer ${token}`
  }
  return cfg
})

// Gestion des erreurs (ex: 401 Unauthorized)
api.interceptors.response.use(
  response => response,
  error => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token')
      localStorage.removeItem('user')
      window.location.href = '/login'
    }
    return Promise.reject(error)
  }
)

export default api
