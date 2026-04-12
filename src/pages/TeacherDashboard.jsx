import { useEffect, useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../api/client'
import useAuthStore from '../store/authStore'

export default function TeacherDashboard() {
  const { user }  = useAuthStore()
  const navigate  = useNavigate()
  const [courses, setCourses]       = useState([])
  const [loading, setLoading]       = useState(true)
  const [showUpload, setShowUpload] = useState(null)  // course_id
  const [msg, setMsg]               = useState({ text: '', type: '' })

  // Formulaire leçon
  const [lessonForm, setLessonForm] = useState({ title: '', duration: '', order: 0 })
  const [file, setFile]             = useState(null)
  const [uploading, setUploading]   = useState(false)
  const [dragOver, setDragOver]     = useState(false)
  const fileRef = useRef()

  const flash = (text, type = 'success') => {
    setMsg({ text, type })
    setTimeout(() => setMsg({ text: '', type: '' }), 3500)
  }

  const load = () => {
    // L'enseignant récupère uniquement ses cours assignés
    api.get('/courses/my').then(r => {
      setCourses(r.data)
      setLoading(false)
    }).catch(() => setLoading(false))
  }

  useEffect(load, [])

  /* ── Uploader une leçon ── */
  const uploadLesson = async e => {
    e.preventDefault()
    if (!file) return flash('Sélectionnez un fichier', 'error')
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('course_id', showUpload)
      fd.append('title',       lessonForm.title)
      fd.append('duration',    lessonForm.duration)
      fd.append('order',       lessonForm.order)
      fd.append('file',        file)
      await api.post('/lessons/upload', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      flash('✅ Leçon ajoutée !')
      setShowUpload(null)
      setLessonForm({ title: '', duration: '', order: 0 })
      setFile(null)
      load()
    } catch (err) {
      flash(err.response?.data?.detail || 'Erreur upload', 'error')
    } finally {
      setUploading(false)
    }
  }

  const handleDrop = e => {
    e.preventDefault(); setDragOver(false)
    const f = e.dataTransfer.files[0]
    if (f) setFile(f)
  }

  if (loading) return <div className="loading-overlay"><div className="spinner" /></div>

  return (
    <>
      {msg.text && (
        <div className={`alert alert-${msg.type === 'error' ? 'error' : 'success'}`}>{msg.text}</div>
      )}

      {/* Stats enseignant */}
      <div className="stats-grid" style={{ marginBottom: 28 }}>
        {[
          { label: 'Cours assignés',  value: courses.length,                                  cls: 'stat-blue'  },
          { label: 'Publiés',         value: courses.filter(c => c.is_published).length,       cls: 'stat-green' },
          { label: 'Total leçons',    value: courses.reduce((s, c) => s + c.lesson_count, 0), cls: 'stat-gold'  },
          { label: 'Étudiants (est.)',value: '—',                                              cls: 'stat-navy'  },
        ].map((s, i) => (
          <div key={i} className={`stat-card ${s.cls}`}>
            <div className="stat-label">{s.label}</div>
            <div className="stat-value">{s.value}</div>
          </div>
        ))}
      </div>

      <div className="section-header">
        <span className="section-title">Mes cours assignés</span>
      </div>

      {/* Message si aucun cours assigné */}
      {courses.length === 0 ? (
        <div className="empty-state">
          <div className="icon">📭</div>
          <h3>Aucun cours assigné</h3>
          <p>L'administrateur ne vous a pas encore assigné de cours.</p>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 8 }}>
            Contactez l'administrateur pour qu'il vous assigne un cours.
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {courses.map(c => (
            <div key={c.id} className="card">
              <div className="card-body">
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: 15, color: 'var(--navy)' }}>{c.title}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
                      {c.lesson_count} leçon{c.lesson_count > 1 ? 's' : ''} ·{' '}
                      {c.category?.name || 'Sans catégorie'} ·{' '}
                      <span style={{ color: c.is_published ? 'var(--success)' : 'var(--text-muted)', fontWeight: 600 }}>
                        {c.is_published ? '✅ Publié' : '⏸ Brouillon'}
                      </span>
                    </div>
                    {c.description && (
                      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6, lineHeight: 1.5 }}>
                        {c.description}
                      </div>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                    {/* Voir le cours */}
                    <button
                      className="btn btn-outline btn-sm"
                      onClick={() => navigate(`/courses/${c.id}`)}>
                      👁 Voir
                    </button>
                    {/* Ajouter une leçon */}
                    <button
                      className="btn btn-outline btn-sm"
                      onClick={() => {
                        setShowUpload(c.id)
                        setLessonForm({ title: '', duration: '', order: c.lesson_count })
                      }}>
                      📤 Ajouter une leçon
                    </button>
                    {/* Démarrer un cours en ligne */}
                    <button
                      className="btn btn-primary btn-sm"
                      onClick={() => navigate(`/courses/${c.id}?tab=sessions`)}>
                      🎥 Cours en ligne
                    </button>
                  </div>
                </div>

                {/* Liste des leçons du cours */}
                {c.lesson_count > 0 && (
                  <div style={{ marginTop: 14, borderTop: '1px solid var(--border)', paddingTop: 12 }}>
                    <LessonList courseId={c.id} onDeleted={load} />
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Modal : Upload leçon ── */}
      {showUpload && (
        <div className="modal-overlay" onClick={() => setShowUpload(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">📤 Ajouter une leçon</span>
              <button className="modal-close" onClick={() => setShowUpload(null)}>✕</button>
            </div>
            <form onSubmit={uploadLesson}>
              <div className="modal-body">
                <div className="form-group">
                  <label className="form-label">Titre de la leçon *</label>
                  <input className="form-input"
                    value={lessonForm.title}
                    onChange={e => setLessonForm({ ...lessonForm, title: e.target.value })}
                    placeholder="Ex : La Membrane Cellulaire" required />
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
                    <input className="form-input" type="number"
                      value={lessonForm.order}
                      onChange={e => setLessonForm({ ...lessonForm, order: parseInt(e.target.value) })}
                      min={0} />
                  </div>
                </div>

                {/* Zone de dépôt */}
                <div className="form-group">
                  <label className="form-label">Fichier (PDF ou Vidéo) *</label>
                  <div
                    className={`upload-zone${dragOver ? ' drag-over' : ''}`}
                    onDragOver={e => { e.preventDefault(); setDragOver(true) }}
                    onDragLeave={() => setDragOver(false)}
                    onDrop={handleDrop}
                    onClick={() => fileRef.current.click()}
                  >
                    {file ? (
                      <>
                        <div style={{ fontSize: 36 }}>{file.type.includes('pdf') ? '📄' : '🎬'}</div>
                        <div style={{ fontWeight: 600, marginTop: 8, fontSize: 14 }}>{file.name}</div>
                        <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>{(file.size / 1024 / 1024).toFixed(1)} MB</p>
                      </>
                    ) : (
                      <>
                        <div style={{ fontSize: 36 }}>📂</div>
                        <div style={{ fontWeight: 600, marginTop: 8 }}>Glisser-déposer ou cliquer</div>
                        <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>PDF, MP4, WebM acceptés</p>
                      </>
                    )}
                    <input
                      ref={fileRef} type="file" accept=".pdf,video/*"
                      style={{ display: 'none' }}
                      onChange={e => setFile(e.target.files[0])} />
                  </div>
                </div>

                {uploading && (
                  <div className="alert alert-info">⏳ Upload en cours, veuillez patienter…</div>
                )}
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-outline" onClick={() => setShowUpload(null)}>Annuler</button>
                <button type="submit" className="btn btn-primary" disabled={uploading}>
                  {uploading ? '⏳ Upload…' : '📤 Uploader'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}


/* ── Liste des leçons d'un cours ─────────────── */
function LessonList({ courseId, onDeleted }) {
  const [lessons, setLessons] = useState([])
  const [loading, setLoading] = useState(true)
  const [msg, setMsg]         = useState('')

  useEffect(() => {
    api.get(`/courses/${courseId}/lessons`)
      .then(r => { setLessons(r.data); setLoading(false) })
      .catch(() => setLoading(false))
  }, [courseId])

  const deleteLesson = async (lessonId) => {
    if (!confirm('Supprimer cette leçon ?')) return
    try {
      await api.delete(`/lessons/${lessonId}`)
      setLessons(prev => prev.filter(l => l.id !== lessonId))
      onDeleted()
    } catch (err) {
      setMsg(err.response?.data?.detail || 'Erreur')
      setTimeout(() => setMsg(''), 3000)
    }
  }

  if (loading) return <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Chargement…</div>
  if (lessons.length === 0) return null

  return (
    <div>
      {msg && <div className="alert alert-error" style={{ marginBottom: 8, fontSize: 12 }}>{msg}</div>}
      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: .5 }}>
        Leçons ({lessons.length})
      </div>
      {lessons.map((l, i) => (
        <div key={l.id} style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '8px 0', borderBottom: '1px solid var(--border)',
        }}>
          <div style={{
            width: 24, height: 24, borderRadius: 6, flexShrink: 0,
            background: l.type === 'pdf' ? '#dbeafe' : '#dcfce7',
            color: l.type === 'pdf' ? 'var(--blue)' : 'var(--success)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 11, fontWeight: 700,
          }}>
            {i + 1}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--navy)',
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {l.title}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              {l.type === 'pdf' ? '📄 PDF' : '🎬 Vidéo'}{l.duration ? ` · ${l.duration}` : ''}
            </div>
          </div>
          <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 12,
            background: l.file_path ? '#dcfce7' : '#fee2e2',
            color: l.file_path ? '#065f46' : '#991b1b' }}>
            {l.file_path ? '✓ Fichier' : '⚠ Manquant'}
          </span>
          <button className="btn btn-danger btn-sm" style={{ fontSize: 11 }}
            onClick={() => deleteLesson(l.id)}>
            Supprimer
          </button>
        </div>
      ))}
    </div>
  )
}