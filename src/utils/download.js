import api from '../api/client'

/** Télécharge un fichier protégé par la connexion (sauvegarde .zip, export .csv...). */
export async function downloadFile(url, params, fallbackName = 'fichier') {
  const res = await api.get(url, { params, responseType: 'blob' })
  const disposition = res.headers['content-disposition'] || ''
  const match = /filename="?([^";]+)"?/i.exec(disposition)
  const href = URL.createObjectURL(res.data)
  const link = document.createElement('a')
  link.href = href
  link.download = match ? match[1] : fallbackName
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(href)
}
