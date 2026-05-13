import { useEffect, useState, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import api from '../api/client'
import useAuthStore from '../store/authStore'

/**
 * LessonViewer — Lecteur de leçons PDF et Vidéo
 *
 * CORRECTIONS :
 * 1. URL du fichier → /api/lessons/:id/file?token=...
 *    Le token en query param permet à <iframe> et <video> de s'authentifier
 *    (ces balises HTML ne supportent pas les headers Authorization)
 * 2. Chargement de la leçon via /api/lessons/:id direct
 *    (l'ancien code itérait sur TOUS les cours → très lent si beaucoup de cours)
 * 3. Promise.allSettled pour ne pas bloquer si progress ou siblings échouent
 * 4. Navigation prev/next robuste avec vérification des bornes
 */
export default function LessonViewer() {
  const { id }   = useParams()
  const navigate = useNavigate()
  const { user } = useAuthStore()

  const [lesson,   setLesson]   = useState(null)
  const [lessons,  setLessons]  = useState([])
  const [progress, setProgress] = useState({ completed: false, last_page: 1, watched_sec: 0 })
  const [loading,  setLoading]  = useState(true)
  const [page,     setPage]     = useState(1)

  const videoRef  = useRef(null)
  const saveTimer = useRef(null)

  // ── Chargement ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!id) return
    setLoading(true)

    const load = async () => {
      try {
        // Endpoint direct — pas d'itération sur tous les cours
        const lr = await api.get(`/lessons/${id}`)
        const l  = lr.data

        // Charger le cours parent, les leçons sœurs et la progression en parallèle
        const [cr, siblingsR, progressR] = await Promise.allSettled([
          api.get(`/courses/${l.course_id}`),
          api.get(`/courses/${l.course_id}/lessons`),
          api.get(`/lessons/${id}/progress`),
        ])

        const courseTitle = cr.status === 'fulfilled' ? cr.value.data.title : ''
        const siblings    = siblingsR.status === 'fulfilled' ? siblingsR.value.data : [l]

        setLesson({ ...l, course_title: courseTitle })
        setLessons(siblings)

        if (progressR.status === 'fulfilled' && progressR.value.data) {
          const p = progressR.value.data
          setProgress(p)
          setPage(p.last_page || 1)
        }
      } catch {
        setLesson(null)
      } finally {
        setLoading(false)
      }
    }

    load()
    return () => clearTimeout(saveTimer.current)
  }, [id])

  // ── Sauvegarde progression (debounce 1.5s) ─────────────────────────────
  const canTrackProgress = user?.role === 'student' || user?.role === 'admin'

  const saveProgress = (patch) => {
    if (!canTrackProgress) return
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      api.post(`/lessons/${id}/progress`, { ...progress, ...patch })
        .then(r => setProgress(r.data))
        .catch(() => {})
    }, 1500)
  }

  const markDone = () => {
    if (!canTrackProgress) return
    const updated = { ...progress, completed: true }
    setProgress(updated)
    api.post(`/lessons/${id}/progress`, updated).catch(() => {})
  }

  // ── URL authentifiée du fichier ────────────────────────────────────────
  // Le token JWT est passé en query param car <iframe> et <video>
  // ne permettent pas d'ajouter des headers HTTP personnalisés.
  // Le backend doit accepter ?token= en plus du header Authorization.
  const token   = localStorage.getItem('token') || ''
  const API_ROOT = (import.meta.env.VITE_API_URL || 'http://localhost:8000/api').replace(/\/api\/?$/, '')
  const fileUrl = `${API_ROOT}/api/lessons/${id}/file?token=${encodeURIComponent(token)}`

  // ── Navigation prev / next ─────────────────────────────────────────────
  const currentIdx = lessons.findIndex(l => l.id === parseInt(id))
  const prevLesson = currentIdx > 0 ? lessons[currentIdx - 1] : null
  const nextLesson = currentIdx >= 0 && currentIdx < lessons.length - 1
    ? lessons[currentIdx + 1]
    : null

  // ── États de chargement ────────────────────────────────────────────────
  if (loading) return (
    <div className="loading-overlay" style={{ height: '100dvh' }}>
      <div className="spinner" />
    </div>
  )

  if (!lesson) return (
    <div className="loading-overlay" style={{ height: '100dvh', flexDirection: 'column', gap: 16 }}>
      <div style={{ fontSize: 48 }}>📭</div>
      <div style={{ color: '#fff', fontSize: 16 }}>Leçon introuvable</div>
      <button
        className="btn btn-outline"
        style={{ color: '#fff', borderColor: 'rgba(255,255,255,.3)' }}
        onClick={() => navigate(-1)}
      >← Retour</button>
    </div>
  )

  return (
    <div className="viewer-page">

      {/* ── Topbar ── */}
      <div className="viewer-topbar">
        <button
          onClick={() => navigate(`/courses/${lesson.course_id}`)}
          style={{
            background: 'none', border: 'none',
            color: 'rgba(255,255,255,.7)', fontSize: 20,
            cursor: 'pointer', padding: '4px 8px', flexShrink: 0,
          }}
          title="Retour au cours"
        >←</button>

        <div className="viewer-title" style={{
          flex: 1, minWidth: 0,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          <span style={{ opacity: .5, fontSize: 12 }}>{lesson.course_title} · </span>
          {lesson.title}
        </div>

        {!canTrackProgress ? (
          <span style={{
            background: 'rgba(255,255,255,.12)', color: 'rgba(255,255,255,.75)',
            fontSize: 12, fontWeight: 700,
            padding: '4px 12px', borderRadius: 20, flexShrink: 0,
          }}>Mode enseignant</span>
        ) : progress.completed ? (
          <span style={{
            background: '#d1fae5', color: '#065f46',
            fontSize: 12, fontWeight: 700,
            padding: '4px 12px', borderRadius: 20, flexShrink: 0,
          }}>✓ Terminé</span>
        ) : (
          <button
            className="btn btn-sm"
            style={{ background: 'var(--gold)', color: '#fff', border: 'none', flexShrink: 0 }}
            onClick={markDone}
          >Marquer terminé</button>
        )}
      </div>

      {/* ── Corps ── */}
      <div className="viewer-body">

        {/* Contenu principal */}
        <div className="viewer-content">
          {lesson.type === 'pdf' && lesson.file_path ? (
            <PDFViewer
              url={fileUrl}
              page={page}
              onPageChange={p => { setPage(p); saveProgress({ last_page: p }) }}
            />
          ) : lesson.type === 'video' && lesson.file_path ? (
            <video
              ref={videoRef}
              className="lesson-video"
              controls
              src={fileUrl}
              onTimeUpdate={e => saveProgress({ watched_sec: Math.floor(e.target.currentTime) })}
              onEnded={markDone}
            />
          ) : (
            <div className="empty-state" style={{ paddingTop: 80 }}>
              <div style={{ fontSize: 56, marginBottom: 16 }}>📂</div>
              <h3 style={{ color: '#fff' }}>Aucun fichier joint</h3>
              <p style={{ color: 'rgba(255,255,255,.6)' }}>
                L'enseignant n'a pas encore ajouté de fichier à cette leçon.
              </p>
            </div>
          )}
        </div>

        {/* ── Sidebar ── */}
        <div className="viewer-sidebar">
          <div style={{ padding: '16px', borderBottom: '1px solid var(--border)' }}>
            <div style={{
              fontFamily: 'Playfair Display, serif',
              fontSize: 15, color: 'var(--navy)', fontWeight: 600,
            }}>Plan du cours</div>
            {lesson.course_title && (
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                {lesson.course_title}
              </div>
            )}
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
            {lessons.map((l, i) => {
              const isActive = l.id === parseInt(id)
              return (
                <div
                  key={l.id}
                  onClick={() => navigate(`/lesson/${l.id}`)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '10px 16px', cursor: 'pointer',
                    background: isActive ? '#eff6ff' : 'transparent',
                    borderLeft: isActive ? '3px solid var(--blue)' : '3px solid transparent',
                    transition: 'background .15s',
                  }}
                >
                  <div style={{
                    width: 28, height: 28, borderRadius: 7, flexShrink: 0,
                    background: isActive ? 'var(--blue)' : '#e2e8f0',
                    color: isActive ? '#fff' : 'var(--text-muted)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 12, fontWeight: 700,
                  }}>{i + 1}</div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontSize: 13, fontWeight: isActive ? 600 : 500,
                      color: isActive ? 'var(--blue)' : 'var(--navy)',
                      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                    }}>{l.title}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>
                      {l.type === 'pdf' ? '📄 PDF' : '🎬 Vidéo'}
                      {l.duration ? ` · ${l.duration}` : ''}
                    </div>
                  </div>

                  {!l.file_path && (
                    <span title="Fichier manquant" style={{ fontSize: 10, color: '#ef4444', flexShrink: 0 }}>!</span>
                  )}
                </div>
              )
            })}
          </div>

          {/* Navigation prev / next */}
          <div style={{ padding: 12, borderTop: '1px solid var(--border)', display: 'flex', gap: 8 }}>
            <button
              className="btn btn-outline btn-sm"
              style={{ flex: 1, justifyContent: 'center' }}
              disabled={!prevLesson}
              onClick={() => prevLesson && navigate(`/lesson/${prevLesson.id}`)}
            >← Préc.</button>
            <button
              className="btn btn-primary btn-sm"
              style={{ flex: 1, justifyContent: 'center' }}
              disabled={!nextLesson}
              onClick={() => nextLesson && navigate(`/lesson/${nextLesson.id}`)}
            >Suiv. →</button>
          </div>
        </div>
      </div>
    </div>
  )
}


/* ════════════════════════════════════════════════════════════════
   PDFViewer
   Affiche le PDF dans un <iframe> natif du navigateur.
   Fallback : bouton "Ouvrir dans un onglet" si l'iframe échoue
   (Firefox mode privé, certains navigateurs mobiles, CORS strict).
════════════════════════════════════════════════════════════════ */
function PDFViewer({ url, page }) {
  const [error, setError] = useState(false)

  if (error) {
    return (
      <div className="empty-state" style={{ paddingTop: 60 }}>
        <div style={{ fontSize: 56, marginBottom: 16 }}>📄</div>
        <h3 style={{ color: '#fff' }}>Impossible d'afficher le PDF</h3>
        <p style={{ color: 'rgba(255,255,255,.6)', marginBottom: 20 }}>
          Votre navigateur bloque l'affichage inline.
        </p>
        <a href={url} target="_blank" rel="noreferrer" className="btn btn-primary">
          Ouvrir dans un nouvel onglet
        </a>
      </div>
    )
  }

  return (
    <iframe
      key={url}
      src={`${url}#page=${page}`}
      style={{ flex: 1, border: 'none', width: '100%', height: '100%', display: 'block' }}
      title="Lecteur PDF"
      onError={() => setError(true)}
    />
  )
}
