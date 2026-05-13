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


function CourseCard({ c, expanded, lessons, onOpen, onAddLesson, onSession, onDelete, navigate }) {
  const gradient = catGrad(c.category?.id || c.id || 0)
  const thumbnail = thumbUrl(c.thumbnail)

  return (
    <div className="card" style={{ overflow: 'hidden', border: '1px solid var(--border)' }}>
      <div
        onClick={onOpen}
        style={{ cursor: 'pointer' }}
      >
        <div style={{
          height: 110,
          background: thumbnail
            ? `linear-gradient(135deg, rgba(15,31,61,.25), rgba(15,31,61,.45)), url(${thumbnail}) center/cover`
            : `linear-gradient(135deg, ${gradient[0]}, ${gradient[1]})`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#fff', fontSize: 34, fontWeight: 800,
        }}>
          {!thumbnail && catIcon(c.category?.name)}
        </div>
        <div className="card-body" style={{ padding: 16 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 800, color: 'var(--navy)', marginBottom: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {c.title}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <span>{c.lesson_count || 0} leçon(s)</span>
                {c.category?.name && <span>· {c.category.name}</span>}
                <span>· {c.is_published ? 'Publié' : 'Brouillon'}</span>
              </div>
            </div>
            <span style={{ fontSize: 18, color: 'var(--text-muted)' }}>{expanded ? '▴' : '▾'}</span>
          </div>

          {c.description && (
            <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '10px 0 0', lineHeight: 1.45 }}>
              {c.description.length > 110 ? `${c.description.slice(0, 110)}…` : c.description}
            </p>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, padding: '0 16px 16px', flexWrap: 'wrap' }}>
        <button className="btn btn-primary btn-sm" onClick={e => { e.stopPropagation(); onAddLesson() }}>
          + Leçon
        </button>
        <button className="btn btn-outline btn-sm" onClick={e => { e.stopPropagation(); onSession() }}>
          🎥 Direct
        </button>
        <button className="btn btn-outline btn-sm" onClick={e => { e.stopPropagation(); navigate(`/courses/${c.id}`) }}>
          Ouvrir
        </button>
      </div>

      {expanded && (
        <div style={{ borderTop: '1px solid var(--border)', padding: 14, background: '#f8fafc' }}>
          {lessons.length === 0 ? (
            <div style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', padding: 12 }}>
              Aucune leçon pour ce cours.
            </div>
          ) : lessons.map(l => (
            <div key={l.id} style={{
              display: 'flex', alignItems: 'center', gap: 10,
              background: '#fff', border: '1px solid var(--border)', borderRadius: 10,
              padding: '9px 10px', marginBottom: 8,
            }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--navy)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {l.title}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{l.duration || 'Durée non précisée'}</div>
              </div>
              <button className="btn btn-outline btn-sm" onClick={() => navigate(`/lesson/${l.id}`)}>Voir</button>
              <button className="btn btn-danger btn-sm" onClick={() => onDelete(l.id)}>🗑️</button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default function TeacherDashboard() {
  const { user }  = useAuthStore()
  const navigate  = useNavigate()

  const [courses,  setCourses]  = useState([])
  const [grouped,  setGrouped]  = useState({ byClass: [], noClass: [] })
  const [loading,  setLoading]  = useState(true)
  const [msg,      setMsg]      = useState({ text: '', type: '' })

  /* ── Leçons ── */
  const [selCourse,    setSelCourse]    = useState(null)
  const [lessons,      setLessons]      = useState([])
  const [uploadModal,  setUploadModal]  = useState(false)
  const [lessonForm,   setLessonForm]   = useState({ title: '', description: '', duration: '', order: 0 })
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
      .then(r => {
        // Grouper les cours par classe
        const grouped = {}
        const noClass = []
        r.data.forEach(c => {
          if (c.class_group_id) {
            if (!grouped[c.class_group_id]) {
              grouped[c.class_group_id] = {
                class_group_id:   c.class_group_id,
                class_group_name: c.class_group_name || `Classe #${c.class_group_id}`,
                courses: [],
              }
            }
            grouped[c.class_group_id].courses.push(c)
          } else {
            noClass.push(c)
          }
        })
        setCourses(r.data)
        setGrouped({ byClass: Object.values(grouped), noClass })
        setLoading(false)
      })
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
      fd.append('description', lessonForm.description)
      fd.append('duration',    lessonForm.duration)
      fd.append('order',       Number.isNaN(parseInt(lessonForm.order)) ? 0 : parseInt(lessonForm.order))
      fd.append('file',      lessonFile)
      await api.post('/lessons/upload', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
      flash('Leçon ajoutée !')
      setUploadModal(false)
      setLessonForm({ title: '', description: '', duration: '', order: 0 })
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

      {/* ── Cours groupés par classe ── */}
      {courses.length === 0 ? (
        <div className="empty-state">
          <div style={{ fontSize: 52, marginBottom: 12 }}>📭</div>
          <h3>Aucun cours assigné</h3>
          <p>L'administrateur ne vous a pas encore assigné de cours.</p>
        </div>
      ) : (
        <>
          {/* Classes avec cours */}
          {grouped.byClass.map(grp => (
            <div key={grp.class_group_id} style={{ marginBottom: 36 }}>
              {/* En-tête de la classe */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 38, height: 38, borderRadius: 10, background: 'linear-gradient(135deg, #1e3a5f, #0ea5e9)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>🎓</div>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 16, color: 'var(--navy)' }}>{grp.class_group_name}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{grp.courses.length} cours · {grp.courses.reduce((s, c) => s + (c.lesson_count || 0), 0)} leçons</div>
                  </div>
                </div>
                <button
                  className="btn btn-outline btn-sm"
                  onClick={() => navigate(`/classes/${grp.class_group_id}`)}
                >
                  Voir la classe →
                </button>
              </div>

              {/* Cartes des cours de cette classe */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 18 }}>
                {grp.courses.map(c => <CourseCard key={c.id} c={c} expanded={selCourse?.id === c.id} lessons={selCourse?.id === c.id ? lessons : []} onOpen={() => openCourse(c)} onAddLesson={() => { setSelCourse(c); setLessonForm({ title: '', description: '', duration: '', order: c.lesson_count || 0 }); setLessonFile(null); setUploadModal(true); }} onSession={() => { setSessionCourse(c); setSessionForm({ title: '', scheduled_at: '' }); setSessionModal(true) }} onDelete={deleteLesson} navigate={navigate} />)}
              </div>
            </div>
          ))}

          {/* Cours sans classe assignée */}
          {grouped.noClass.length > 0 && (
            <div style={{ marginBottom: 36 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                <div style={{ width: 38, height: 38, borderRadius: 10, background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>📚</div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 16, color: 'var(--navy)' }}>Cours sans classe</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{grouped.noClass.length} cours non associés à une classe</div>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 18 }}>
                {grouped.noClass.map(c => <CourseCard key={c.id} c={c} expanded={selCourse?.id === c.id} lessons={selCourse?.id === c.id ? lessons : []} onOpen={() => openCourse(c)} onAddLesson={() => { setSelCourse(c); setLessonForm({ title: '', description: '', duration: '', order: c.lesson_count || 0 }); setLessonFile(null); setUploadModal(true); }} onSession={() => { setSessionCourse(c); setSessionForm({ title: '', scheduled_at: '' }); setSessionModal(true) }} onDelete={deleteLesson} navigate={navigate} />)}
              </div>
            </div>
          )}
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
                <div className="form-group">
                  <label className="form-label">Description</label>
                  <textarea className="form-input" rows={3} value={lessonForm.description}
                    onChange={e => setLessonForm({ ...lessonForm, description: e.target.value })}
                    placeholder="Résumé ou consignes de la leçon"
                    style={{ resize: 'vertical' }} />
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
                        <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>PDF, MP4, WebM, OGG, MPEG ou MOV acceptés</p>
                      </>
                    )}
                    <input ref={fileRef} type="file" accept=".pdf,.mp4,.webm,.ogg,.mpeg,.mpg,.mov,video/*" style={{ display: 'none' }}
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
