import { useEffect, useState, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import api from '../api/client'
import useAuthStore from '../store/authStore'

/* ── URL thumbnail (même logique que CoursesPage) ── */
const BACKEND = (import.meta.env.VITE_API_URL || '').replace(/\/api\/?$/, '')
const thumbUrl = path => {
  if (!path) return null
  if (path.startsWith('http')) return path
  return BACKEND
    ? `${BACKEND}/${path.replace(/\\/g, '/').replace(/^\/+/, '')}`
    : `/${path.replace(/\\/g, '/').replace(/^\/+/, '')}`
}

const TABS = [
  { key: 'lessons',   label: '📖 Leçons'      },
  { key: 'homeworks', label: '📝 Devoirs'      },
  { key: 'exams',     label: '📋 Examens'      },
  { key: 'sessions',  label: '🎥 Cours en ligne' },
]

export default function CourseDetail() {
  const { id }   = useParams()
  const navigate = useNavigate()
  const { user } = useAuthStore()

  const isAdmin   = user?.role === 'admin'
  const isTeacher = user?.role === 'teacher'
  const isStudent = user?.role === 'student'
  const canManage = isAdmin || isTeacher

  const [tab,       setTab]       = useState('lessons')
  const [course,    setCourse]    = useState(null)
  const [lessons,   setLessons]   = useState([])
  const [homeworks, setHomeworks] = useState([])
  const [exams,     setExams]     = useState([])
  const [sessions,  setSessions]  = useState([])
  const [loading,   setLoading]   = useState(true)
  const [error,     setError]     = useState(null)
  const [msg,       setMsg]       = useState({ text: '', type: '' })

  /* ── Upload leçon ── */
  const [uploadModal, setUploadModal] = useState(false)
  const [lessonForm,  setLessonForm]  = useState({ title: '', duration: '', order: 0 })
  const [lessonFile,  setLessonFile]  = useState(null)
  const [uploading,   setUploading]   = useState(false)
  const [dragOver,    setDragOver]    = useState(false)
  const fileRef = useRef()

  /* ── Session ── */
  const [sessionModal, setSessionModal] = useState(false)
  const [sessionForm,  setSessionForm]  = useState({ title: '', scheduled_at: '' })

  const flash = (text, type = 'success') => {
    setMsg({ text, type })
    setTimeout(() => setMsg({ text: '', type: '' }), 3500)
  }

  /* ════════════════════════════════════════
     CHARGEMENT INITIAL
  ════════════════════════════════════════ */
  useEffect(() => {
    const load = async () => {
      setError(null)
      try {
        const cr = await api.get(`/courses/${id}`)
        setCourse(cr.data)
        // Leçons : ne pas bloquer si erreur
        const lr = await api.get(`/courses/${id}/lessons`).catch(() => ({ data: [] }))
        setLessons(lr.data)
      } catch (err) {
        setCourse(null)
        setError({
          status: err.response?.status,
          detail: err.response?.data?.detail || err.message || 'Erreur inconnue',
        })
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [id])

  /* ── Charger devoirs / examens / sessions à la demande ── */
  const loadTab = async (t) => {
    if (t === 'homeworks' && homeworks.length === 0) {
      const r = await api.get(`/homeworks/course/${id}`).catch(() => ({ data: [] }))
      setHomeworks(r.data)
    }
    if (t === 'exams' && exams.length === 0) {
      const r = await api.get(`/exams/course/${id}`).catch(() => ({ data: [] }))
      setExams(r.data)
    }
    if (t === 'sessions' && sessions.length === 0) {
      const r = await api.get(`/sessions/course/${id}`).catch(() => ({ data: [] }))
      setSessions(r.data)
    }
  }

  const switchTab = t => { setTab(t); loadTab(t) }

  /* ════════════════════════════════════════
     ACTIONS LEÇONS
  ════════════════════════════════════════ */
  const reloadLessons = async () => {
    const r = await api.get(`/courses/${id}/lessons`)
    setLessons(r.data)
  }

  const uploadLesson = async e => {
    e.preventDefault()
    if (!lessonFile) return flash('Sélectionnez un fichier', 'error')
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('course_id', id)
      fd.append('title',     lessonForm.title)
      fd.append('duration',  lessonForm.duration)
      fd.append('order',     lessonForm.order)
      fd.append('file',      lessonFile)
      await api.post('/lessons/upload', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
      flash('Leçon ajoutée !')
      setUploadModal(false)
      setLessonForm({ title: '', duration: '', order: 0 })
      setLessonFile(null)
      reloadLessons()
    } catch (err) {
      flash(err.response?.data?.detail || 'Erreur upload', 'error')
    } finally {
      setUploading(false)
    }
  }

  const deleteLesson = async lessonId => {
    if (!confirm('Supprimer cette leçon ?')) return
    await api.delete(`/lessons/${lessonId}`)
    flash('Leçon supprimée')
    reloadLessons()
  }

  /* ════════════════════════════════════════
     ACTIONS SESSIONS
  ════════════════════════════════════════ */
  const createSession = async e => {
    e.preventDefault()
    try {
      await api.post('/sessions', {
        course_id:    parseInt(id),
        title:        sessionForm.title,
        scheduled_at: sessionForm.scheduled_at
          ? new Date(sessionForm.scheduled_at).toISOString()
          : null,
      })
      flash('Session créée !')
      setSessionModal(false)
      setSessionForm({ title: '', scheduled_at: '' })
      setSessions([])
      loadTab('sessions')
    } catch (err) {
      flash(err.response?.data?.detail || 'Erreur', 'error')
    }
  }

  const startSession = async s => {
    await api.post(`/sessions/${s.id}/start`)
    flash('Session démarrée !')
    setSessions([])
    loadTab('sessions')
    navigate(`/room/${s.room_id}`)
  }

  const endSession = async s => {
    await api.post(`/sessions/${s.id}/end`)
    flash('Session terminée')
    setSessions([])
    loadTab('sessions')
  }

  const deleteSession = async s => {
    if (!confirm('Supprimer cette session ?')) return
    await api.delete(`/sessions/${s.id}`)
    flash('Session supprimée')
    setSessions([])
    loadTab('sessions')
  }

  /* ── S'inscrire au cours ── */
  const enroll = async () => {
    try {
      await api.post(`/courses/${id}/enroll`)
      flash('Inscription réussie !')
      const cr = await api.get(`/courses/${id}`)
      setCourse(cr.data)
    } catch (err) {
      flash(err.response?.data?.detail || 'Erreur', 'error')
    }
  }

  /* ════════════════════════════════════════
     RENDU
  ════════════════════════════════════════ */
  if (loading) return <div className="loading-overlay"><div className="spinner" /></div>

  if (!course) return (
    <div style={{ textAlign: 'center', padding: '80px 20px' }}>
      <div style={{ fontSize: 52, marginBottom: 16 }}>📭</div>
      <h2 style={{ color: 'var(--navy)', marginBottom: 8 }}>
        {error?.status === 403 ? 'Accès refusé' : 'Cours introuvable'}
      </h2>
      <p style={{ color: 'var(--text-muted)', marginBottom: 8 }}>
        {error?.detail || "Ce cours n'existe pas ou vous n'avez pas accès."}
      </p>
      <p style={{ color: '#94a3b8', fontSize: 12, marginBottom: 24 }}>
        ID du cours : {id}
      </p>
      <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
        <button className="btn btn-outline" onClick={() => navigate(-1)}>
          ← Retour
        </button>
        <button className="btn btn-primary" onClick={() => navigate('/courses')}>
          Catalogue des cours
        </button>
      </div>
    </div>
  )

  const thumb = thumbUrl(course.thumbnail)
  const pct   = Math.round(course.progress_pct || 0)

  return (
    <div>
      {msg.text && (
        <div className={`alert alert-${msg.type === 'error' ? 'error' : 'success'}`} style={{ marginBottom: 16 }}>
          {msg.text}
        </div>
      )}

      {/* ════════════════════════════════════════
          EN-TÊTE COURS
      ════════════════════════════════════════ */}
      <div style={{
        borderRadius: 18,
        overflow: 'hidden',
        marginBottom: 28,
        position: 'relative',
        minHeight: 200,
        background: thumb
          ? `url(${thumb}) center/cover no-repeat`
          : 'linear-gradient(135deg, #0f1f3d 0%, #1a3a6e 60%, #0f2d4a 100%)',
        boxShadow: '0 12px 32px rgba(15,31,61,.2)',
      }}>
        {/* Overlay */}
        <div style={{
          position: 'absolute', inset: 0,
          background: 'linear-gradient(to top, rgba(0,0,0,.8) 0%, rgba(0,0,0,.3) 60%, rgba(0,0,0,.1) 100%)',
        }} />

        <div style={{ position: 'relative', padding: '24px 28px', display: 'flex', flexDirection: 'column', minHeight: 200, justifyContent: 'space-between' }}>
          {/* Bouton retour */}
          <div style={{ display: 'flex', gap: 10 }}>
            <button
              onClick={() => navigate(-1)}
              style={{ background: 'rgba(255,255,255,.18)', border: 'none', color: '#fff', borderRadius: 8, padding: '6px 14px', cursor: 'pointer', fontSize: 13, backdropFilter: 'blur(6px)' }}
            >
              ← Retour
            </button>
          </div>

          {/* Titre + infos */}
          <div style={{ marginTop: 'auto' }}>
            {course.category?.name && (
              <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,.7)', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 8 }}>
                {course.category.name}
              </div>
            )}
            <h1 style={{
              fontFamily: 'Playfair Display, serif',
              fontSize: 26, fontWeight: 800, color: '#fff', margin: '0 0 10px',
              textShadow: '0 2px 8px rgba(0,0,0,.4)',
            }}>
              {course.title}
            </h1>
            <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'center' }}>
              <span style={{ fontSize: 13, color: 'rgba(255,255,255,.8)', display: 'flex', alignItems: 'center', gap: 6 }}>
                👨‍🏫 {course.teacher_name || 'Non assigné'}
              </span>
              <span style={{ fontSize: 13, color: 'rgba(255,255,255,.8)', display: 'flex', alignItems: 'center', gap: 6 }}>
                📖 {lessons.length} leçon{lessons.length > 1 ? 's' : ''}
              </span>
              {course.student_count > 0 && (
                <span style={{ fontSize: 13, color: 'rgba(255,255,255,.8)', display: 'flex', alignItems: 'center', gap: 6 }}>
                  👥 {course.student_count} étudiant{course.student_count > 1 ? 's' : ''}
                </span>
              )}
              <span style={{
                fontSize: 11, fontWeight: 700, padding: '3px 12px', borderRadius: 20,
                background: course.is_published ? 'rgba(34,197,94,.85)' : 'rgba(245,158,11,.85)',
                color: '#fff',
              }}>
                {course.is_published ? '✓ Publié' : '✏ Brouillon'}
              </span>
            </div>

            {/* Progression étudiant */}
            {isStudent && course.enrolled && (
              <div style={{ marginTop: 14, maxWidth: 300 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                  <span style={{ fontSize: 11, color: 'rgba(255,255,255,.7)', fontWeight: 600 }}>Progression</span>
                  <span style={{ fontSize: 12, fontWeight: 800, color: pct === 100 ? '#22c55e' : '#fff' }}>{pct}%</span>
                </div>
                <div style={{ height: 6, background: 'rgba(255,255,255,.2)', borderRadius: 4, overflow: 'hidden' }}>
                  <div style={{
                    height: '100%', width: `${pct}%`, borderRadius: 4,
                    background: pct === 100 ? '#22c55e' : 'linear-gradient(90deg, #3b82f6, #6366f1)',
                    transition: 'width .6s ease',
                  }} />
                </div>
              </div>
            )}

            {/* Bouton inscription si pas inscrit */}
            {isStudent && !course.enrolled && (
              <button
                onClick={enroll}
                style={{
                  marginTop: 16, background: '#3b82f6', border: 'none', color: '#fff',
                  borderRadius: 10, padding: '10px 24px', fontWeight: 700, fontSize: 14,
                  cursor: 'pointer', boxShadow: '0 4px 14px rgba(59,130,246,.5)',
                }}
              >
                S'inscrire à ce cours →
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Description */}
      {course.description && (
        <div style={{
          padding: '14px 18px', borderRadius: 12, marginBottom: 20,
          background: '#f8fafc', border: '1px solid var(--border)',
          fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.7,
        }}>
          {course.description}
        </div>
      )}

      {/* ════════════════════════════════════════
          ONGLETS
      ════════════════════════════════════════ */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', marginBottom: 24, overflowX: 'auto' }}>
        {TABS.map(({ key, label }) => (
          <button key={key} onClick={() => switchTab(key)} style={{
            padding: '10px 18px', border: 'none', background: 'none',
            cursor: 'pointer', fontSize: 14, fontWeight: 500, whiteSpace: 'nowrap',
            borderBottom: tab === key ? '2px solid var(--blue)' : '2px solid transparent',
            color: tab === key ? 'var(--blue)' : 'var(--text-muted)',
          }}>{label}</button>
        ))}
      </div>

      {/* ════════════════════════════════════════
          LEÇONS
      ════════════════════════════════════════ */}
      {tab === 'lessons' && (
        <div>
          {canManage && (
            <div style={{ marginBottom: 16 }}>
              <button
                className="btn btn-primary btn-sm"
                onClick={() => {
                  setLessonForm({ title: '', duration: '', order: lessons.length })
                  setLessonFile(null)
                  setUploadModal(true)
                }}
              >
                + Ajouter une leçon
              </button>
            </div>
          )}

          {lessons.length === 0 ? (
            <div className="empty-state">
              <h3>Aucune leçon</h3>
              <p>{canManage ? 'Ajoutez la première leçon à ce cours.' : "L'enseignant n'a pas encore ajouté de leçons."}</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {lessons.map((l, i) => (
                <div key={l.id} style={{
                  background: '#fff', borderRadius: 14,
                  border: '1px solid var(--border)',
                  padding: '14px 18px',
                  display: 'flex', alignItems: 'center', gap: 14,
                  transition: 'box-shadow .15s',
                }}
                  onMouseEnter={e => e.currentTarget.style.boxShadow = '0 4px 16px rgba(59,130,246,.1)'}
                  onMouseLeave={e => e.currentTarget.style.boxShadow = 'none'}
                >
                  {/* Numéro + type */}
                  <div style={{
                    width: 36, height: 36, borderRadius: 10, flexShrink: 0,
                    background: l.type === 'pdf' ? '#dbeafe' : '#dcfce7',
                    color: l.type === 'pdf' ? '#1d4ed8' : '#16a34a',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 16, fontWeight: 700,
                  }}>
                    {l.type === 'pdf' ? '📄' : '🎬'}
                  </div>

                  {/* Infos */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--navy)', display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{
                        fontSize: 11, fontWeight: 700, color: 'var(--text-muted)',
                        background: '#f1f5f9', padding: '1px 7px', borderRadius: 6,
                        flexShrink: 0,
                      }}>#{i + 1}</span>
                      {l.title}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3 }}>
                      {l.type === 'pdf' ? 'PDF' : 'Vidéo'}
                      {l.duration ? ` · ${l.duration}` : ''}
                    </div>
                  </div>

                  {/* Badge fichier */}
                  <span style={{
                    fontSize: 11, padding: '3px 10px', borderRadius: 20, fontWeight: 600, flexShrink: 0,
                    background: l.file_path ? '#dcfce7' : '#fee2e2',
                    color: l.file_path ? '#16a34a' : '#991b1b',
                  }}>
                    {l.file_path ? '✓ Disponible' : '⚠ Manquant'}
                  </span>

                  {/* Actions */}
                  <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                    {l.file_path && (
                      <button
                        className="btn btn-primary btn-sm"
                        onClick={() => navigate(`/lesson/${l.id}`)}
                      >
                        {isStudent ? 'Ouvrir' : 'Aperçu'}
                      </button>
                    )}
                    {canManage && (
                      <button
                        className="btn btn-danger btn-sm"
                        onClick={() => deleteLesson(l.id)}
                      >
                        Supprimer
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ════════════════════════════════════════
          DEVOIRS
      ════════════════════════════════════════ */}
      {tab === 'homeworks' && (
        <div>
          {canManage && (
            <div style={{ marginBottom: 16 }}>
              <button className="btn btn-primary btn-sm" onClick={() => navigate('/homeworks')}>
                Gérer les devoirs →
              </button>
            </div>
          )}
          {homeworks.length === 0 ? (
            <div className="empty-state"><h3>Aucun devoir</h3></div>
          ) : homeworks.map(hw => {
            const due  = new Date(hw.due_date)
            const late = new Date() > due
            return (
              <div key={hw.id} className="card" style={{ marginBottom: 10 }}>
                <div className="card-body" style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--navy)' }}>{hw.title}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 3 }}>
                      📅 {due.toLocaleDateString('fr-FR')} · /{hw.max_score}
                      {late && <span style={{ color: '#ef4444', marginLeft: 8, fontWeight: 600 }}>⚠ Délai dépassé</span>}
                    </div>
                    {hw.has_file && (
                      <a href={`/api/homeworks/${hw.id}/file`} target="_blank" rel="noreferrer"
                        style={{ fontSize: 11, color: 'var(--blue)', textDecoration: 'none', display: 'block', marginTop: 4 }}>
                        📎 Fichier joint
                      </a>
                    )}
                    {isStudent && hw.my_submission && (
                      <div style={{ marginTop: 4 }}>
                        {hw.my_submission.graded
                          ? <span style={{ fontSize: 11, color: 'var(--success)', fontWeight: 600 }}>Note : {hw.my_submission.score}/{hw.max_score}</span>
                          : <span style={{ fontSize: 11, color: '#854d0e' }}>En attente de correction</span>}
                      </div>
                    )}
                  </div>
                  <span style={{ fontSize: 11, padding: '2px 10px', borderRadius: 20, background: hw.is_published ? '#d1fae5' : '#fef9c3', color: hw.is_published ? '#065f46' : '#854d0e' }}>
                    {hw.is_published ? 'Publié' : 'Brouillon'}
                  </span>
                  <button className="btn btn-outline btn-sm" onClick={() => navigate(`/homeworks?course=${id}`)}>
                    {isStudent ? 'Soumettre' : 'Voir soumissions'}
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ════════════════════════════════════════
          EXAMENS
      ════════════════════════════════════════ */}
      {tab === 'exams' && (
        <div>
          {canManage && (
            <div style={{ marginBottom: 16 }}>
              <button className="btn btn-primary btn-sm" onClick={() => navigate('/exams')}>
                Gérer les examens →
              </button>
            </div>
          )}
          {exams.length === 0 ? (
            <div className="empty-state"><h3>Aucun examen</h3></div>
          ) : exams.map(ex => (
            <div key={ex.id} className="card" style={{ marginBottom: 10 }}>
              <div className="card-body" style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--navy)' }}>{ex.title}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 3 }}>
                    ⏱ {ex.duration_min} min · {ex.questions?.length || 0} question(s)
                    {ex.starts_at && ` · Début : ${new Date(ex.starts_at).toLocaleString('fr-FR')}`}
                  </div>
                </div>
                <span style={{ fontSize: 11, padding: '2px 10px', borderRadius: 20, background: ex.is_published ? '#d1fae5' : '#fef9c3', color: ex.is_published ? '#065f46' : '#854d0e' }}>
                  {ex.is_published ? 'Publié' : 'Brouillon'}
                </span>
                <button className="btn btn-outline btn-sm" onClick={() => navigate(`/exams?course=${id}`)}>
                  {isStudent ? 'Passer →' : 'Gérer →'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ════════════════════════════════════════
          SESSIONS
      ════════════════════════════════════════ */}
      {tab === 'sessions' && (
        <div>
          {canManage && (
            <div style={{ marginBottom: 16 }}>
              <button className="btn btn-primary btn-sm" onClick={() => setSessionModal(true)}>
                + Planifier un cours en ligne
              </button>
            </div>
          )}
          {sessions.length === 0 ? (
            <div className="empty-state">
              <h3>Aucune session</h3>
              <p>Planifiez votre premier cours en ligne.</p>
            </div>
          ) : sessions.map(s => (
            <div key={s.id} className="card" style={{ marginBottom: 10 }}>
              <div className="card-body" style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--navy)' }}>{s.title}</div>
                  {s.scheduled_at && (
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 3 }}>
                      📅 {new Date(s.scheduled_at).toLocaleString('fr-FR')}
                    </div>
                  )}
                </div>
                <span style={{
                  fontSize: 11, padding: '2px 10px', borderRadius: 20, fontWeight: 600,
                  background: s.is_active ? '#d1fae5' : '#f1f5f9',
                  color: s.is_active ? '#065f46' : '#64748b',
                }}>
                  {s.is_active ? '🔴 En direct' : s.ended_at ? 'Terminé' : 'Planifié'}
                </span>
                <div style={{ display: 'flex', gap: 6 }}>
                  {!s.is_active && !s.ended_at && canManage && (
                    <button className="btn btn-primary btn-sm" onClick={() => startSession(s)}>Démarrer</button>
                  )}
                  {s.is_active && (
                    <>
                      <button className="btn btn-primary btn-sm" onClick={() => navigate(`/room/${s.room_id}`)}>Rejoindre</button>
                      {canManage && <button className="btn btn-outline btn-sm" onClick={() => endSession(s)}>Terminer</button>}
                    </>
                  )}
                  {canManage && (
                    <button className="btn btn-danger btn-sm" onClick={() => deleteSession(s)}>Supprimer</button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ════════════════════════════════════════
          MODAL UPLOAD LEÇON
      ════════════════════════════════════════ */}
      {uploadModal && (
        <div className="modal-overlay" onClick={() => setUploadModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">Ajouter une leçon — {course.title}</span>
              <button className="modal-close" onClick={() => setUploadModal(false)}>×</button>
            </div>
            <form onSubmit={uploadLesson}>
              <div className="modal-body">
                <div className="form-group">
                  <label className="form-label">Titre *</label>
                  <input className="form-input" required
                    value={lessonForm.title}
                    onChange={e => setLessonForm({ ...lessonForm, title: e.target.value })}
                    placeholder="Ex : Introduction à la cinématique" />
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Durée estimée</label>
                    <input className="form-input"
                      value={lessonForm.duration}
                      onChange={e => setLessonForm({ ...lessonForm, duration: e.target.value })}
                      placeholder="Ex : 45 min" />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Ordre</label>
                    <input className="form-input" type="number" min={0}
                      value={lessonForm.order}
                      onChange={e => setLessonForm({ ...lessonForm, order: parseInt(e.target.value) })} />
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">Fichier (PDF ou Vidéo) *</label>
                  <div
                    className={`upload-zone${dragOver ? ' drag-over' : ''}`}
                    onDragOver={e => { e.preventDefault(); setDragOver(true) }}
                    onDragLeave={() => setDragOver(false)}
                    onDrop={e => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) setLessonFile(f) }}
                    onClick={() => fileRef.current.click()}
                  >
                    {lessonFile ? (
                      <>
                        <div style={{ fontSize: 28, marginBottom: 6 }}>📎</div>
                        <div style={{ fontWeight: 600 }}>{lessonFile.name}</div>
                        <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                          {(lessonFile.size / 1024 / 1024).toFixed(1)} MB
                        </p>
                      </>
                    ) : (
                      <>
                        <div style={{ fontWeight: 600, marginTop: 8 }}>Glisser-déposer ou cliquer</div>
                        <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>PDF, MP4, WebM acceptés</p>
                      </>
                    )}
                    <input
                      ref={fileRef} type="file" accept=".pdf,video/*"
                      style={{ display: 'none' }}
                      onChange={e => setLessonFile(e.target.files[0])}
                    />
                  </div>
                </div>
                {uploading && (
                  <div className="alert alert-info">Upload en cours...</div>
                )}
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-outline" onClick={() => setUploadModal(false)}>Annuler</button>
                <button type="submit" className="btn btn-primary" disabled={uploading}>
                  {uploading ? 'Upload...' : 'Uploader'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════
          MODAL SESSION
      ════════════════════════════════════════ */}
      {sessionModal && (
        <div className="modal-overlay" onClick={() => setSessionModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">Nouveau cours en ligne</span>
              <button className="modal-close" onClick={() => setSessionModal(false)}>×</button>
            </div>
            <form onSubmit={createSession}>
              <div className="modal-body">
                <div className="form-group">
                  <label className="form-label">Titre de la session *</label>
                  <input className="form-input" required
                    value={sessionForm.title}
                    onChange={e => setSessionForm({ ...sessionForm, title: e.target.value })}
                    placeholder="Ex : Cours du 15 mars" />
                </div>
                <div className="form-group">
                  <label className="form-label">Date et heure (optionnel)</label>
                  <input className="form-input" type="datetime-local"
                    value={sessionForm.scheduled_at}
                    onChange={e => setSessionForm({ ...sessionForm, scheduled_at: e.target.value })} />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-outline" onClick={() => setSessionModal(false)}>Annuler</button>
                <button type="submit" className="btn btn-primary">Créer la session</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
