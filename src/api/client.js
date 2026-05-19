import axios from 'axios'

const PRODUCTION_API_URL = 'https://printf-web-production.up.railway.app/api'
const DEV_API_URL = 'http://localhost:8000/api'

function resolveBaseURL() {
  const raw = import.meta.env.VITE_API_URL

  if (!raw) {
    // No env var set — use production URL in prod builds, localhost in dev
    return import.meta.env.DEV ? DEV_API_URL : PRODUCTION_API_URL
  }

  // Ensure the URL always has an absolute protocol so axios doesn't treat it
  // as a relative path (which causes requests to be appended to the current
  // Vercel origin instead of going to the Railway backend).
  if (raw.startsWith('http://') || raw.startsWith('https://')) {
    return raw
  }

  // Strip any accidental leading slashes before prepending the protocol
  return `https://${raw.replace(/^\/+/, '')}`
}

const api = axios.create({
  baseURL: resolveBaseURL(),
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
