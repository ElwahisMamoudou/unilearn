/**
 * Adresse du backend et construction des URLs de fichiers.
 *
 * Le backend stocke des chemins relatifs ("uploads/thumbnails/xxx.jpg").
 * En production (Vercel + Railway) il faut une URL absolue vers le backend :
 * on lit VITE_API_URL (ex. https://mon-app.up.railway.app/api) et on retire
 * le "/api" final pour obtenir la racine du backend.
 */
export const BACKEND = (import.meta.env.VITE_API_URL || '').replace(/\/api\/?$/, '')

export function thumbUrl(path) {
  if (!path) return null
  if (path.startsWith('http')) return path          // déjà absolue
  const clean = path.replace(/\\/g, '/').replace(/^\/+/, '')
  return BACKEND ? `${BACKEND}/${clean}` : `/${clean}`
}
