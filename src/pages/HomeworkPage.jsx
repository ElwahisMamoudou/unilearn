import { useEffect, useState, useRef } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import api from '../api/client'
import useAuthStore from '../store/authStore'

export default function HomeworkPage() {
  const { user }  = useAuthStore()
  const navigate  = useNavigate()
  const [params]  = useSearchParams()
  const courseId  = params.get('course')

  const [courses, setCourses]   = useState([])
  const [homeworks, setHomeworks] = useState([])
  const [selCourse, setSelCourse] = useState(courseId || '')
  const [loading, setLoading]   = useState(false)
  const [msg, setMsg]           = useState({ text: '', type: '' })

  // Soumission étudiant
  const [submitting, setSubmitting] = useState(null)
  const [submitFile, setSubmitFile] = useState(null)
  const [submitComment, setSubmitComment] = useState('')
  const fileRef = useRef()

  // Création devoir
  const [creating, setCreating] = useState(false)
  const [hwForm, setHwForm]     = useState({ title: '', description: '', due_date: '', max_score: 20, is_published: false })

  // Résultats
  const [viewSubs, setViewSubs] = useState(null)
  const [subs, setSubs]         = useState([])
  const [gradingId, setGradingId] = useState(null)
  const [gradeForm, setGradeForm] = useState({ score: '', feedback: '' })

  const isTeacher = user?.role === 'teacher' || user?.role === 'admin'
  const isStudent = user?.role === 'student'

  const flash = (text, type = 'success') => { setMsg({ text, type }); setTimeout(() => setMsg({ text: '', type: '' }), 3500) }

  useEffect(() => {
    api.get('/courses/my').then(r => setCourses(r.data))
  }, [])

  useEffect(() => {
    if (!selCourse) return
    setLoading(true)
    api.get(`/homeworks/course/${selCourse}`)
      .then(r => setHomeworks(r.data))
      .catch(() => setHomeworks([]))
      .finally(() => setLoading(false))
  }, [selCourse])

  /* ── Soumettre un devoir (étudiant) ── */
  const submitHomework = async (hwId) => {
    if (!submitFile) return flash('Sélectionnez un fichier', 'error')
    const fd = new FormData()
    fd.append('file', submitFile)
    fd.append('comment', submitComment)
    try {
      await api.post(`/homeworks/${hwId}/submit`, fd, { headers: { 'Content-Type': 'multipart/form-data' } })
      flash('Devoir soumis !')
      setSubmitting(null); setSubmitFile(null); setSubmitComment('')
      api.get(`/homeworks/course/${selCourse}`).then(r => setHomeworks(r.data))
    } catch (err) { flash(err.response?.data?.detail || 'Erreur', 'error') }
  }

  /* ── Créer un devoir (enseignant) ── */
  const createHomework = async () => {
    if (!selCourse) return flash('Sélectionnez un cours', 'error')
    if (!hwForm.title.trim()) return flash('Le titre est requis', 'error')
    if (!hwForm.due_date) return flash('La date limite est requise', 'error')
    try {
      const fd = new FormData()
      fd.append('course_id', selCourse)
      fd.append('title', hwForm.title.trim())
      fd.append('description', hwForm.description || '')
      fd.append('due_date', new Date(hwForm.due_date).toISOString())
      fd.append('max_score', String(parseFloat(hwForm.max_score) || 20))
      fd.append('is_published', String(hwForm.is_published))

      await api.post('/homeworks', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
      flash('Devoir créé !')
      setCreating(false)
      setHwForm({ title: '', description: '', due_date: '', max_score: 20, is_published: false })
      api.get(`/homeworks/course/${selCourse}`).then(r => setHomeworks(r.data))
    } catch (err) {
      const d = err.response?.data?.detail
      flash(Array.isArray(d) ? d.map(x => x.msg).join(' | ') : d || 'Erreur', 'error')
    }
  }

  const deleteHomework = async (id) => {
    if (!confirm('Supprimer ce devoir ?')) return
    await api.delete(`/homeworks/${id}`)
    flash('Devoir supprimé')
    api.get(`/homeworks/course/${selCourse}`).then(r => setHomeworks(r.data))
  }

  /* ── Voir soumissions ── */
  const loadSubs = async (hw) => {
    const r = await api.get(`/homeworks/${hw.id}/submissions`)
    setSubs(r.data); setViewSubs(hw)
  }

  /* ── Noter une soumission ── */
  const gradeSubmission = async (subId, hwId) => {
    try {
      await api.put(`/homeworks/${hwId}/submissions/${subId}/grade`, {
        score: parseFloat(gradeForm.score),
        feedback: gradeForm.feedback || null,
      })
      flash('Note enregistrée !')
      setGradingId(null)
      loadSubs(viewSubs)
    } catch (err) { flash(err.response?.data?.detail || 'Erreur', 'error') }
  }

  /* ── Export Excel ── */
  const exportResults = async (hwId, title) => {
    try {
      const r = await api.get(`/import-export/homeworks/${hwId}/export`, { responseType: 'blob' })
      const url = URL.createObjectURL(r.data)
      const a = document.createElement('a')
      a.href = url; a.download = `devoir_${title}.xlsx`; a.click()
      URL.revokeObjectURL(url)
    } catch { flash('Erreur export', 'error') }
  }

  /* ── Vue soumissions ── */
  if (viewSubs) {
    return (
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
          <button className="btn btn-outline btn-sm" onClick={() => setViewSubs(null)}>← Retour</button>
          <h2 style={{ fontFamily: 'Playfair Display, serif', color: 'var(--navy)', fontSize: 20 }}>
            Soumissions — {viewSubs.title}
          </h2>
          <button className="btn btn-outline btn-sm" style={{ marginLeft: 'auto' }}
            onClick={() => exportResults(viewSubs.id, viewSubs.title)}>
            📥 Export Excel
          </button>
        </div>
        {msg.text && <div className={`alert alert-${msg.type === 'error' ? 'error' : 'success'}`}>{msg.text}</div>}
        {subs.length === 0 ? (
          <div className="empty-state"><h3>Aucune soumission</h3></div>
        ) : subs.map(s => (
          <div key={s.id} className="card" style={{ marginBottom: 10 }}>
            <div className="card-body">
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: gradingId === s.id ? 12 : 0 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--navy)' }}>{s.student_name}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    {new Date(s.submitted_at).toLocaleString('fr-FR')}
                    {s.late && <span style={{ marginLeft: 8, color: '#ef4444', fontWeight: 600 }}>⚠ En retard</span>}
                  </div>
                  {s.comment && <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>💬 {s.comment}</div>}
                </div>
                {s.graded ? (
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontWeight: 700, fontSize: 18, color: 'var(--navy)' }}>{s.score} / {viewSubs.max_score}</div>
                    {s.feedback && <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{s.feedback}</div>}
                  </div>
                ) : (
                  <span style={{ fontSize: 12, padding: '3px 10px', borderRadius: 20, background: '#fef9c3', color: '#854d0e' }}>À corriger</span>
                )}
                <div style={{ display: 'flex', gap: 6 }}>
                  {s.file_path && (
                    <a href={`/api/homeworks/${viewSubs.id}/submissions/${s.id}/file`}
                      className="btn btn-outline btn-sm" download>
                      📥 Fichier
                    </a>
                  )}
                  <button className="btn btn-primary btn-sm" onClick={() => {
                    setGradingId(gradingId === s.id ? null : s.id)
                    setGradeForm({ score: s.score || '', feedback: s.feedback || '' })
                  }}>
                    {s.graded ? 'Modifier' : 'Noter'}
                  </button>
                </div>
              </div>
              {gradingId === s.id && (
                <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12, display: 'flex', gap: 10 }}>
                  <input className="form-input" type="number" style={{ width: 90 }}
                    min={0} max={viewSubs.max_score} step={0.5}
                    placeholder={`/ ${viewSubs.max_score}`}
                    value={gradeForm.score}
                    onChange={e => setGradeForm({ ...gradeForm, score: e.target.value })} />
                  <input className="form-input" style={{ flex: 1 }}
                    placeholder="Commentaire (optionnel)"
                    value={gradeForm.feedback}
                    onChange={e => setGradeForm({ ...gradeForm, feedback: e.target.value })} />
                  <button className="btn btn-primary btn-sm"
                    onClick={() => gradeSubmission(s.id, viewSubs.id)}>
                    Valider
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    )
  }

  /* ── Vue principale ── */
  return (
    <>
      {msg.text && <div className={`alert alert-${msg.type === 'error' ? 'error' : 'success'}`}>{msg.text}</div>}

      <div className="section-header">
        <span className="section-title">Devoirs</span>
        {isTeacher && selCourse && (
          <button className="btn btn-primary" onClick={() => setCreating(true)}>+ Créer un devoir</button>
        )}
      </div>

      <div className="form-group" style={{ maxWidth: 400, marginBottom: 24 }}>
        <label className="form-label">Cours</label>
        <select className="form-select" value={selCourse} onChange={e => setSelCourse(e.target.value)}>
          <option value="">-- Sélectionner un cours --</option>
          {courses.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
        </select>
      </div>

      {loading ? <div className="loading-overlay"><div className="spinner" /></div> : (
        homeworks.length === 0 ? (
          <div className="empty-state">
            <h3>Aucun devoir</h3>
            <p>{isTeacher ? 'Créez le premier devoir pour ce cours.' : 'Aucun devoir disponible.'}</p>
          </div>
        ) : homeworks.map(hw => {
          const now    = new Date()
          const due    = new Date(hw.due_date)
          const isLate = now > due
          const mySub  = hw.my_submission

          return (
            <div key={hw.id} className="card" style={{ marginBottom: 12 }}>
              <div className="card-body">
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: 15, color: 'var(--navy)' }}>{hw.title}</div>
                    {hw.description && (
                      <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>{hw.description}</div>
                    )}
                    <div style={{ fontSize: 12, color: isLate ? '#ef4444' : 'var(--text-muted)', marginTop: 6, display: 'flex', gap: 16 }}>
                      <span>📅 À rendre : {due.toLocaleString('fr-FR')}</span>
                      <span>📊 Note sur : {hw.max_score}</span>
                      {isTeacher && <span>👥 {hw.submission_count} soumission(s)</span>}
                    </div>
                    {isLate && <span style={{ fontSize: 11, color: '#ef4444', fontWeight: 600 }}>⚠ Date dépassée</span>}
                  </div>

                  <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                    {isStudent && (
                      mySub ? (
                        <div style={{ textAlign: 'right' }}>
                          <span style={{ fontSize: 12, padding: '3px 10px', borderRadius: 20,
                            background: mySub.graded ? '#d1fae5' : '#fef9c3',
                            color: mySub.graded ? '#065f46' : '#854d0e' }}>
                            {mySub.graded ? `✓ Noté : ${mySub.score}/${hw.max_score}` : '⏳ En attente de correction'}
                          </span>
                          <button className="btn btn-outline btn-sm" style={{ marginLeft: 8 }}
                            onClick={() => { setSubmitting(hw.id); setSubmitFile(null); setSubmitComment('') }}>
                            Modifier
                          </button>
                        </div>
                      ) : (
                        <button className="btn btn-primary btn-sm"
                          disabled={isLate}
                          onClick={() => { setSubmitting(hw.id); setSubmitFile(null); setSubmitComment('') }}>
                          {isLate ? 'Délai dépassé' : '📤 Soumettre'}
                        </button>
                      )
                    )}
                    {isTeacher && (
                      <>
                        <button className="btn btn-outline btn-sm" onClick={() => loadSubs(hw)}>
                          Soumissions
                        </button>
                        <button className="btn btn-danger btn-sm" onClick={() => deleteHomework(hw.id)}>
                          🗑️
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {/* Zone de soumission étudiant */}
                {isStudent && submitting === hw.id && (
                  <div style={{ borderTop: '1px solid var(--border)', paddingTop: 16, marginTop: 12 }}>
                    <div className="form-group">
                      <label className="form-label">Fichier *</label>
                      <div className="upload-zone" onClick={() => fileRef.current?.click()}
                        style={{ padding: '16px', textAlign: 'center', cursor: 'pointer' }}>
                        {submitFile ? (
                          <div>
                            <div style={{ fontSize: 24 }}>📄</div>
                            <div style={{ fontWeight: 600, marginTop: 4 }}>{submitFile.name}</div>
                            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{(submitFile.size/1024/1024).toFixed(1)} MB</div>
                          </div>
                        ) : (
                          <div>📂 Cliquer pour choisir un fichier (PDF, Word, image...)</div>
                        )}
                        <input ref={fileRef} type="file"
                          accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.zip,.txt"
                          style={{ display: 'none' }}
                          onChange={e => setSubmitFile(e.target.files[0])} />
                      </div>
                    </div>
                    <div className="form-group">
                      <label className="form-label">Commentaire (optionnel)</label>
                      <textarea className="form-input" rows={2}
                        value={submitComment}
                        onChange={e => setSubmitComment(e.target.value)}
                        placeholder="Un mot pour l'enseignant..." style={{ resize: 'vertical' }} />
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button className="btn btn-outline" onClick={() => setSubmitting(null)}>Annuler</button>
                      <button className="btn btn-primary" onClick={() => submitHomework(hw.id)}>
                        📤 Soumettre
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )
        })
      )}

      {/* Modal créer devoir */}
      {creating && (
        <div className="modal-overlay" onClick={() => setCreating(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">Nouveau devoir</span>
              <button className="modal-close" onClick={() => setCreating(false)}>✕</button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">Titre *</label>
                <input className="form-input" required value={hwForm.title}
                  onChange={e => setHwForm({ ...hwForm, title: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="form-label">Description</label>
                <textarea className="form-input" rows={3} value={hwForm.description}
                  onChange={e => setHwForm({ ...hwForm, description: e.target.value })}
                  style={{ resize: 'vertical' }} />
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Date limite *</label>
                  <input className="form-input" type="datetime-local" value={hwForm.due_date}
                    onChange={e => setHwForm({ ...hwForm, due_date: e.target.value })} required />
                </div>
                <div className="form-group">
                  <label className="form-label">Note maximale</label>
                  <input className="form-input" type="number" min={1} step={0.5} value={hwForm.max_score}
                    onChange={e => setHwForm({ ...hwForm, max_score: e.target.value })} />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Statut</label>
                <select className="form-select" value={hwForm.is_published}
                  onChange={e => setHwForm({ ...hwForm, is_published: e.target.value === 'true' })}>
                  <option value="false">Brouillon</option>
                  <option value="true">Publié</option>
                </select>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-outline" onClick={() => setCreating(false)}>Annuler</button>
              <button className="btn btn-primary" onClick={createHomework}>Créer</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
