import { useEffect, useState, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import api from '../api/client'
import useAuthStore from '../store/authStore'
import { LiveReplayPlayer, openLiveRoom } from '../utils/videoSessions.jsx'

/* ── URL thumbnail ── */
const BACKEND = (import.meta.env.VITE_API_URL || '').replace(/\/api\/?$/, '')
const thumbUrl = path => {
  if (!path) return null
  if (path.startsWith('http')) return path
  return BACKEND
    ? `${BACKEND}/${path.replace(/\\/g, '/').replace(/^\/+/, '')}`
    : `/${path.replace(/\\/g, '/').replace(/^\/+/, '')}`
}

const TABS = [
  { key: 'lessons',   label: '📖 Leçons'        },
  { key: 'students',  label: '👥 Étudiants'      },
  { key: 'homeworks', label: '📝 Devoirs'        },
  { key: 'exams',     label: '📋 Examens'        },
  { key: 'sessions',  label: '🎥 Cours en ligne' },
]

export default function CourseDetail() {
  const { id }   = useParams()
  const navigate = useNavigate()
  const { user } = useAuthStore()

  const isAdmin   = user?.role === 'admin'
  const isTeacher = user?.role === 'teacher'
  const isStudent = user?.role === 'student'

  const [tab,       setTab]       = useState('lessons')
  const [course,    setCourse]    = useState(null)
  const canManage = isAdmin || Boolean(isTeacher && course && course.teacher_id === user?.id)
  const [lessons,   setLessons]   = useState([])
  const [homeworks, setHomeworks] = useState([])
  const [exams,     setExams]     = useState([])
  const [sessions,  setSessions]  = useState([])
  const [students,  setStudents]  = useState([])
  const [loading,   setLoading]   = useState(true)
  const [error,     setError]     = useState(null)
  const [msg,       setMsg]       = useState({ text: '', type: '' })
  const [busySessionId, setBusySessionId] = useState(null)

  /* ── Modal édition cours ── */
  const [editModal,     setEditModal]     = useState(false)
  const [editForm,      setEditForm]      = useState({ title: '', description: '', teacher_id: '', category_id: '', is_published: true })
  const [editThumb,     setEditThumb]     = useState(null)
  const [editThumbPrev, setEditThumbPrev] = useState(null)
  const [saving,        setSaving]        = useState(false)
  const [allTeachers,   setAllTeachers]   = useState([])
  const [categories,    setCategories]    = useState([])
  const editThumbRef = useRef()

  /* ── Modal création devoir ── */
  const [hwModal,    setHwModal]    = useState(false)
  const [hwForm,     setHwForm]     = useState({ title: '', description: '', due_date: '', max_score: 20, is_published: false })
  const [hwFile,     setHwFile]     = useState(null)
  const [hwDragOver, setHwDragOver] = useState(false)
  const hwFileRef = useRef()

  /* ── Upload leçon ── */
  const [uploadModal, setUploadModal] = useState(false)
  const [lessonForm,  setLessonForm]  = useState({ title: '', duration: '', order: 0, youtube_url: '' })
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
        const [cr, lr] = await Promise.all([
          api.get(`/courses/${id}`),
          api.get(`/courses/${id}/lessons`).catch(() => ({ data: [] })),
        ])
        setCourse(cr.data)
        setLessons(lr.data)

        const sr = await api.get(`/admin/courses/${id}/students`).catch(() => ({ data: [] }))
        setStudents(sr.data)

        if (cr.data && (user?.role === 'admin' || user?.role === 'teacher')) {
          const [ur, cats] = await Promise.all([
            api.get('/admin/users').catch(() => ({ data: [] })),
            api.get('/categories').catch(() => ({ data: [] })),
          ])
          setAllTeachers(ur.data.filter(u => u.role === 'teacher'))
          setCategories(cats.data)
        }
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
  const loadTab = async (t, force = false) => {
    if (t === 'students' && students.length === 0) {
      const r = await api.get(`/admin/courses/${id}/students`).catch(() => ({ data: [] }))
      setStudents(r.data)
    }
    if (t === 'homeworks' && homeworks.length === 0) {
      const r = await api.get(`/homeworks/course/${id}`).catch(() => ({ data: [] }))
      setHomeworks(r.data)
    }
    if (t === 'exams' && exams.length === 0) {
      const r = await api.get(`/exams/course/${id}`).catch(() => ({ data: [] }))
      setExams(r.data)
    }
    if (t === 'sessions' && (sessions.length === 0 || force)) {
      const r = await api.get(`/sessions/course/${id}`).catch(() => ({ data: [] }))
      setSessions(r.data)
    }
  }

  /* ── Ouvrir modal édition ── */
  const openEdit = () => {
    setEditForm({
      title:        course.title,
      description:  course.description || '',
      teacher_id:   course.teacher_id ? String(course.teacher_id) : '',
      category_id:  course.category_id ? String(course.category_id) : '',
      is_published: course.is_published,
    })
    setEditThumb(null)
    setEditThumbPrev(thumbUrl(course.thumbnail))
    setEditModal(true)
  }

  /* ── Sauvegarder le cours ── */
  const saveCourse = async (e) => {
    e.preventDefault()
    if (!editForm.title.trim()) return flash('Le titre est requis', 'error')
    setSaving(true)
    try {
      await api.put(`/admin/courses/${id}`, {
        title:        editForm.title,
        description:  editForm.description || null,
        teacher_id:   editForm.teacher_id ? parseInt(editForm.teacher_id) : course.teacher_id,
        category_id:  editForm.category_id ? parseInt(editForm.category_id) : null,
        is_published: editForm.is_published,
      })
      if (editThumb instanceof File) {
        try {
          const fd = new FormData()
          fd.append('file', editThumb)
          await api.post(`/admin/courses/${id}/thumbnail`, fd, { headers: { 'Content-Type': 'multipart/form-data' } })
        } catch {}
      }
      flash('Cours modifié !')
      setEditModal(false)
      const cr = await api.get(`/courses/${id}`)
      setCourse(cr.data)
    } catch (err) {
      flash(err.response?.data?.detail || 'Erreur', 'error')
    } finally {
      setSaving(false)
    }
  }

  const switchTab = t => { setTab(t); loadTab(t) }

  useEffect(() => {
    if (tab !== 'sessions') return undefined
    const timer = setInterval(() => loadTab('sessions', true), 30000)
    return () => clearInterval(timer)
  }, [tab, id])

  /* ════════════════════════════════════════
     ACTIONS LEÇONS
  ════════════════════════════════════════ */
  const reloadLessons = async () => {
    const r = await api.get(`/courses/${id}/lessons`)
    setLessons(r.data)
  }

  const uploadLesson = async e => {
    e.preventDefault()
    const hasFile = !!lessonFile
    const hasYT   = !!lessonForm.youtube_url.trim()

    if (!hasFile && !hasYT) return flash('Sélectionnez un fichier ou collez une URL YouTube', 'error')
    if (hasFile && hasYT)   return flash('Choisissez soit un fichier, soit une URL YouTube, pas les deux', 'error')

    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('course_id', id)
      fd.append('title',     lessonForm.title)
      fd.append('duration',  lessonForm.duration)
      fd.append('order',     lessonForm.order)
      if (hasFile) fd.append('file',        lessonFile)
      if (hasYT)   fd.append('youtube_url', lessonForm.youtube_url.trim())

      await api.post('/lessons/upload', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
      flash('Leçon ajoutée !')
      setUploadModal(false)
      setLessonForm({ title: '', duration: '', order: 0, youtube_url: '' })
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
    try {
      setBusySessionId(s.id)
      const res = await api.post(`/sessions/${s.id}/start`)
      flash('Live en cours...')
      setSessions([])
      loadTab('sessions', true)
      openLiveRoom(navigate, res.data)
    } catch (err) {
      flash(err.response?.data?.detail || 'Erreur lors du démarrage du live', 'error')
    } finally {
      setBusySessionId(null)
    }
  }

  const endSession = async s => {
    await api.post(`/sessions/${s.id}/end`)
    flash('Session terminée')
    setSessions([])
    loadTab('sessions')
  }

  const deleteSession = async s => {
    if (!confirm('Supprimer cette session ?')) return
    try {
      setBusySessionId(s.id)
      const res = await api.post(`/sessions/${s.id}/end`)
      flash(res.data?.recording_url ? 'Rediffusion disponible dans quelques minutes' : 'Session terminée')
      setSessions([])
      loadTab('sessions', true)
    } catch (err) {
      flash(err.response?.data?.detail || 'Erreur lors de la fin du live', 'error')
    } finally {
      setBusySessionId(null)
    }
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

  /* ── Créer un devoir ── */
  const createHomework = async (e) => {
    e.preventDefault()
    if (!hwForm.title.trim()) return flash('Le titre est requis', 'error')
    if (!hwForm.due_date)     return flash('La date limite est requise', 'error')
    try {
      const fd = new FormData()
      fd.append('course_id',    id)
      fd.append('title',        hwForm.title.trim())
      fd.append('description',  hwForm.description || '')
      fd.append('due_date',     new Date(hwForm.due_date).toISOString())
      fd.append('max_score',    String(parseFloat(hwForm.max_score) || 20))
      fd.append('is_published', String(hwForm.is_published))
      if (hwFile) fd.append('file', hwFile)
      await api.post('/homeworks', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
      flash('Devoir créé !')
      setHwModal(false)
      setHwFile(null)
      setHwForm({ title: '', description: '', due_date: '', max_score: 20, is_published: false })
      setHomeworks([])
      loadTab('homeworks')
    } catch (err) {
      const d = err.response?.data?.detail
      flash(Array.isArray(d) ? d.map(x => x.msg).join(' | ') : d || 'Erreur', 'error')
    }
  }

  const deleteHomework = async (hwId) => {
    if (!confirm('Supprimer ce devoir ?')) return
    await api.delete(`/homeworks/${hwId}`)
    flash('Devoir supprimé')
    setHomeworks([])
    loadTab('homeworks')
  }

  /* ════════════════════════════════════════
     RENDU
  ════════════════════════════════════════ */
  if (loading) return <div className="loading-overlay"><div className="spinner" /></div>

  if (!course) return (
    <div style={{ textAlign: 'center', padding: '80px 20px' }}>
      <div style={{ fontSize: 52, marginBottom: 16 }}>📭</div>
      <h2 style={{ color: 'var(--navy)', marginBottom: 8 }}>Cours introuvable</h2>
      <p style={{ color: 'var(--text-muted)', marginBottom: 24 }}>
        Ce cours n'existe pas ou vous n'avez pas accès.
      </p>
      <button className="btn btn-primary" onClick={() => navigate('/courses')}>
        ← Retour aux cours
      </button>
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
        borderRadius: 18, overflow: 'hidden', marginBottom: 28,
        position: 'relative', minHeight: 200,
        background: thumb
          ? `url(${thumb}) center/cover no-repeat`
          : 'linear-gradient(135deg, #0f1f3d 0%, #1a3a6e 60%, #0f2d4a 100%)',
        boxShadow: '0 12px 32px rgba(15,31,61,.2)',
      }}>
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(0,0,0,.8) 0%, rgba(0,0,0,.3) 60%, rgba(0,0,0,.1) 100%)' }} />

        <div style={{ position: 'relative', padding: '24px 28px', display: 'flex', flexDirection: 'column', minHeight: 200, justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'space-between' }}>
            <button onClick={() => navigate(-1)} style={{ background: 'rgba(255,255,255,.18)', border: 'none', color: '#fff', borderRadius: 8, padding: '6px 14px', cursor: 'pointer', fontSize: 13, backdropFilter: 'blur(6px)' }}>
              ← Retour
            </button>
            {canManage && (
              <button onClick={openEdit} style={{ background: 'rgba(255,255,255,.18)', border: 'none', color: '#fff', borderRadius: 8, padding: '6px 14px', cursor: 'pointer', fontSize: 13, backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', gap: 6 }}>
                ✏️ Modifier
              </button>
            )}
          </div>

          <div style={{ marginTop: 'auto' }}>
            {course.category?.name && (
              <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,.7)', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 8 }}>
                {course.category.name}
              </div>
            )}
            <h1 style={{ fontFamily: 'Playfair Display, serif', fontSize: 26, fontWeight: 800, color: '#fff', margin: '0 0 10px', textShadow: '0 2px 8px rgba(0,0,0,.4)' }}>
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
              <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 12px', borderRadius: 20, background: course.is_published ? 'rgba(34,197,94,.85)' : 'rgba(245,158,11,.85)', color: '#fff' }}>
                {course.is_published ? '✓ Publié' : '✏ Brouillon'}
              </span>
            </div>

            {isStudent && course.enrolled && (
              <div style={{ marginTop: 14, maxWidth: 300 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                  <span style={{ fontSize: 11, color: 'rgba(255,255,255,.7)', fontWeight: 600 }}>Progression</span>
                  <span style={{ fontSize: 12, fontWeight: 800, color: pct === 100 ? '#22c55e' : '#fff' }}>{pct}%</span>
                </div>
                <div style={{ height: 6, background: 'rgba(255,255,255,.2)', borderRadius: 4, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${pct}%`, borderRadius: 4, background: pct === 100 ? '#22c55e' : 'linear-gradient(90deg, #3b82f6, #6366f1)', transition: 'width .6s ease' }} />
                </div>
              </div>
            )}

            {isStudent && !course.enrolled && (
              <button onClick={enroll} style={{ marginTop: 16, background: '#3b82f6', border: 'none', color: '#fff', borderRadius: 10, padding: '10px 24px', fontWeight: 700, fontSize: 14, cursor: 'pointer', boxShadow: '0 4px 14px rgba(59,130,246,.5)' }}>
                S'inscrire à ce cours →
              </button>
            )}
          </div>
        </div>
      </div>

      {course.description && (
        <div style={{ padding: '14px 18px', borderRadius: 12, marginBottom: 20, background: '#f8fafc', border: '1px solid var(--border)', fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.7 }}>
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
              <button className="btn btn-primary btn-sm" onClick={() => {
                setLessonForm({ title: '', duration: '', order: lessons.length, youtube_url: '' })
                setLessonFile(null)
                setUploadModal(true)
              }}>
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
              {lessons.map((l, i) => {
                const isYT      = l.type === 'youtube'
                const hasContent = l.file_path || l.youtube_url
                return (
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
                    {/* Icône type */}
                    <div style={{
                      width: 36, height: 36, borderRadius: 10, flexShrink: 0,
                      background: l.type === 'pdf' ? '#dbeafe' : isYT ? '#fee2e2' : '#dcfce7',
                      color:      l.type === 'pdf' ? '#1d4ed8' : isYT ? '#dc2626' : '#16a34a',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16,
                    }}>
                      {l.type === 'pdf' ? '📄' : isYT ? '▶️' : '🎬'}
                    </div>

                    {/* Infos */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--navy)', display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', background: '#f1f5f9', padding: '1px 7px', borderRadius: 6, flexShrink: 0 }}>
                          #{i + 1}
                        </span>
                        {l.title}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3 }}>
                        {l.type === 'pdf' ? 'PDF' : isYT ? 'YouTube' : 'Vidéo'}
                        {l.duration ? ` · ${l.duration}` : ''}
                      </div>
                    </div>

                    {/* Badge disponibilité */}
                    <span style={{
                      fontSize: 11, padding: '3px 10px', borderRadius: 20, fontWeight: 600, flexShrink: 0,
                      background: hasContent ? '#dcfce7' : '#fee2e2',
                      color:      hasContent ? '#16a34a' : '#991b1b',
                    }}>
                      {hasContent ? '✓ Disponible' : '⚠ Manquant'}
                    </span>

                    {/* Actions */}
                    <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                      {hasContent && (
                        <button className="btn btn-primary btn-sm" onClick={() => navigate(`/lesson/${l.id}`)}>
                          {isStudent ? 'Ouvrir' : 'Aperçu'}
                        </button>
                      )}
                      {canManage && (
                        <button className="btn btn-danger btn-sm" onClick={() => deleteLesson(l.id)}>
                          Supprimer
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ════════════════════════════════════════
          ÉTUDIANTS
      ════════════════════════════════════════ */}
      {tab === 'students' && (
        <div>
          <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 14, color: 'var(--text-muted)', fontWeight: 600 }}>
              {students.length} étudiant{students.length > 1 ? 's' : ''} inscrit{students.length > 1 ? 's' : ''}
            </span>
          </div>
          {students.length === 0 ? (
            <div className="empty-state">
              <h3>Aucun étudiant inscrit</h3>
              <p>Les étudiants s'inscrivent via leur classe ou par l'administrateur.</p>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12 }}>
              {students.map(s => (
                <div key={s.id} className="card">
                  <div className="card-body" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ width: 42, height: 42, borderRadius: '50%', flexShrink: 0, background: '#eff6ff', color: 'var(--blue)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 14 }}>
                      {s.name?.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--navy)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{s.email}</div>
                      {s.progress_pct !== undefined && (
                        <div style={{ marginTop: 6 }}>
                          <div style={{ height: 4, background: '#f1f5f9', borderRadius: 4, overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: `${Math.round(s.progress_pct || 0)}%`, background: s.progress_pct === 100 ? '#22c55e' : '#3b82f6', borderRadius: 4 }} />
                          </div>
                          <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>{Math.round(s.progress_pct || 0)}% complété</div>
                        </div>
                      )}
                    </div>
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
              <button className="btn btn-primary btn-sm" onClick={() => {
                setHwForm({ title: '', description: '', due_date: '', max_score: 20, is_published: false })
                setHwFile(null)
                setHwModal(true)
              }}>
                + Créer un devoir
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
                      {canManage && <span style={{ marginLeft: 8 }}>· {hw.submission_count || 0} soumission(s)</span>}
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
                  <div style={{ display: 'flex', gap: 6 }}>
                    {isStudent && (
                      <button className="btn btn-outline btn-sm" onClick={() => navigate(`/homeworks?course=${id}`)}>
                        Soumettre
                      </button>
                    )}
                    {canManage && (
                      <button className="btn btn-danger btn-sm" onClick={() => deleteHomework(hw.id)}>Supprimer</button>
                    )}
                  </div>
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
                <span style={{ fontSize: 11, padding: '2px 10px', borderRadius: 20, fontWeight: 600, background: s.is_active ? '#d1fae5' : '#f1f5f9', color: s.is_active ? '#065f46' : '#64748b' }}>
                  {s.is_active ? '🔴 En direct' : s.ended_at ? 'Terminé' : 'Planifié'}
                </span>
                <div style={{ display: 'flex', gap: 6 }}>
                  {!s.is_active && !s.ended_at && canManage && (
                    <button className="btn btn-primary btn-sm" disabled={busySessionId === s.id} onClick={() => startSession(s)}>🔴 Démarrer le live</button>
                  )}
                  {s.is_active && (
                    <>
                      <button className="btn btn-primary btn-sm" onClick={() => openLiveRoom(navigate, s)}>Rejoindre</button>
                      {canManage && <button className="btn btn-outline btn-sm" disabled={busySessionId === s.id} onClick={() => endSession(s)}>⏹ Terminer et sauvegarder</button>}
                    </>
                  )}
                  {canManage && (
                    <button className="btn btn-danger btn-sm" onClick={() => deleteSession(s)}>Supprimer</button>
                  )}
                </div>
              </div>
              {(!canManage && (s.is_active || s.recording_url)) && <LiveReplayPlayer session={s} />}
              {canManage && s.recording_url && !s.is_active && (
                <div style={{ marginTop: 10, fontSize: 13, color: 'var(--text-muted)' }}>
                  Rediffusion : <a href={s.recording_url} target="_blank" rel="noreferrer">ouvrir sur YouTube</a>
                </div>
              )}
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

                {/* ── Option A : URL YouTube ── */}
                <div className="form-group">
                  <label className="form-label">
                    ▶️ URL YouTube
                    <span style={{ marginLeft: 6, fontSize: 11, color: 'var(--text-muted)', fontWeight: 400 }}>
                      — collez le lien de la vidéo
                    </span>
                  </label>
                  <input className="form-input"
                    value={lessonForm.youtube_url}
                    onChange={e => setLessonForm({ ...lessonForm, youtube_url: e.target.value })}
                    placeholder="https://www.youtube.com/watch?v=..."
                  />
                </div>

                {/* Séparateur OU */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '4px 0 8px' }}>
                  <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
                  <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>OU</span>
                  <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
                </div>

                {/* ── Option B : Fichier ── */}
                {!lessonForm.youtube_url.trim() && (
                  <div className="form-group">
                    <label className="form-label">
                      📁 Fichier (PDF ou Vidéo)
                      <span style={{ marginLeft: 6, fontSize: 11, color: 'var(--text-muted)', fontWeight: 400 }}>
                        — si pas d'URL YouTube
                      </span>
                    </label>
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
                          <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>{(lessonFile.size / 1024 / 1024).toFixed(1)} MB</p>
                        </>
                      ) : (
                        <>
                          <div style={{ fontWeight: 600, marginTop: 8 }}>Glisser-déposer ou cliquer</div>
                          <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>PDF, MP4, WebM acceptés</p>
                        </>
                      )}
                      <input ref={fileRef} type="file" accept=".pdf,video/*" style={{ display: 'none' }}
                        onChange={e => setLessonFile(e.target.files[0])} />
                    </div>
                  </div>
                )}

                {/* Résumé si URL YouTube saisie */}
                {lessonForm.youtube_url.trim() && (
                  <div style={{ padding: '10px 14px', borderRadius: 10, background: '#fee2e2', border: '1px solid #fca5a5', fontSize: 13, color: '#991b1b', display: 'flex', alignItems: 'center', gap: 8 }}>
                    ▶️ Leçon YouTube — aucun upload requis
                  </div>
                )}

                {uploading && <div className="alert alert-info">Upload en cours...</div>}
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-outline" onClick={() => setUploadModal(false)}>Annuler</button>
                <button type="submit" className="btn btn-primary" disabled={uploading}>
                  {uploading ? 'Upload...' : 'Ajouter la leçon'}
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

      {/* ════════════════════════════════════════
          MODAL MODIFIER LE COURS
      ════════════════════════════════════════ */}
      {editModal && (
        <div className="modal-overlay" onClick={() => setEditModal(false)}>
          <div className="modal" style={{ maxWidth: 560, width: '95vw', maxHeight: '92vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">✏️ Modifier le cours</span>
              <button className="modal-close" onClick={() => setEditModal(false)}>×</button>
            </div>
            <form onSubmit={saveCourse}>
              <div className="modal-body">
                <div className="form-group">
                  <label className="form-label">
                    Image du cours
                    <span style={{ marginLeft: 6, fontSize: 11, color: 'var(--text-muted)', fontWeight: 400 }}>— JPG · PNG · WEBP · max 5 MB</span>
                  </label>
                  <div onClick={() => editThumbRef.current.click()} style={{ height: editThumbPrev ? 180 : 110, borderRadius: 12, border: `2px dashed ${editThumbPrev ? '#22c55e' : '#e2e8f0'}`, background: '#f8fafc', cursor: 'pointer', overflow: 'hidden', position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all .2s' }}>
                    {editThumbPrev ? (
                      <>
                        <img src={editThumbPrev} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0, transition: 'opacity .2s' }}
                          onMouseEnter={e => e.currentTarget.style.opacity = 1}
                          onMouseLeave={e => e.currentTarget.style.opacity = 0}>
                          <span style={{ color: '#fff', fontWeight: 700 }}>Changer l'image</span>
                        </div>
                      </>
                    ) : (
                      <div style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: 28, marginBottom: 6 }}>🖼️</div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--navy)' }}>Cliquer pour ajouter une image</div>
                      </div>
                    )}
                    <input ref={editThumbRef} type="file" accept="image/*" style={{ display: 'none' }}
                      onChange={e => {
                        const f = e.target.files[0]
                        if (!f) return
                        setEditThumb(f)
                        const r = new FileReader()
                        r.onload = ev => setEditThumbPrev(ev.target.result)
                        r.readAsDataURL(f)
                      }} />
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">Titre *</label>
                  <input className="form-input" required value={editForm.title}
                    onChange={e => setEditForm(f => ({ ...f, title: e.target.value }))}
                    placeholder="Titre du cours" />
                </div>

                <div className="form-group">
                  <label className="form-label">Description</label>
                  <textarea className="form-input" rows={3} value={editForm.description}
                    onChange={e => setEditForm(f => ({ ...f, description: e.target.value }))}
                    style={{ resize: 'vertical' }} />
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Enseignant</label>
                    <select className="form-select" value={editForm.teacher_id}
                      onChange={e => setEditForm(f => ({ ...f, teacher_id: e.target.value }))}>
                      <option value="">-- Choisir --</option>
                      {allTeachers.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Catégorie</label>
                    <select className="form-select" value={editForm.category_id}
                      onChange={e => setEditForm(f => ({ ...f, category_id: e.target.value }))}>
                      <option value="">Sans catégorie</option>
                      {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">Statut</label>
                  <select className="form-select" value={String(editForm.is_published)}
                    onChange={e => setEditForm(f => ({ ...f, is_published: e.target.value === 'true' }))}>
                    <option value="true">Publié</option>
                    <option value="false">Brouillon</option>
                  </select>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-outline" onClick={() => setEditModal(false)}>Annuler</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? 'Enregistrement...' : 'Enregistrer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════
          MODAL CRÉER UN DEVOIR
      ════════════════════════════════════════ */}
      {hwModal && (
        <div className="modal-overlay" onClick={() => { setHwModal(false); setHwFile(null) }}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">Nouveau devoir — {course.title}</span>
              <button className="modal-close" onClick={() => { setHwModal(false); setHwFile(null) }}>×</button>
            </div>
            <form onSubmit={createHomework}>
              <div className="modal-body">
                <div className="form-group">
                  <label className="form-label">Titre *</label>
                  <input className="form-input" required value={hwForm.title}
                    onChange={e => setHwForm(f => ({ ...f, title: e.target.value }))}
                    placeholder="Ex : TP Série 1 — Cinématique" />
                </div>
                <div className="form-group">
                  <label className="form-label">Description / Consignes</label>
                  <textarea className="form-input" rows={3} value={hwForm.description}
                    onChange={e => setHwForm(f => ({ ...f, description: e.target.value }))}
                    placeholder="Décrivez les attentes, le barème..." style={{ resize: 'vertical' }} />
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Date limite *</label>
                    <input className="form-input" type="datetime-local" required value={hwForm.due_date}
                      onChange={e => setHwForm(f => ({ ...f, due_date: e.target.value }))} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Note maximale</label>
                    <input className="form-input" type="number" min={1} max={100} value={hwForm.max_score}
                      onChange={e => setHwForm(f => ({ ...f, max_score: e.target.value }))} />
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">
                    Fichier joint
                    <span style={{ marginLeft: 6, fontSize: 11, color: 'var(--text-muted)', fontWeight: 400 }}>— optionnel (PDF, Word, ZIP…)</span>
                  </label>
                  <div
                    style={{ border: `2px dashed ${hwFile ? 'var(--blue)' : 'var(--border)'}`, borderRadius: 10, padding: '16px', textAlign: 'center', cursor: 'pointer', background: hwDragOver ? '#eff6ff' : hwFile ? '#f0fdf4' : '#fafafa', transition: 'all .15s' }}
                    onDragOver={e => { e.preventDefault(); setHwDragOver(true) }}
                    onDragLeave={() => setHwDragOver(false)}
                    onDrop={e => { e.preventDefault(); setHwDragOver(false); const f = e.dataTransfer.files[0]; if (f) setHwFile(f) }}
                    onClick={() => hwFileRef.current.click()}
                  >
                    {hwFile ? (
                      <>
                        <div style={{ fontSize: 24, marginBottom: 4 }}>📎</div>
                        <div style={{ fontWeight: 600, fontSize: 13 }}>{hwFile.name}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{(hwFile.size/1024/1024).toFixed(2)} MB</div>
                        <button type="button" onClick={e => { e.stopPropagation(); setHwFile(null) }}
                          style={{ marginTop: 6, fontSize: 11, color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>
                          Supprimer
                        </button>
                      </>
                    ) : (
                      <>
                        <div style={{ fontSize: 24, marginBottom: 4 }}>📁</div>
                        <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--navy)' }}>Glisser-déposer ou cliquer</div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>PDF, DOCX, ZIP, PNG — max 50 MB</div>
                      </>
                    )}
                    <input ref={hwFileRef} type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,.zip,.png,.jpg,.jpeg,.pptx,.txt"
                      style={{ display: 'none' }} onChange={e => { if (e.target.files[0]) setHwFile(e.target.files[0]) }} />
                  </div>
                </div>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, cursor: 'pointer' }}>
                  <input type="checkbox" checked={hwForm.is_published}
                    onChange={e => setHwForm(f => ({ ...f, is_published: e.target.checked }))} />
                  Publier immédiatement (visible par les étudiants)
                </label>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-outline" onClick={() => { setHwModal(false); setHwFile(null) }}>Annuler</button>
                <button type="submit" className="btn btn-primary">Créer le devoir</button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  )
}
