/**
 * ThumbnailUploader.jsx
 * Composant réutilisable pour uploader une image de cours
 * 
 * Usage dans AdminDashboard modal cours :
 *   <ThumbnailUploader courseId={editCourse?.id} current={editCourse?.thumbnail} onUploaded={(url) => {...}} />
 */
import { useState, useRef } from 'react'
import api from '../api/client'

export default function ThumbnailUploader({ courseId, current, onUploaded }) {
  const [uploading, setUploading] = useState(false)
  const [preview,   setPreview]   = useState(current || null)
  const [dragOver,  setDragOver]  = useState(false)
  const [error,     setError]     = useState('')
  const fileRef = useRef()

  const handleFile = async (file) => {
    if (!file) return
    if (!courseId) {
      setError("Sauvegardez d'abord le cours avant d'ajouter une image.")
      return
    }

    // Vérifications client
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setError('Formats acceptés : JPG, PNG, WebP')
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      setError('Image trop lourde (max 5 Mo)')
      return
    }

    setError('')
    setUploading(true)

    // Prévisualisation locale immédiate
    const reader = new FileReader()
    reader.onload = e => setPreview(e.target.result)
    reader.readAsDataURL(file)

    try {
      const fd = new FormData()
      fd.append('file', file)
      const { data } = await api.post(`/admin/courses/${courseId}/thumbnail`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' }
      })
      setPreview(data.thumbnail)
      onUploaded?.(data.thumbnail)
    } catch (err) {
      setError(err.response?.data?.detail || 'Erreur lors de l\'upload')
      setPreview(current || null)
    } finally {
      setUploading(false)
    }
  }

  const removeThumb = async () => {
    if (!courseId) { setPreview(null); return }
    try {
      await api.delete(`/admin/courses/${courseId}/thumbnail`)
      setPreview(null)
      onUploaded?.(null)
    } catch {}
  }

  return (
    <div>
      <label style={{ display: 'block', fontSize: 12, color: 'var(--text-muted)', marginBottom: 8, fontWeight: 600, textTransform: 'uppercase', letterSpacing: .5 }}>
        Image de couverture
      </label>

      {preview ? (
        /* ── Prévisualisation ── */
        <div style={{ position: 'relative', borderRadius: 12, overflow: 'hidden', height: 140 }}>
          <img src={preview} alt="Thumbnail" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: 0, transition: 'opacity .2s' }}
            onMouseEnter={e => e.currentTarget.style.opacity = 1}
            onMouseLeave={e => e.currentTarget.style.opacity = 0}>
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              style={{ background: 'white', border: 'none', borderRadius: 8, padding: '7px 14px', cursor: 'pointer', fontSize: 12, fontWeight: 700 }}>
              ✏️ Changer
            </button>
            <button
              type="button"
              onClick={removeThumb}
              style={{ background: '#ef4444', color: 'white', border: 'none', borderRadius: 8, padding: '7px 14px', cursor: 'pointer', fontSize: 12, fontWeight: 700 }}>
              🗑 Supprimer
            </button>
          </div>
          {uploading && (
            <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.6)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div style={{ color: '#fff', fontSize: 13, fontWeight: 700 }}>⏳ Upload...</div>
            </div>
          )}
        </div>
      ) : (
        /* ── Zone de drop ── */
        <div
          className={dragOver ? 'drag-over' : ''}
          onClick={() => fileRef.current?.click()}
          onDragOver={e => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={e => { e.preventDefault(); setDragOver(false); handleFile(e.dataTransfer.files[0]) }}
          style={{
            height: 120, borderRadius: 12, cursor: 'pointer',
            border: `2px dashed ${dragOver ? 'var(--blue)' : '#d1d5db'}`,
            background: dragOver ? '#eff6ff' : '#f8fafc',
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center', gap: 6,
            transition: 'all .15s',
          }}>
          {uploading ? (
            <div style={{ fontSize: 13, color: 'var(--blue)', fontWeight: 700 }}>⏳ Upload en cours...</div>
          ) : (
            <>
              <span style={{ fontSize: 28 }}>🖼️</span>
              <div style={{ fontSize: 13, color: '#64748b', fontWeight: 600 }}>
                {courseId ? 'Glisser une image ou cliquer' : 'Créez le cours d\'abord'}
              </div>
              <div style={{ fontSize: 11, color: '#94a3b8' }}>JPG, PNG, WebP · max 5 Mo</div>
            </>
          )}
        </div>
      )}

      {error && (
        <div style={{ fontSize: 12, color: '#ef4444', marginTop: 6, fontWeight: 600 }}>⚠ {error}</div>
      )}

      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        style={{ display: 'none' }}
        onChange={e => handleFile(e.target.files[0])}
      />
    </div>
  )
}
