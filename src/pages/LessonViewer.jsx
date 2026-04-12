import { useEffect, useState, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import api from '../api/client'

export default function LessonViewer() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [lesson, setLesson]     = useState(null)
  const [lessons, setLessons]   = useState([])
  const [progress, setProgress] = useState({ completed: false, last_page: 1, watched_sec: 0 })
  const [loading, setLoading]   = useState(true)
  const [numPages, setNumPages] = useState(null)
  const [page, setPage]         = useState(1)
  const videoRef = useRef(null)
  const saveTimer = useRef(null)

  useEffect(() => {
    setLoading(true)
    api.get(`/lessons/${id}/progress`).then(r => {
      if (r.data) {
        setProgress(r.data)
        setPage(r.data.last_page || 1)
      }
    }).catch(() => {})

    api.get(`/courses`).then(async (cr) => {
      for (const course of cr.data) {
        const lr = await api.get(`/courses/${course.id}/lessons`)
        const found = lr.data.find(l => l.id === parseInt(id))
        if (found) {
          setLesson({ ...found, course_id: course.id, course_title: course.title })
          setLessons(lr.data)
          break
        }
      }
      setLoading(false)
    })

    return () => clearTimeout(saveTimer.current)
  }, [id])

  const saveProgress = (patch) => {
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      api.post(`/lessons/${id}/progress`, { ...progress, ...patch })
        .then(r => setProgress(r.data))
        .catch(() => {})
    }, 1500)
  }

  const markDone = () => {
    api.post(`/lessons/${id}/progress`, { ...progress, completed: true })
      .then(r => setProgress(r.data))
  }

  if (loading) return <div className="loading-overlay" style={{ height: '100dvh' }}><div className="spinner" /></div>
  if (!lesson)  return <div className="loading-overlay" style={{ height: '100dvh' }}>Leçon introuvable</div>

  // ✅ CORRECTION : token passé en query param pour que <iframe> et <video> s'authentifient
  const token   = localStorage.getItem('token')
  const fileUrl = `/api/lessons/${id}/file?token=${token}`

  const currentIdx = lessons.findIndex(l => l.id === parseInt(id))
  const prevLesson = lessons[currentIdx - 1]
  const nextLesson = lessons[currentIdx + 1]

  return (
    <div className="viewer-page">
      {/* Topbar */}
      <div className="viewer-topbar">
        <button
          onClick={() => navigate(`/courses/${lesson.course_id}`)}
          style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,.7)', fontSize: 20, cursor: 'pointer', padding: '4px 8px' }}
        >←</button>
        <div className="viewer-title">
          <span style={{ opacity: .5, fontSize: 12 }}>{lesson.course_title} · </span>
          {lesson.title}
        </div>
        {!progress.completed && (
          <button className="btn btn-sm" style={{ background: 'var(--gold)', color: '#fff', border: 'none' }} onClick={markDone}>
            Marquer terminé
          </button>
        )}
        {progress.completed && (
          <span style={{ background: '#d1fae5', color: 'var(--success)', fontSize: 12, fontWeight: 700, padding: '4px 12px', borderRadius: 20 }}>✓ Terminé</span>
        )}
      </div>

      <div className="viewer-body">
        {/* Contenu principal */}
        <div className="viewer-content">
          {lesson.type === 'pdf' && lesson.file_path ? (
            <PDFViewer
              url={fileUrl}
              page={page}
              onPageChange={p => { setPage(p); saveProgress({ last_page: p }) }}
              onNumPages={setNumPages}
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
            <div className="empty-state" style={{ color: '#fff', paddingTop: 80 }}>
              <div className="icon"></div>
              <h3 style={{ color: '#fff' }}>Aucun fichier uploadé</h3>
              <p style={{ color: 'rgba(255,255,255,.6)' }}>L'enseignant n'a pas encore joint de fichier à cette leçon.</p>
            </div>
          )}
        </div>

        {/* Sidebar — liste des leçons */}
        <div className="viewer-sidebar">
          <div style={{ padding: '16px', borderBottom: '1px solid var(--border)' }}>
            <div style={{ fontFamily: 'Playfair Display, serif', fontSize: 15, color: 'var(--navy)' }}>Plan du cours</div>
          </div>
          <div style={{ padding: '8px 0' }}>
            {lessons.map((l, i) => (
              <div
                key={l.id}
                onClick={() => navigate(`/lesson/${l.id}`)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '10px 16px', cursor: 'pointer',
                  background: l.id === parseInt(id) ? '#eff6ff' : 'transparent',
                  borderLeft: l.id === parseInt(id) ? '3px solid var(--blue)' : '3px solid transparent',
                  transition: 'all .15s',
                }}
              >
                <div style={{
                  width: 28, height: 28, borderRadius: 7, flexShrink: 0,
                  background: l.id === parseInt(id) ? 'var(--blue)' : '#e2e8f0',
                  color: l.id === parseInt(id) ? '#fff' : 'var(--text-muted)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 12, fontWeight: 700,
                }}>
                  {i + 1}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--navy)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{l.title}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{l.type === 'pdf' ? '📄' : '🎬'} {l.duration || ''}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Navigation prev/next */}
          <div style={{ padding: 16, borderTop: '1px solid var(--border)', display: 'flex', gap: 8 }}>
            <button
              className="btn btn-outline btn-sm"
              style={{ flex: 1, justifyContent: 'center' }}
              disabled={!prevLesson}
              onClick={() => navigate(`/lesson/${prevLesson.id}`)}
            >← Préc.</button>
            <button
              className="btn btn-primary btn-sm"
              style={{ flex: 1, justifyContent: 'center' }}
              disabled={!nextLesson}
              onClick={() => navigate(`/lesson/${nextLesson.id}`)}
            >Suiv. →</button>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ── Lecteur PDF inline ────────────────────────────────── */
function PDFViewer({ url, page, onPageChange, onNumPages }) {
  const [error, setError] = useState(false)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {error ? (
        <div className="empty-state" style={{ paddingTop: 60 }}>
          <div className="icon"></div>
          <h3 style={{ color: '#fff' }}>Impossible de charger le PDF</h3>
          <a href={url} target="_blank" rel="noreferrer" className="btn btn-primary" style={{ marginTop: 16 }}>
            Télécharger le fichier
          </a>
        </div>
      ) : (
        // ✅ CORRECTION : le token est déjà dans url, le PDF s'affiche inline grâce au backend
        <iframe
          src={`${url}#page=${page}`}
          style={{ flex: 1, border: 'none', width: '100%' }}
          title="PDF Viewer"
          onError={() => setError(true)}
        />
      )}
    </div>
  )
}
