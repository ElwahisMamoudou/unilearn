import { useEffect, useState, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../api/client'
import useAuthStore from '../store/authStore'

const BACKEND = (import.meta.env.VITE_API_URL || '').replace(/\/api\/?$/, '')
const thumbUrl = path => {
  if (!path) return null
  if (path.startsWith('http')) return path
  const clean = path.replace(/\\/g, '/').replace(/^\/+/, '')
  return BACKEND ? `${BACKEND}/${clean}` : `/${clean}`
}

const CAT_GRADIENTS = [
  ['#1e3a5f','#0ea5e9'],['#1a2e1a','#22c55e'],['#2e1a1a','#ef4444'],
  ['#2e2a1a','#f59e0b'],['#1a1a2e','#8b5cf6'],['#1a2e2e','#14b8a6'],
]
const catGrad = id => CAT_GRADIENTS[(id || 0) % CAT_GRADIENTS.length]
const catIcon = (name = '') => {
  const l = name.toLowerCase()
  if (l.includes('info') || l.includes('prog')) return '💻'
  if (l.includes('math')) return '📐'
  if (l.includes('phys')) return '⚛️'
  if (l.includes('chim')) return '🧪'
  if (l.includes('meca') || l.includes('tim')) return '⚙️'
  if (l.includes('elec')) return '⚡'
  if (l.includes('bio')) return '🧬'
  return '📚'
}

export default function TeacherDashboard() {
  const { user }  = useAuthStore()
  const navigate  = useNavigate()

  const [courses,  setCourses]  = useState([])
  const [loading,  setLoading]  = useState(true)
  const [msg,      setMsg]      = useState({ text: '', type: '' })

  /* ── Leçons ── */
  const [selCourse,    setSelCourse]    = useState(null)
  const [lessons,      setLessons]      = useState([])
  const [uploadModal,  setUploadModal]  = useState(false)
  const [lessonForm,   setLessonForm]   = useState({ title: '', duration: '', order: 0 })
  const [lessonFile,   setLessonFile]   = useState(null)
  const [uploading,    setUploading]    = useState(false)
  const [dragOver,     setDragOver]     = useState(false)
  const fileRef = useRef()

  /* ── Session ── */
  const [sessionModal, setSessionModal] = useState(false)
  const [sessionCourse,setSessionCourse]= useState(null)
  const [sessionForm,  setSessionForm]  = useState({ title: '', scheduled_at: '' })

  const flash = useCallback((text, type = 'success') => {
    setMsg({ text, type })
    setTimeout(() => setMsg({ text: '', type: '' }), 3500)
  }, [])

  const load = useCallback(() => {
    setLoading(true)
    api.get('/courses/my')
      .then(r => { setCourses(r.data); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  /* ── Ouvrir les leçons d'un cours ── */
  const openCourse = async (c) => {
    if (selCourse?.id === c.id) { setSelCourse(null); return }
    try {
      const r = await api.get(`/courses/${c.id}/lessons`)
      setLessons(r.data)
      setSelCourse(c)
    } catch { setLessons([]); setSelCourse(c) }
  }

  /* ── Upload leçon ── */
  const uploadLesson = async e => {
    e.preventDefault()
    if (!lessonFile) return flash('Sélectionnez un fichier', 'error')
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('course_id', selCourse.id)
      fd.append('title',     lessonForm.title)
      fd.append('duration',  lessonForm.duration)
      fd.append('order',     lessonForm.order)
      fd.append('file',      lessonFile)
      await api.post('/lessons/upload', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
      flash('Leçon ajoutée !')
      setUploadModal(false)
      setLessonForm({ title: '', duration: '', order: 0 })
      setLessonFile(null)
      const r = await api.get(`/courses/${selCourse.id}/lessons`)
      setLessons(r.data)
      load()
    } catch (err) {
      flash(err.response?.data?.detail || 'Erreur upload', 'error')
    } finally { setUploading(false) }
  }

  const deleteLesson = async (lessonId) => {
    if (!confirm('Supprimer cette leçon ?')) return
    await api.delete(`/lessons/${lessonId}`)
    flash('Leçon supprimée')
    const r = await api.get(`/courses/${selCourse.id}/lessons`)
    setLessons(r.data)
    load()
  }

  /* ── Session ── */
  const createSession = async e => {
    e.preventDefault()
    try {
      const r = await api.post('/sessions', {
        course_id:    parseInt(sessionCourse.id),
        title:        sessionForm.title,
        scheduled_at: sessionForm.scheduled_at ? new Date(sessionForm.scheduled_at).toISOString() : null,
      })
      flash('Session créée !')
      setSessionModal(false)
      setSessionForm({ title: '', scheduled_at: '' })
      navigate(`/courses/${sessionCourse.id}?tab=sessions`)
    } catch (err) {
      flash(err.response?.data?.detail || 'Erreur', 'error')
    }
  }

  if (loading) return <div className="loading-overlay"><div className="spinner" /></div>

  const totalLessons   = courses.reduce((s, c) => s + (c.lesson_count || 0), 0)
  const publishedCount = courses.filter(c => c.is_published).length

  return (
    <>
      {msg.text && (
        <div className={`alert alert-${msg.type === 'error' ? 'error' : 'success'}`} style={{ marginBottom: 16 }}>
          {msg.text}
        </div>
      )}

      {/* ── En-tête ── */}
      <div style={{
        background: 'linear-gradient(135deg, var(--navy), #1a3a6e)',
        borderRadius: 16, padding: '24px 28px', marginBottom: 24,
        color: '#fff', display: 'flex', alignItems: 'center', gap: 18,
        flexWrap: 'wrap',
      }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,.5)', letterSpacing: 2, textTransform: 'uppercase', marginBottom: 6 }}>
            Espace Enseignant
          </div>
          <h2 style={{ fontFamily: 'Playfair Display, serif', fontSize: 22, margin: 0 }}>
            Bonjour, {user?.name?.split(' ')[0]} 👋
          </h2>
          <div style={{ opacity: .6, fontSize: 12, marginTop: 4 }}>
            Gérez vos cours, leçons et sessions en ligne
          </div>
        </div>
        <div style={{ display: 'flex', gap: 24 }}>
          {[
            ['Cours assignés', courses.length],
            ['Publiés',        publishedCount],
            ['Leçons total',   totalLessons],
          ].map(([l, v]) => (
            <div key={l} style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 24, fontWeight: 800 }}>{v}</div>
              <div style={{ fontSize: 11, opacity: .55 }}>{l}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Grille de cours ── */}
      {courses.length === 0 ? (
        <div className="empty-state">
          <div style={{ fontSize: 52, marginBottom: 12 }}>📭</div>
          <h3>Aucun cours assigné</h3>
          <p>L'administrateur ne vous a pas encore assigné de cours.</p>
        </div>
      ) : (
        <>
          <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--navy)', marginBottom: 16 }}>
            Mes cours ({courses.length})
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 20 }}>
            {courses.map(c => {
              const thumb = thumbUrl(c.thumbnail)
              const [g0, g1] = catGrad(c.category_id || c.id)
              const icon = catIcon(c.category?.name || c.title)
              const expanded = selCourse?.id === c.id

              return (
                <div key={c.id} style={{
                  borderRadius: 18, overflow: 'hidden',
                  border: expanded ? '2px solid var(--blue)' : '1px solid var(--border)',
                  background: '#fff',
                  boxShadow: expanded ? '0 8px 32px rgba(59,130,246,.15)' : '0 4px 16px rgba(15,31,61,.06)',
                  transition: 'all .22s cubic-bezier(.175,.885,.32,1.275)',
                  display: 'flex', flexDirection: 'column',
                }}
                  onMouseEnter={e => { if (!expanded) { e.currentTarget.style.transform = 'translateY(-4px)'; e.currentTarget.style.boxShadow = '0 12px 32px rgba(59,130,246,.14)' } }}
                  onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = expanded ? '0 8px 32px rgba(59,130,246,.15)' : '0 4px 16px rgba(15,31,61,.06)' }}
                >
                  {/* ── IMAGE ── */}
                  <div style={{ height: 200, position: 'relative', overflow: 'hidden', flexShrink: 0 }}>
                    <div style={{
                      position: 'absolute', inset: 0,
                      background: thumb
                        ? `url(${thumb}) center/cover no-repeat`
                        : `linear-gradient(145deg, ${g0} 0%, ${g1} 100%)`,
                    }} />
                    <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(0,0,0,.65) 0%, transparent 55%)' }} />
                    {!thumb && (
                      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 70, filter: 'drop-shadow(0 4px 12px rgba(0,0,0,.3))' }}>
                        {icon}
                      </div>
                    )}
                    {/* Badge statut */}
                    <div style={{ position: 'absolute', top: 12, right: 12, background: c.is_published ? 'rgba(34,197,94,.9)' : 'rgba(245,158,11,.9)', color: '#fff', fontSize: 10, fontWeight: 800, padding: '4px 10px', borderRadius: 20 }}>
                      {c.is_published ? '✓ PUBLIÉ' : '✏ BROUILLON'}
                    </div>
                    {/* Titre sur image */}
                    <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '12px 16px' }}>
                      <div style={{ fontWeight: 800, fontSize: 15, color: '#fff', textShadow: '0 2px 8px rgba(0,0,0,.5)', lineHeight: 1.3 }}>{c.title}</div>
                    </div>
                  </div>

                  {/* ── INFOS ── */}
                  <div style={{ padding: '14px 16px', flex: 1, display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <div style={{ display: 'flex', gap: 14, fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>
                      <span>📖 {c.lesson_count || 0} leçon(s)</span>
                      <span>👥 {c.student_count || 0} étudiant(s)</span>
                      {c.category?.name && <span>🏷 {c.category.name}</span>}
                    </div>

                    {/* ── ACTIONS (une seule rangée propre) ── */}
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button
                        className="btn btn-primary btn-sm"
                        style={{ flex: 1 }}
                        onClick={() => navigate(`/courses/${c.id}`)}
                      >
                        Voir le cours →
                      </button>
                      <button
                        className="btn btn-outline btn-sm"
                        onClick={() => openCourse(c)}
                        title="Voir / gérer les leçons"
                      >
                        {expanded ? 'Fermer' : '📖 Leçons'}
                      </button>
                      <button
                        className="btn btn-outline btn-sm"
                        onClick={() => {
                          setSelCourse(c)
                          setLessonForm({ title: '', duration: '', order: c.lesson_count || 0 })
                          setLessonFile(null)
                          setUploadModal(true)
                          if (selCourse?.id !== c.id) openCourse(c)
                        }}
                        title="Ajouter une leçon"
                      >
                        +
                      </button>
                      <button
                        className="btn btn-outline btn-sm"
                        onClick={() => { setSessionCourse(c); setSessionForm({ title: '', scheduled_at: '' }); setSessionModal(true) }}
                        title="Démarrer un cours en ligne"
                      >
                        🎥
                      </button>
                    </div>
                  </div>

                  {/* ── LEÇONS EXPANDÉES ── */}
                  {expanded && (
                    <div style={{ borderTop: '1px solid var(--border)', padding: '12px 16px', background: '#f8fafc' }}>
                      {lessons.length === 0 ? (
                        <div style={{ fontSize: 13, color: 'var(--text-muted)', padding: '4px 0' }}>
                          Aucune leçon. Cliquez "+" pour ajouter.
                        </div>
                      ) : lessons.map((l, i) => (
                        <div key={l.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 0', borderBottom: i < lessons.length - 1 ? '1px solid var(--border)' : 'none' }}>
                          <div style={{ width: 26, height: 26, borderRadius: 6, flexShrink: 0, background: l.type === 'pdf' ? '#dbeafe' : '#dcfce7', color: l.type === 'pdf' ? '#1d4ed8' : '#16a34a', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700 }}>
                            {i + 1}
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--navy)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.title}</div>
                            <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{l.type === 'pdf' ? 'PDF' : 'Vidéo'}{l.duration ? ` · ${l.duration}` : ''}</div>
                          </div>
                          <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 10, background: l.file_path ? '#dcfce7' : '#fee2e2', color: l.file_path ? '#16a34a' : '#991b1b', flexShrink: 0 }}>
                            {l.file_path ? '✓' : '⚠'}
                          </span>
                          {l.file_path && (
                            <button className="btn btn-outline btn-sm" style={{ fontSize: 10, padding: '2px 8px' }}
                              onClick={() => navigate(`/lesson/${l.id}`)}>
                              Aperçu
                            </button>
                          )}
                          <button className="btn btn-danger btn-sm" style={{ fontSize: 10, padding: '2px 6px' }}
                            onClick={() => deleteLesson(l.id)}>
                            ×
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </>
      )}

      {/* ══ MODAL UPLOAD LEÇON ══ */}
      {uploadModal && (
        <div className="modal-overlay" onClick={() => setUploadModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">Ajouter une leçon — {selCourse?.title}</span>
              <button className="modal-close" onClick={() => setUploadModal(false)}>×</button>
            </div>
            <form onSubmit={uploadLesson}>
              <div className="modal-body">
                <div className="form-group">
                  <label className="form-label">Titre *</label>
                  <input className="form-input" required value={lessonForm.title}
                    onChange={e => setLessonForm({ ...lessonForm, title: e.target.value })}
                    placeholder="Ex : Introduction à la cinématique" />
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Durée estimée</label>
                    <input className="form-input" value={lessonForm.duration}
                      onChange={e => setLessonForm({ ...lessonForm, duration: e.target.value })}
                      placeholder="Ex : 45 min" />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Ordre</label>
                    <input className="form-input" type="number" min={0} value={lessonForm.order}
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
                {uploading && <div className="alert alert-info">Upload en cours...</div>}
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

      {/* ══ MODAL SESSION ══ */}
      {sessionModal && (
        <div className="modal-overlay" onClick={() => setSessionModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">🎥 Cours en ligne — {sessionCourse?.title}</span>
              <button className="modal-close" onClick={() => setSessionModal(false)}>×</button>
            </div>
            <form onSubmit={createSession}>
              <div className="modal-body">
                <div className="form-group">
                  <label className="form-label">Titre de la session *</label>
                  <input className="form-input" required value={sessionForm.title}
                    onChange={e => setSessionForm({ ...sessionForm, title: e.target.value })}
                    placeholder="Ex : Cours du 15 mai" />
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
    </>
  )
}
