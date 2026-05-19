import { useEffect, useRef, useState, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import api from '../api/client'
import useAuthStore from '../store/authStore'

/* ─── Compte à rebours ─────────────────────────────────── */
function Countdown({ seconds, onExpire }) {
  const [remaining, setRemaining] = useState(seconds)
  const ref = useRef(null)
  useEffect(() => {
    ref.current = setInterval(() => {
      setRemaining(prev => {
        if (prev <= 1) { clearInterval(ref.current); onExpire(); return 0 }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(ref.current)
  }, [onExpire])
  const m = Math.floor(remaining / 60), s = remaining % 60
  const urgent = remaining < 300, warning = remaining < 600
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8, padding: '6px 14px',
      borderRadius: 20, fontWeight: 700, fontSize: 15, letterSpacing: 1,
      background: urgent ? '#fee2e2' : warning ? '#fef9c3' : '#f0fdf4',
      color: urgent ? '#991b1b' : warning ? '#92400e' : '#065f46',
      border: `1px solid ${urgent ? '#fca5a5' : warning ? '#f59e0b' : '#86efac'}`,
    }}>
      <span>{urgent ? '⏰' : '⏱'}</span>
      {String(m).padStart(2, '0')}:{String(s).padStart(2, '0')}
    </div>
  )
}

/* ─── Barre de progression ─────────────────────────────── */
function AnswerProgress({ questions, answers }) {
  const answered = questions.filter(q => {
    const a = answers[q.id]
    if (a === undefined || a === '' || a === null) return false
    if (Array.isArray(a)) return a.length > 0
    if (typeof a === 'object') return Object.keys(a).length > 0
    return true
  }).length
  const pct = questions.length ? Math.round(answered / questions.length * 100) : 0
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>
        <span>{answered} / {questions.length} question(s) répondue(s)</span>
        <span>{pct}%</span>
      </div>
      <div style={{ height: 6, background: 'var(--border)', borderRadius: 4, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: pct === 100 ? '#22c55e' : '#3b82f6', borderRadius: 4, transition: 'width 0.3s' }} />
      </div>
    </div>
  )
}

/* ─── Badge statut ─────────────────────────────────────── */
function StatusBadge({ status, isPublished }) {
  const cfg = {
    draft:     { bg: '#fef9c3', color: '#854d0e', label: 'Brouillon' },
    scheduled: { bg: '#eff6ff', color: '#1d4ed8', label: 'Programmé' },
    open:      { bg: '#d1fae5', color: '#065f46', label: 'Ouvert' },
    closed:    { bg: '#fee2e2', color: '#991b1b', label: 'Fermé' },
  }
  const s = status || (isPublished ? 'open' : 'draft')
  const c = cfg[s] || cfg.draft
  return (
    <span style={{ fontSize: 11, padding: '2px 10px', borderRadius: 20, fontWeight: 600, background: c.bg, color: c.color }}>
      {c.label}
    </span>
  )
}

/* ─── Types de questions ───────────────────────────────── */
const Q_TYPE_LABELS = {
  mcq:       { icon: '🔘', label: 'QCM — 1 réponse' },
  mcq_multi: { icon: '☑️', label: 'QCM — plusieurs réponses' },
  truefalse: { icon: '⚖️', label: 'Vrai / Faux' },
  short:     { icon: '✏️', label: 'Réponse courte' },
  open:      { icon: '📝', label: 'Réponse ouverte' },
  fill:      { icon: '🔤', label: 'Texte à trous' },
  match:     { icon: '🔗', label: 'Correspondance' },
  order:     { icon: '🔢', label: 'Classement' },
  upload:    { icon: '📎', label: 'Fichier à remettre' },
}

/* ─── Réponse étudiant selon le type ───────────────────── */
function StudentAnswer({ q, answers, setAnswers, fileAnswers, setFileAnswers, flash }) {
  const val = answers[q.id]

  if (q.type === 'mcq') return (
    <div>
      {q.choices?.map((c, ci) => (
        <label key={ci} style={{
          display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, cursor: 'pointer',
          padding: '8px 12px', borderRadius: 8,
          background: val === String(ci) ? '#eff6ff' : 'transparent',
          border: `1px solid ${val === String(ci) ? '#93c5fd' : 'transparent'}`,
          transition: 'all 0.15s',
        }}>
          <input type="radio" name={`q${q.id}`} value={String(ci)}
            checked={val === String(ci)}
            onChange={() => setAnswers(a => ({ ...a, [q.id]: String(ci) }))} />
          <span style={{ fontSize: 14 }}>{c}</span>
        </label>
      ))}
    </div>
  )

  if (q.type === 'mcq_multi') {
    const selected = Array.isArray(val) ? val : []
    return (
      <div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>Cochez toutes les réponses correctes</div>
        {q.choices?.map((c, ci) => {
          const checked = selected.includes(String(ci))
          return (
            <label key={ci} style={{
              display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, cursor: 'pointer',
              padding: '8px 12px', borderRadius: 8,
              background: checked ? '#eff6ff' : 'transparent',
              border: `1px solid ${checked ? '#93c5fd' : 'transparent'}`,
              transition: 'all 0.15s',
            }}>
              <input type="checkbox" checked={checked}
                onChange={() => {
                  const next = checked ? selected.filter(v => v !== String(ci)) : [...selected, String(ci)]
                  setAnswers(a => ({ ...a, [q.id]: next }))
                }} />
              <span style={{ fontSize: 14 }}>{c}</span>
            </label>
          )
        })}
      </div>
    )
  }

  if (q.type === 'truefalse') return (
    <div style={{ display: 'flex', gap: 12 }}>
      {[['true', '✓ Vrai'], ['false', '✗ Faux']].map(([v, label]) => (
        <label key={v} style={{
          display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer',
          padding: '8px 20px', borderRadius: 8, flex: 1, justifyContent: 'center',
          background: val === v ? (v === 'true' ? '#dcfce7' : '#fee2e2') : '#f8fafc',
          border: `1px solid ${val === v ? (v === 'true' ? '#86efac' : '#fca5a5') : 'var(--border)'}`,
          fontWeight: val === v ? 700 : 400,
        }}>
          <input type="radio" name={`q${q.id}`} value={v} checked={val === v}
            onChange={() => setAnswers(a => ({ ...a, [q.id]: v }))} style={{ display: 'none' }} />
          <span style={{ fontSize: 15 }}>{label}</span>
        </label>
      ))}
    </div>
  )

  if (q.type === 'short') return (
    <input className="form-input" style={{ fontSize: 14 }}
      value={val || ''} onChange={e => setAnswers(a => ({ ...a, [q.id]: e.target.value }))}
      placeholder="Votre réponse…" />
  )

  if (q.type === 'open') return (
    <textarea className="form-input" rows={4} style={{ resize: 'vertical', fontSize: 14 }}
      value={val || ''} onChange={e => setAnswers(a => ({ ...a, [q.id]: e.target.value }))}
      placeholder="Rédigez votre réponse ici…" />
  )

  if (q.type === 'fill') {
    const parts = (q.text || '').split(/(_+)/)
    let blankIdx = 0
    const blanks = (typeof val === 'object' && val !== null && !Array.isArray(val)) ? val : {}
    return (
      <div style={{ fontSize: 14, lineHeight: 2.6 }}>
        {parts.map((part, pi) => {
          if (/^_+$/.test(part)) {
            const idx = blankIdx++
            return (
              <input key={pi}
                value={blanks[idx] || ''}
                onChange={e => setAnswers(a => ({
                  ...a, [q.id]: { ...(typeof a[q.id] === 'object' && a[q.id] && !Array.isArray(a[q.id]) ? a[q.id] : {}), [idx]: e.target.value }
                }))}
                placeholder="…"
                style={{
                  display: 'inline-block', width: 110, margin: '0 4px',
                  border: 'none', borderBottom: '2px solid #3b82f6',
                  outline: 'none', fontSize: 14, textAlign: 'center',
                  padding: '2px 4px', background: 'transparent', color: 'var(--navy)',
                }} />
            )
          }
          return <span key={pi}>{part}</span>
        })}
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>Complétez les espaces vides dans le texte.</div>
      </div>
    )
  }

  if (q.type === 'match') {
    const pairs = q.choices || []
    const matched = (typeof val === 'object' && val !== null && !Array.isArray(val)) ? val : {}
    return (
      <div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 10 }}>Associez chaque élément de gauche à son correspondant.</div>
        {pairs.map((pair, pi) => {
          const left  = typeof pair === 'object' ? pair.left  : pair
          return (
            <div key={pi} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
              <div style={{ flex: 1, padding: '8px 12px', borderRadius: 8, background: '#f0f9ff', border: '1px solid #bae6fd', fontSize: 14, color: '#0369a1', fontWeight: 500 }}>{left}</div>
              <span style={{ color: 'var(--text-muted)', fontSize: 18 }}>→</span>
              <select className="form-select" style={{ flex: 1 }}
                value={matched[pi] || ''}
                onChange={e => setAnswers(a => ({
                  ...a, [q.id]: { ...(typeof a[q.id] === 'object' && a[q.id] && !Array.isArray(a[q.id]) ? a[q.id] : {}), [pi]: e.target.value }
                }))}>
                <option value="">-- Choisir --</option>
                {pairs.map((p2, ri) => {
                  const rLabel = typeof p2 === 'object' ? p2.right : p2
                  return <option key={ri} value={String(ri)}>{rLabel}</option>
                })}
              </select>
            </div>
          )
        })}
      </div>
    )
  }

  if (q.type === 'order') {
    const defaultOrder = (q.choices || []).map((_, i) => i)
    const items = (Array.isArray(val) && val.length > 0) ? val : defaultOrder
    const moveItem = (from, to) => {
      const next = [...items]
      const [moved] = next.splice(from, 1)
      next.splice(to, 0, moved)
      setAnswers(a => ({ ...a, [q.id]: next }))
    }
    return (
      <div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 10 }}>Classez les éléments dans le bon ordre en utilisant les flèches ▲ ▼.</div>
        {items.map((idx, pos) => (
          <div key={pos} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, padding: '8px 12px', borderRadius: 8, background: '#f8fafc', border: '1px solid var(--border)' }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', minWidth: 22 }}>{pos + 1}.</span>
            <span style={{ flex: 1, fontSize: 14 }}>{q.choices?.[idx]}</span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <button onClick={() => pos > 0 && moveItem(pos, pos - 1)} disabled={pos === 0}
                style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 4, cursor: pos === 0 ? 'not-allowed' : 'pointer', padding: '1px 7px', fontSize: 11, opacity: pos === 0 ? 0.3 : 1 }}>▲</button>
              <button onClick={() => pos < items.length - 1 && moveItem(pos, pos + 1)} disabled={pos === items.length - 1}
                style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 4, cursor: pos === items.length - 1 ? 'not-allowed' : 'pointer', padding: '1px 7px', fontSize: 11, opacity: pos === items.length - 1 ? 0.3 : 1 }}>▼</button>
            </div>
          </div>
        ))}
      </div>
    )
  }

  if (q.type === 'upload') {
    const file = fileAnswers[q.id]
    return (
      <label style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', border: `2px dashed ${file ? '#22c55e' : 'var(--border)'}`, borderRadius: 10, cursor: 'pointer', background: file ? '#f0fdf4' : '#f8fafc' }}>
        <span style={{ fontSize: 28 }}>{file ? '✅' : '📎'}</span>
        <div>
          <div style={{ fontWeight: 600, fontSize: 13, color: file ? '#166534' : 'var(--navy)' }}>{file ? file.name : 'Cliquer pour joindre un fichier'}</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>PDF, Word, images — max 10 Mo</div>
        </div>
        <input type="file" style={{ display: 'none' }} accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
          onChange={e => {
            const f = e.target.files?.[0]
            if (!f) return
            if (f.size > 10 * 1024 * 1024) { flash('Fichier trop volumineux (max 10 Mo)', 'error'); return }
            setFileAnswers(fa => ({ ...fa, [q.id]: f }))
          }} />
      </label>
    )
  }

  return null
}

/* ══════════════════════════════════════════════════════════
   PAGE PRINCIPALE
══════════════════════════════════════════════════════════ */
export default function ExamPage() {
  const { user } = useAuthStore()
  const [params] = useSearchParams()
  const courseId = params.get('course')

  const [courses, setCourses]     = useState([])
  const [exams, setExams]         = useState([])
  const [selCourse, setSelCourse] = useState(courseId || '')
  const [loading, setLoading]     = useState(false)
  const [msg, setMsg]             = useState({ text: '', type: '' })
  const [search, setSearch]       = useState('')
  const [page, setPage]           = useState(1)
  const PAGE_SIZE = 6

  const [taking, setTaking]           = useState(null)
  const [answers, setAnswers]         = useState({})
  const [fileAnswers, setFileAnswers] = useState({})
  const [submitted, setSubmitted]     = useState(null)

  const [violations, setViolations]     = useState(0)
  const [showWarning, setShowWarning]   = useState(false)
  const [forcedSubmit, setForcedSubmit] = useState(false)
  const MAX_VIOLATIONS = 3

  const [creating, setCreating]       = useState(false)
  const [editingExam, setEditingExam] = useState(null)

  const EMPTY_FORM = {
    title: '', description: '', duration_min: 60,
    starts_at: '', ends_at: '', is_published: false,
    shuffle_questions: false, max_attempts: 1,
    passing_score: '', show_score_after: 'immediately',
  }
  const [examForm, setExamForm]   = useState(EMPTY_FORM)
  const [questions, setQuestions] = useState([])

  const [viewSubs, setViewSubs]       = useState(null)
  const [subs, setSubs]               = useState([])
  const [gradingId, setGradingId]     = useState(null)
  const [gradingForm, setGradingForm] = useState({})

  const flash = (text, type = 'success') => {
    setMsg({ text, type })
    setTimeout(() => setMsg({ text: '', type: '' }), 4000)
  }

  const isAdmin   = user?.role === 'admin'
  const isTeacher = user?.role === 'teacher'
  const isStudent = user?.role === 'student'
  const canManage = isAdmin || isTeacher

  useEffect(() => { api.get('/courses/my').then(r => setCourses(r.data)).catch(() => {}) }, [])

  const loadExams = useCallback(() => {
    if (!selCourse) return
    setLoading(true); setPage(1); setSearch('')
    api.get(`/exams/course/${selCourse}`)
      .then(r => setExams(r.data))
      .catch(() => setExams([]))
      .finally(() => setLoading(false))
  }, [selCourse])

  useEffect(() => { loadExams() }, [loadExams])

  /* ── Anti-triche ── */
  useEffect(() => {
    if (!taking) return
    const handle = () => {
      if (!document.hidden) return
      setViolations(prev => {
        const next = prev + 1
        api.post(`/exams/${taking.id}/violation`, { count: next, type: 'tab_switch' }).catch(() => {})
        if (next >= MAX_VIOLATIONS) { setForcedSubmit(true); setShowWarning(false) }
        else setShowWarning(true)
        return next
      })
    }
    document.addEventListener('visibilitychange', handle)
    window.addEventListener('blur', handle)
    return () => {
      document.removeEventListener('visibilitychange', handle)
      window.removeEventListener('blur', handle)
    }
  }, [taking])

  useEffect(() => { if (forcedSubmit && taking) submitExam(true) }, [forcedSubmit])

  const startExam = async (exam) => {
    try {
      const { data } = await api.get(`/exams/${exam.id}`)
      setTaking(data); setAnswers({}); setFileAnswers({})
      setSubmitted(null); setViolations(0); setShowWarning(false); setForcedSubmit(false)
    } catch (err) { flash(err.response?.data?.detail || "Impossible de charger l'examen", 'error') }
  }

  const submitExam = useCallback(async (forced = false) => {
    if (!taking) return
    try {
      const fileKeys = {}
      for (const [qId, file] of Object.entries(fileAnswers)) {
        const fd = new FormData()
        fd.append('file', file)
        const { data } = await api.post(`/exams/${taking.id}/upload/${qId}`, fd)
        fileKeys[qId] = data.file_key
      }
      // Sérialisation des réponses complexes (tableaux, objets)
      const serialized = {}
      Object.entries(answers).forEach(([k, v]) => {
        serialized[k] = (Array.isArray(v) || (typeof v === 'object' && v !== null)) ? JSON.stringify(v) : v
      })
      const r = await api.post(`/exams/${taking.id}/submit`, {
        answers: { ...serialized, ...fileKeys }, violations, forced,
      })
      setSubmitted({ ...r.data, exam: taking, forced, violations })
      setTaking(null); setForcedSubmit(false)
      flash(forced ? 'Copie soumise automatiquement.' : 'Examen soumis !')
      loadExams()
    } catch (err) { flash(err.response?.data?.detail || 'Erreur lors de la soumission', 'error') }
  }, [taking, answers, fileAnswers, violations])

  /* ── Gestion questions ── */
  const EMPTY_QUESTION = (type = 'mcq') => {
    const base = { type, text: '', points: 1, explanation: '', answer: '' }
    if (type === 'mcq')       return { ...base, choices: ['', '', '', ''], answer: '0' }
    if (type === 'mcq_multi') return { ...base, choices: ['', '', '', ''], answer: [] }
    if (type === 'truefalse') return { ...base, answer: 'true' }
    if (type === 'match')     return { ...base, choices: [{ left: '', right: '' }, { left: '', right: '' }, { left: '', right: '' }] }
    if (type === 'order')     return { ...base, choices: ['', '', '', ''] }
    if (type === 'fill')      return { ...base, text: 'Paris est la capitale de la ____.', answer: 'France' }
    return base
  }

  const addQuestion    = (type = 'mcq') => setQuestions(q => [...q, EMPTY_QUESTION(type)])
  const removeQuestion = (i) => setQuestions(q => q.filter((_, j) => j !== i))
  const updateQ        = (i, field, val) => setQuestions(q => { const a = [...q]; a[i] = { ...a[i], [field]: val }; return a })
  const updateChoice   = (qi, ci, val) => setQuestions(q => {
    const a = [...q]
    if (typeof a[qi].choices[ci] === 'object') {
      a[qi].choices[ci] = { ...a[qi].choices[ci], ...val }
    } else {
      a[qi].choices[ci] = val
    }
    return a
  })
    const examChoicesForPayload = (q) => {
    if (['open', 'upload', 'short', 'truefalse', 'fill'].includes(q.type)) return null
    if (q.type === 'match') {
      return (q.choices || [])
        .map(pair => ({ left: (pair.left || '').trim(), right: (pair.right || '').trim() }))
        .filter(pair => pair.left || pair.right)
    }
    return (q.choices || []).map(c => typeof c === 'string' ? c.trim() : c)
  }

  const examAnswerForPayload = (q) => {
    if (['open', 'upload'].includes(q.type)) return null
    if (q.type === 'mcq_multi') return JSON.stringify(Array.isArray(q.answer) ? q.answer : [])
    return q.answer ?? null
  }
  const addChoice = (qi) => setQuestions(q => {
    const a = [...q]
    const isMatch = a[qi].type === 'match'
    a[qi].choices = [...(a[qi].choices || []), isMatch ? { left: '', right: '' } : '']
    return a
  })
  const removeChoice = (qi, ci) => setQuestions(q => {
    const a = [...q]
    a[qi].choices = a[qi].choices.filter((_, j) => j !== ci)
    return a
  })
  const moveQuestion = (from, to) => setQuestions(q => {
    const a = [...q]; const [m] = a.splice(from, 1); a.splice(to, 0, m); return a
  })

  const openCreate = () => { setEditingExam(null); setExamForm(EMPTY_FORM); setQuestions([]); setCreating(true) }
  const openEdit = (exam) => {
    setEditingExam(exam)
    setExamForm({
      title: exam.title, description: exam.description || '',
      duration_min: exam.duration_min,
      starts_at: exam.starts_at ? exam.starts_at.slice(0, 16) : '',
      ends_at:   exam.ends_at   ? exam.ends_at.slice(0, 16)   : '',
      is_published: exam.is_published,
      shuffle_questions: exam.shuffle_questions || false,
      max_attempts: exam.max_attempts ?? 1,
      passing_score: exam.passing_score ?? '',
      show_score_after: exam.show_score_after || 'immediately',
    })
    setQuestions((exam.questions || []).map(q => ({
      id: q.id, type: q.type, text: q.text,
      choices: q.choices || (['match'].includes(q.type) ? [{ left: '', right: '' }] : ['', '']),
      answer: q.type === 'mcq_multi'
        ? (typeof q.answer === 'string' ? JSON.parse(q.answer || '[]') : (q.answer || []))
        : (q.answer ?? (q.type === 'truefalse' ? 'true' : '0')),
      points: q.points, explanation: q.explanation || '',
    })))
    setCreating(true)
  }

  const saveExam = async () => {
    if (!selCourse) return flash('Sélectionnez un cours', 'error')
    if (!examForm.title.trim()) return flash('Le titre est requis', 'error')
    if (questions.length === 0) return flash('Ajoutez au moins une question', 'error')
    for (let i = 0; i < questions.length; i++) {
      const q = questions[i]
      if (q.type !== 'fill' && !q.text.trim()) return flash(`Question ${i + 1} : le texte est requis`, 'error')
      if ((q.type === 'mcq' || q.type === 'mcq_multi') && q.choices.filter(c => (typeof c === 'string' ? c : c.left || '').trim()).length < 2)
        return flash(`Question ${i + 1} : au moins 2 choix requis`, 'error')
    }
    const payload = {
      ...examForm,
      course_id: parseInt(selCourse),
      starts_at: examForm.starts_at || null,
      ends_at:   examForm.ends_at   || null,
      max_attempts: parseInt(examForm.max_attempts) || 1,
      passing_score: examForm.passing_score !== '' ? parseFloat(examForm.passing_score) : null,
      questions: questions.map((q, i) => ({
        order: i, type: q.type, text: q.text.trim(), points: q.points,
        explanation: q.explanation || null,
        choices: examChoicesForPayload(q),
        answer: examAnswerForPayload(q),
      })),
    }
    try {
      if (editingExam) {
        await api.put(`/exams/${editingExam.id}`, payload); flash('Examen mis à jour !')
      } else {
        await api.post('/exams', payload); flash('Examen créé !')
      }
      setCreating(false); setEditingExam(null); setExamForm(EMPTY_FORM); setQuestions([])
      loadExams()
    } catch (err) {
      const d = err.response?.data?.detail
      flash(Array.isArray(d) ? d.map(x => x.msg).join(' | ') : d || 'Erreur serveur', 'error')
    }
  }

  const deleteExam = async (id) => {
    if (!confirm('Supprimer cet examen ? Action irréversible.')) return
    try {
      await api.delete(`/exams/${id}`); flash('Examen supprimé')
      setExams(e => e.filter(x => x.id !== id))
    } catch { flash('Erreur suppression', 'error') }
  }

  /* ── ✅ Bug corrigé : seul l'examen cliqué change ── */
  const togglePublish = async (exam) => {
    const newVal = !exam.is_published
    setExams(prev => prev.map(e => e.id === exam.id ? { ...e, is_published: newVal } : e))
    try {
      const { data } = await api.patch(`/exams/${exam.id}/visibility`, { is_published: newVal })
      flash(data.message)
    } catch (err) {
      setExams(prev => prev.map(e => e.id === exam.id ? { ...e, is_published: !newVal } : e))
      flash(err.response?.data?.detail || 'Erreur lors de la publication', 'error')
    }
  }

  const loadSubs = async (exam) => {
    try {
      const { data } = await api.get(`/exams/${exam.id}/submissions`)
      setSubs(data); setViewSubs(exam)
    } catch { flash('Erreur chargement résultats', 'error') }
  }

  const startGrading = (sub) => {
    const form = {}
    if (sub.question_results) {
      sub.question_results
        .filter(qr => ['open', 'upload', 'fill', 'match', 'order'].includes(qr.type))
        .forEach(qr => {
          form[qr.question_id] = {
            score: qr.score_earned ?? '', comment: qr.comment ?? '',
            question_text: qr.question_text, max_points: qr.points,
            type: qr.type, student_answer: qr.student_answer,
          }
        })
    }
    setGradingForm(form); setGradingId(sub)
  }

  const submitGrading = async () => {
    try {
      const grades = {}
      Object.entries(gradingForm).forEach(([qid, v]) => {
        grades[qid] = { score: parseFloat(v.score) || 0, comment: v.comment || '' }
      })
      await api.post(`/exams/submissions/${gradingId.id}/grade`, { grades })
      flash('Correction enregistrée !'); setGradingId(null); loadSubs(viewSubs)
    } catch { flash('Erreur correction', 'error') }
  }

  const filtered   = exams.filter(e => e.title.toLowerCase().includes(search.toLowerCase()))
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const paginated  = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  /* ══ VUE : PASSAGE D'EXAMEN ══ */
  if (taking) {
    const sorted = [...taking.questions].sort((a, b) => a.order - b.order)
    return (
      <div style={{ maxWidth: 740, margin: '0 auto', padding: '0 4px' }}>
        {showWarning && (
          <div style={{ background: '#fef9c3', border: '1px solid #f59e0b', borderRadius: 10, padding: '10px 16px', marginBottom: 16, display: 'flex', alignItems: 'flex-start', gap: 12 }}>
            <span style={{ fontSize: 22 }}>⚠️</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, color: '#92400e', fontSize: 14 }}>Absence détectée ({violations}/{MAX_VIOLATIONS})</div>
              <div style={{ fontSize: 12, color: '#b45309', marginTop: 2 }}>Vous avez quitté la fenêtre. À la {MAX_VIOLATIONS}e absence, votre copie sera soumise automatiquement.</div>
            </div>
            <button onClick={() => setShowWarning(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: '#92400e', padding: 0 }}>✕</button>
          </div>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20, flexWrap: 'wrap', rowGap: 8 }}>
          <button className="btn btn-outline btn-sm" onClick={() => { if (confirm('Quitter ? Vos réponses ne seront pas sauvegardées.')) setTaking(null) }}>← Retour</button>
          <h2 style={{ fontFamily: 'Playfair Display, serif', color: 'var(--navy)', fontSize: 18, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{taking.title}</h2>
          {violations > 0 && (
            <span style={{ fontSize: 11, padding: '2px 10px', borderRadius: 20, fontWeight: 700, background: violations >= MAX_VIOLATIONS - 1 ? '#fee2e2' : '#fef9c3', color: violations >= MAX_VIOLATIONS - 1 ? '#991b1b' : '#92400e' }}>⚠ {violations}/{MAX_VIOLATIONS}</span>
          )}
          <Countdown seconds={taking.duration_min * 60} onExpire={() => submitExam(true)} />
        </div>
        <AnswerProgress questions={sorted} answers={{ ...answers, ...Object.fromEntries(Object.keys(fileAnswers).map(k => [k, 'uploaded'])) }} />

        {sorted.map((q, i) => {
          const a = answers[q.id]
          const isAnswered = !!fileAnswers[q.id] ||
            (a !== undefined && a !== '' && a !== null &&
             !(Array.isArray(a) && a.length === 0) &&
             !(typeof a === 'object' && !Array.isArray(a) && a !== null && Object.keys(a).length === 0))
          return (
            <div key={q.id} className="card" style={{ marginBottom: 16, borderLeft: `3px solid ${isAnswered ? '#22c55e' : 'var(--border)'}` }}>
              <div className="card-body">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12, gap: 8 }}>
                  <div style={{ fontWeight: 600, color: 'var(--navy)', fontSize: 14, lineHeight: 1.5, flex: 1 }}>
                    {q.type === 'fill'
                      ? <span style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 400 }}>Question {i + 1} — Complétez le texte :</span>
                      : <>{i + 1}. {q.text}</>}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                    <span style={{ fontSize: 10, padding: '1px 7px', borderRadius: 10, background: '#f1f5f9', color: 'var(--text-muted)', fontWeight: 500 }}>
                      {Q_TYPE_LABELS[q.type]?.icon} {Q_TYPE_LABELS[q.type]?.label}
                    </span>
                    <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 12, background: isAnswered ? '#dcfce7' : '#f1f5f9', color: isAnswered ? '#166534' : 'var(--text-muted)', fontWeight: 600 }}>
                      {q.points} pt{q.points > 1 ? 's' : ''}
                    </span>
                  </div>
                </div>
                <StudentAnswer q={q} answers={answers} setAnswers={setAnswers} fileAnswers={fileAnswers} setFileAnswers={setFileAnswers} flash={flash} />
              </div>
            </div>
          )
        })}

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8, marginBottom: 40 }}>
          <button className="btn btn-primary" onClick={() => {
            const unanswered = sorted.filter(q => {
              if (fileAnswers[q.id]) return false
              const a = answers[q.id]
              return a === undefined || a === '' || a === null || (Array.isArray(a) && a.length === 0)
            }).length
            if (unanswered > 0 && !confirm(`${unanswered} question(s) sans réponse. Soumettre quand même ?`)) return
            submitExam(false)
          }}>Soumettre l'examen</button>
        </div>
      </div>
    )
  }

  /* ══ VUE : RÉSULTAT ══ */
  if (submitted) {
    const exam = submitted.exam || {}
    const showNow = exam.show_score_after === 'immediately' || !exam.show_score_after
    const passing = exam.passing_score ?? 50
    const pct = submitted.max_score ? Math.round(submitted.score / submitted.max_score * 100) : 0
    const success = pct >= passing
    return (
      <div style={{ maxWidth: 620, margin: '40px auto', padding: '0 8px' }}>
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{ fontSize: 64, marginBottom: 12 }}>{submitted.forced ? '🚨' : success ? '🎉' : '📝'}</div>
          <h2 style={{ fontFamily: 'Playfair Display, serif', color: 'var(--navy)', marginBottom: 8 }}>
            {submitted.forced ? 'Copie soumise automatiquement' : 'Examen soumis !'}
          </h2>
          {submitted.forced && (
            <div style={{ background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: 8, padding: '10px 16px', marginBottom: 12, fontSize: 13, color: '#991b1b' }}>
              Votre copie a été soumise après {submitted.violations} absence(s).
            </div>
          )}
          {showNow && submitted.graded ? (
            <div style={{ margin: '20px 0' }}>
              <div style={{ fontSize: 52, fontWeight: 700, color: success ? '#16a34a' : '#d97706' }}>
                {submitted.score} <span style={{ fontSize: 28, color: 'var(--text-muted)' }}>/ {submitted.max_score}</span>
              </div>
              <div style={{ display: 'inline-block', marginTop: 8, padding: '4px 18px', borderRadius: 20, fontSize: 14, fontWeight: 600, background: success ? '#dcfce7' : '#fef9c3', color: success ? '#166534' : '#92400e' }}>
                {pct}% — {success ? `Réussi ✓ (seuil : ${passing}%)` : `À améliorer (seuil : ${passing}%)`}
              </div>
            </div>
          ) : (
            <div style={{ color: 'var(--text-muted)', marginTop: 16, fontSize: 14 }}>
              {exam.show_score_after === 'never' ? "Le score n'est pas communiqué." : "Votre copie est en cours de correction."}
            </div>
          )}
        </div>
        {showNow && submitted.graded && submitted.question_results?.length > 0 && (
          <div>
            <h3 style={{ color: 'var(--navy)', fontSize: 15, fontWeight: 700, marginBottom: 12 }}>Détail des réponses</h3>
            {submitted.question_results.map((qr, i) => (
              <div key={qr.question_id} className="card" style={{ marginBottom: 10, borderLeft: `3px solid ${qr.correct === true ? '#22c55e' : qr.correct === false ? '#ef4444' : '#94a3b8'}` }}>
                <div className="card-body" style={{ padding: '12px 16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--navy)' }}>{i + 1}. {qr.question_text}</div>
                    <span style={{ flexShrink: 0, fontSize: 12, fontWeight: 700, color: qr.correct === true ? '#16a34a' : qr.correct === false ? '#dc2626' : 'var(--text-muted)' }}>
                      {qr.correct === true ? '✓' : qr.correct === false ? '✗' : '–'} {qr.score_earned}/{qr.points}pt
                    </span>
                  </div>
                  {['mcq', 'mcq_multi', 'truefalse', 'short'].includes(qr.type) && (
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                      Votre réponse : <strong style={{ color: qr.correct ? '#16a34a' : '#dc2626' }}>{qr.student_answer_label ?? qr.student_answer}</strong>
                      {!qr.correct && qr.correct_answer_label && <span style={{ marginLeft: 12 }}>Bonne réponse : <strong style={{ color: '#16a34a' }}>{qr.correct_answer_label}</strong></span>}
                    </div>
                  )}
                  {qr.comment && <div style={{ fontSize: 12, color: 'var(--navy)', fontStyle: 'italic', marginTop: 4 }}>💬 {qr.comment}</div>}
                  {qr.explanation && <div style={{ marginTop: 8, padding: '8px 12px', borderRadius: 6, background: '#f0f9ff', border: '1px solid #bae6fd', fontSize: 12, color: '#0369a1' }}>💡 {qr.explanation}</div>}
                </div>
              </div>
            ))}
          </div>
        )}
        <div style={{ textAlign: 'center', marginTop: 24 }}>
          <button className="btn btn-primary" onClick={() => setSubmitted(null)}>Retour aux examens</button>
        </div>
      </div>
    )
  }

  /* ══ VUE : CORRECTION ══ */
  if (gradingId) {
    const openQs = Object.entries(gradingForm)
    return (
      <div style={{ maxWidth: 740, margin: '0 auto', padding: '0 4px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24, flexWrap: 'wrap', rowGap: 8 }}>
          <button className="btn btn-outline btn-sm" onClick={() => setGradingId(null)}>← Retour résultats</button>
          <h2 style={{ fontFamily: 'Playfair Display, serif', color: 'var(--navy)', fontSize: 18, flex: 1 }}>Correction — {gradingId.student_name}</h2>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{new Date(gradingId.submitted_at).toLocaleString()}</span>
        </div>
        {openQs.length === 0 ? (
          <div className="empty-state"><h3>Aucune question à corriger manuellement</h3></div>
        ) : openQs.map(([qid, data]) => (
          <div key={qid} className="card" style={{ marginBottom: 16 }}>
            <div className="card-body">
              <div style={{ fontWeight: 700, color: 'var(--navy)', marginBottom: 4, fontSize: 14 }}>
                {data.question_text}
                <span style={{ fontWeight: 400, fontSize: 12, color: 'var(--text-muted)', marginLeft: 8 }}>({data.max_points} pt max)</span>
              </div>
              <span style={{ fontSize: 11, padding: '1px 8px', borderRadius: 10, background: '#f1f5f9', color: 'var(--text-muted)', display: 'inline-block', marginBottom: 10 }}>
                {Q_TYPE_LABELS[data.type]?.icon} {Q_TYPE_LABELS[data.type]?.label}
              </span>
              <div style={{ background: '#f8fafc', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 14px', marginBottom: 14, fontSize: 13, color: 'var(--navy)', whiteSpace: 'pre-wrap', lineHeight: 1.6, minHeight: 48 }}>
                {data.type === 'upload'
                  ? <a href={data.student_answer} target="_blank" rel="noopener noreferrer" style={{ color: '#2563eb' }}>📎 Voir le fichier soumis</a>
                  : data.student_answer || <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>Aucune réponse</span>}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr', gap: 12, alignItems: 'start' }}>
                <div>
                  <label className="form-label" style={{ fontSize: 12 }}>Note (/{data.max_points})</label>
                  <input className="form-input" type="number" min={0} max={data.max_points} step={0.5}
                    value={gradingForm[qid]?.score ?? ''}
                    onChange={e => setGradingForm(f => ({ ...f, [qid]: { ...f[qid], score: e.target.value } }))}
                    style={{ textAlign: 'center' }} />
                </div>
                <div>
                  <label className="form-label" style={{ fontSize: 12 }}>Commentaire</label>
                  <textarea className="form-input" rows={2} style={{ resize: 'vertical', fontSize: 13 }}
                    placeholder="Retour à l'étudiant…"
                    value={gradingForm[qid]?.comment ?? ''}
                    onChange={e => setGradingForm(f => ({ ...f, [qid]: { ...f[qid], comment: e.target.value } }))} />
                </div>
              </div>
            </div>
          </div>
        ))}
        {openQs.length > 0 && (
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 4 }}>
            <button className="btn btn-outline" onClick={() => setGradingId(null)}>Annuler</button>
            <button className="btn btn-primary" onClick={submitGrading}>Enregistrer la correction</button>
          </div>
        )}
      </div>
    )
  }

  /* ══ VUE : SOUMISSIONS ══ */
  if (viewSubs) {
    const graded = subs.filter(s => s.graded)
    const avgScore = graded.length ? Math.round(graded.reduce((acc, s) => acc + (s.score / s.max_score * 100), 0) / graded.length) : null
    const passing = viewSubs.passing_score ?? 50
    return (
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20, flexWrap: 'wrap', rowGap: 8 }}>
          <button className="btn btn-outline btn-sm" onClick={() => setViewSubs(null)}>← Retour</button>
          <h2 style={{ fontFamily: 'Playfair Display, serif', color: 'var(--navy)', fontSize: 18, flex: 1 }}>{viewSubs.title}</h2>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 12, padding: '3px 12px', borderRadius: 20, background: '#eff6ff', color: '#1d4ed8', fontWeight: 600 }}>{subs.length} soumission(s)</span>
            {avgScore !== null && <span style={{ fontSize: 12, padding: '3px 12px', borderRadius: 20, background: '#f0fdf4', color: '#166534', fontWeight: 600 }}>Moy. {avgScore}%</span>}
            {passing && <span style={{ fontSize: 12, padding: '3px 12px', borderRadius: 20, background: '#fef9c3', color: '#854d0e', fontWeight: 600 }}>Seuil : {passing}%</span>}
          </div>
        </div>
        {subs.length === 0 ? <div className="empty-state"><h3>Aucune soumission</h3></div> : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {subs.map(s => {
              const pct = s.max_score ? Math.round(s.score / s.max_score * 100) : 0
              const success = pct >= passing
              return (
                <div key={s.id} className="card">
                  <div className="card-body" style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', rowGap: 8 }}>
                    <div style={{ flex: 1, minWidth: 120 }}>
                      <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--navy)' }}>{s.student_name}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{new Date(s.submitted_at).toLocaleString()}</div>
                    </div>
                    {s.violations > 0 && (
                      <span style={{ fontSize: 11, padding: '2px 10px', borderRadius: 20, fontWeight: 700, background: s.forced ? '#fee2e2' : '#fef9c3', color: s.forced ? '#991b1b' : '#92400e' }}>
                        {s.forced ? '🚨' : '⚠️'} {s.violations} abs.
                      </span>
                    )}
                    {s.graded ? (
                      <div style={{ textAlign: 'right', minWidth: 70 }}>
                        <div style={{ fontWeight: 700, fontSize: 18, color: success ? '#16a34a' : '#d97706' }}>{s.score}/{s.max_score}</div>
                        <div style={{ fontSize: 11, color: success ? '#16a34a' : '#d97706', fontWeight: 600 }}>{pct}% {success ? '✓' : '✗'}</div>
                      </div>
                    ) : (
                      <span style={{ fontSize: 12, padding: '3px 10px', borderRadius: 20, background: '#fef9c3', color: '#854d0e' }}>À corriger</span>
                    )}
                    <button className="btn btn-outline btn-sm" onClick={() => startGrading(s)}>
                      {s.graded ? '✏️ Modifier' : '📝 Corriger'}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    )
  }

  /* ══ VUE PRINCIPALE ══ */
  return (
    <>
      {msg.text && <div className={`alert alert-${msg.type === 'error' ? 'error' : 'success'}`}>{msg.text}</div>}
      <div className="section-header">
        <span className="section-title">Évaluations</span>
        {canManage && selCourse && <button className="btn btn-primary" onClick={openCreate}>+ Créer un examen</button>}
      </div>

      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <div className="form-group" style={{ flex: '0 0 260px', minWidth: 160, margin: 0 }}>
          <label className="form-label" style={{ marginBottom: 4 }}>Cours</label>
          <select className="form-select" value={selCourse} onChange={e => { setSelCourse(e.target.value); setPage(1) }}>
            <option value="">-- Sélectionner un cours --</option>
            {courses.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
          </select>
        </div>
        {selCourse && exams.length > 0 && (
          <div className="form-group" style={{ flex: 1, minWidth: 160, margin: 0 }}>
            <label className="form-label" style={{ marginBottom: 4 }}>Rechercher</label>
            <input className="form-input" placeholder="Filtrer les examens…" value={search} onChange={e => { setSearch(e.target.value); setPage(1) }} />
          </div>
        )}
      </div>

      {loading ? (
        <div className="loading-overlay"><div className="spinner" /></div>
      ) : !selCourse ? (
        <div className="empty-state"><h3>Sélectionnez un cours</h3><p>Choisissez un cours pour voir les examens.</p></div>
      ) : filtered.length === 0 ? (
        <div className="empty-state">
          <h3>{search ? 'Aucun résultat' : 'Aucun examen'}</h3>
          <p>{search ? `Aucun examen pour "${search}".` : canManage ? 'Créez le premier examen.' : 'Aucun examen disponible.'}</p>
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {paginated.map(e => (
              <div key={e.id} className="card">
                <div className="card-body" style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', rowGap: 8 }}>
                  <div style={{ flex: 1, minWidth: 140 }}>
                    <div style={{ fontWeight: 600, fontSize: 15, color: 'var(--navy)' }}>{e.title}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 3 }}>
                      {e.questions.length} question(s) · {e.duration_min} min
                      {e.max_attempts > 0 && ` · ${e.max_attempts} tentative(s)`}
                      {e.passing_score && ` · Seuil ${e.passing_score}%`}
                      {e.starts_at && ` · Début : ${new Date(e.starts_at).toLocaleDateString()}`}
                      {canManage && ` · ${e.submission_count ?? 0} soumission(s)`}
                    </div>
                  </div>
                  <StatusBadge status={e.status} isPublished={e.is_published} />
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {isStudent && e.is_published && <button className="btn btn-primary btn-sm" onClick={() => startExam(e)}>Passer</button>}
                    {canManage && (
                      <>
                        <button className="btn btn-outline btn-sm" onClick={() => togglePublish(e)}>{e.is_published ? '🔒 Dépublier' : '🌐 Publier'}</button>
                        <button className="btn btn-outline btn-sm" onClick={() => openEdit(e)}>✏️ Modifier</button>
                        <button className="btn btn-outline btn-sm" onClick={() => loadSubs(e)}>📊 Résultats</button>
                        <button className="btn btn-danger btn-sm" onClick={() => deleteExam(e.id)}>🗑️</button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
          {totalPages > 1 && (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 8, marginTop: 20, flexWrap: 'wrap' }}>
              <button className="btn btn-outline btn-sm" disabled={page === 1} onClick={() => setPage(p => p - 1)}>‹ Préc.</button>
              {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
                <button key={p} className={`btn btn-sm ${p === page ? 'btn-primary' : 'btn-outline'}`} onClick={() => setPage(p)} style={{ minWidth: 36 }}>{p}</button>
              ))}
              <button className="btn btn-outline btn-sm" disabled={page === totalPages} onClick={() => setPage(p => p + 1)}>Suiv. ›</button>
            </div>
          )}
        </>
      )}

      {/* ══ MODAL CRÉER / MODIFIER ══ */}
      {creating && (
        <div className="modal-overlay" onClick={() => setCreating(false)}>
          <div className="modal" style={{ maxWidth: 780, width: '95vw', maxHeight: '94vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">{editingExam ? "Modifier l'examen" : 'Nouvel examen'}</span>
              <button className="modal-close" onClick={() => setCreating(false)}>✕</button>
            </div>
            <div className="modal-body">

              <div style={{ fontWeight: 700, color: 'var(--navy)', fontSize: 13, marginBottom: 10, paddingBottom: 6, borderBottom: '1px solid var(--border)' }}>📋 Informations générales</div>
              <div className="form-group">
                <label className="form-label">Titre *</label>
                <input className="form-input" value={examForm.title} onChange={e => setExamForm(f => ({ ...f, title: e.target.value }))} placeholder="Ex : Examen final – Biologie" />
              </div>
              <div className="form-group">
                <label className="form-label">Description</label>
                <textarea className="form-input" rows={2} value={examForm.description} onChange={e => setExamForm(f => ({ ...f, description: e.target.value }))} style={{ resize: 'vertical' }} placeholder="Instructions pour les étudiants…" />
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Durée (min)</label>
                  <input className="form-input" type="number" min={5} value={examForm.duration_min} onChange={e => setExamForm(f => ({ ...f, duration_min: parseInt(e.target.value) }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">Statut initial</label>
                  <select className="form-select" value={String(examForm.is_published)} onChange={e => setExamForm(f => ({ ...f, is_published: e.target.value === 'true' }))}>
                    <option value="false">Brouillon</option>
                    <option value="true">Publié</option>
                  </select>
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Date d'ouverture</label>
                  <input className="form-input" type="datetime-local" value={examForm.starts_at} onChange={e => setExamForm(f => ({ ...f, starts_at: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">Date de fermeture</label>
                  <input className="form-input" type="datetime-local" value={examForm.ends_at} onChange={e => setExamForm(f => ({ ...f, ends_at: e.target.value }))} />
                </div>
              </div>

              <div style={{ fontWeight: 700, color: 'var(--navy)', fontSize: 13, margin: '16px 0 10px', paddingBottom: 6, borderBottom: '1px solid var(--border)' }}>⚙️ Paramètres avancés</div>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Tentatives autorisées</label>
                  <input className="form-input" type="number" min={0} value={examForm.max_attempts}
                    onChange={e => setExamForm(f => ({ ...f, max_attempts: e.target.value }))} placeholder="0 = illimité" />
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>0 = illimité</div>
                </div>
                <div className="form-group">
                  <label className="form-label">Note de passage (%)</label>
                  <input className="form-input" type="number" min={0} max={100} value={examForm.passing_score}
                    onChange={e => setExamForm(f => ({ ...f, passing_score: e.target.value }))} placeholder="Ex : 50" />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Affichage du score</label>
                  <select className="form-select" value={examForm.show_score_after} onChange={e => setExamForm(f => ({ ...f, show_score_after: e.target.value }))}>
                    <option value="immediately">Immédiatement après soumission</option>
                    <option value="after_grading">Après correction manuelle</option>
                    <option value="never">Ne pas afficher</option>
                  </select>
                </div>
                <div className="form-group" style={{ display: 'flex', alignItems: 'flex-end', paddingBottom: 4 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', userSelect: 'none' }}>
                    <input type="checkbox" checked={examForm.shuffle_questions}
                      onChange={e => setExamForm(f => ({ ...f, shuffle_questions: e.target.checked }))}
                      style={{ width: 16, height: 16 }} />
                    <span className="form-label" style={{ margin: 0 }}>Mélanger les questions</span>
                  </label>
                </div>
              </div>

              {/* ── Questions ── */}
              <div style={{ borderTop: '1px solid var(--border)', marginTop: 16, paddingTop: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
                  <div style={{ fontWeight: 700, color: 'var(--navy)', fontSize: 13 }}>❓ Questions ({questions.length})</div>
                  {/* Sélecteur de type pour ajouter */}
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {Object.entries(Q_TYPE_LABELS).map(([type, { icon, label }]) => (
                      <button key={type} className="btn btn-outline btn-sm"
                        style={{ fontSize: 11, padding: '3px 10px' }}
                        onClick={() => addQuestion(type)}
                        title={label}>
                        {icon} {label.split('—')[0].trim()}
                      </button>
                    ))}
                  </div>
                </div>

                {questions.length === 0 && (
                  <div style={{ textAlign: 'center', padding: '24px', border: '2px dashed var(--border)', borderRadius: 10, color: 'var(--text-muted)', fontSize: 14 }}>
                    Cliquez sur un type de question ci-dessus pour ajouter.
                  </div>
                )}

                {questions.map((q, i) => (
                  <div key={i} className="card" style={{ marginBottom: 14, border: '1px solid var(--border)' }}>
                    <div className="card-body">
                      {/* En-tête */}
                      <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginRight: 4 }}>
                          <button onClick={() => i > 0 && moveQuestion(i, i - 1)} disabled={i === 0}
                            style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 3, cursor: i === 0 ? 'not-allowed' : 'pointer', padding: '0 5px', fontSize: 10, opacity: i === 0 ? 0.3 : 1 }}>▲</button>
                          <button onClick={() => i < questions.length - 1 && moveQuestion(i, i + 1)} disabled={i === questions.length - 1}
                            style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 3, cursor: i === questions.length - 1 ? 'not-allowed' : 'pointer', padding: '0 5px', fontSize: 10, opacity: i === questions.length - 1 ? 0.3 : 1 }}>▼</button>
                        </div>
                        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', minWidth: 24 }}>#{i + 1}</span>
                        <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 10, background: '#f1f5f9', color: 'var(--text-muted)', fontWeight: 500, flexShrink: 0 }}>
                          {Q_TYPE_LABELS[q.type]?.icon} {Q_TYPE_LABELS[q.type]?.label}
                        </span>
                        {q.type !== 'fill' && (
                          <input className="form-input" style={{ flex: 1, minWidth: 120 }}
                            placeholder="Texte de la question *" value={q.text}
                            onChange={e => updateQ(i, 'text', e.target.value)} />
                        )}
                        <input className="form-input" style={{ width: 72, flexShrink: 0, textAlign: 'center' }}
                          type="number" min={0.5} step={0.5} value={q.points}
                          onChange={e => updateQ(i, 'points', parseFloat(e.target.value))} title="Points" />
                        <button className="btn btn-danger btn-sm" onClick={() => removeQuestion(i)}>✕</button>
                      </div>

                      {/* QCM 1 réponse */}
                      {q.type === 'mcq' && (
                        <div style={{ marginBottom: 8 }}>
                          {(q.choices || []).map((c, ci) => (
                            <div key={ci} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                              <input type="radio" name={`ans_${i}`} value={String(ci)}
                                checked={q.answer === String(ci)}
                                onChange={() => updateQ(i, 'answer', String(ci))} title="Bonne réponse" />
                              <input className="form-input" style={{ flex: 1 }}
                                placeholder={`Choix ${ci + 1}`} value={c}
                                onChange={e => updateChoice(i, ci, e.target.value)} />
                              {(q.choices || []).length > 2 && (
                                <button className="btn btn-outline btn-sm" style={{ padding: '2px 8px' }} onClick={() => removeChoice(i, ci)}>−</button>
                              )}
                            </div>
                          ))}
                          <button className="btn btn-outline btn-sm" style={{ marginTop: 4 }} onClick={() => addChoice(i)}>+ Choix</button>
                          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>◉ = bonne réponse</div>
                        </div>
                      )}

                      {/* QCM plusieurs réponses */}
                      {q.type === 'mcq_multi' && (
                        <div style={{ marginBottom: 8 }}>
                          {(q.choices || []).map((c, ci) => {
                            const isCorrect = Array.isArray(q.answer) && q.answer.includes(String(ci))
                            return (
                              <div key={ci} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                                <input type="checkbox" checked={isCorrect}
                                  onChange={() => {
                                    const curr = Array.isArray(q.answer) ? q.answer : []
                                    updateQ(i, 'answer', isCorrect ? curr.filter(v => v !== String(ci)) : [...curr, String(ci)])
                                  }} title="Bonne réponse" />
                                <input className="form-input" style={{ flex: 1 }}
                                  placeholder={`Choix ${ci + 1}`} value={c}
                                  onChange={e => updateChoice(i, ci, e.target.value)} />
                                {(q.choices || []).length > 2 && (
                                  <button className="btn btn-outline btn-sm" style={{ padding: '2px 8px' }} onClick={() => removeChoice(i, ci)}>−</button>
                                )}
                              </div>
                            )
                          })}
                          <button className="btn btn-outline btn-sm" style={{ marginTop: 4 }} onClick={() => addChoice(i)}>+ Choix</button>
                          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>☑ = bonnes réponses (plusieurs possibles)</div>
                        </div>
                      )}

                      {/* Vrai / Faux */}
                      {q.type === 'truefalse' && (
                        <div style={{ display: 'flex', gap: 16, marginBottom: 8 }}>
                          {[['true', '✓ Vrai'], ['false', '✗ Faux']].map(([v, label]) => (
                            <label key={v} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', padding: '6px 16px', borderRadius: 8, border: `1px solid ${q.answer === v ? '#93c5fd' : 'var(--border)'}`, background: q.answer === v ? '#eff6ff' : 'transparent' }}>
                              <input type="radio" name={`ans_${i}`} value={v} checked={q.answer === v} onChange={() => updateQ(i, 'answer', v)} />
                              <span style={{ fontSize: 14 }}>{label}</span>
                            </label>
                          ))}
                        </div>
                      )}

                      {/* Réponse courte */}
                      {q.type === 'short' && (
                        <div style={{ marginBottom: 8 }}>
                          <label className="form-label" style={{ fontSize: 12 }}>Réponse attendue exacte</label>
                          <input className="form-input" value={q.answer || ''} onChange={e => updateQ(i, 'answer', e.target.value)} placeholder="La bonne réponse (sensible à la casse)" />
                        </div>
                      )}

                      {/* Texte à trous */}
                      {q.type === 'fill' && (
                        <div style={{ marginBottom: 8 }}>
                          <label className="form-label" style={{ fontSize: 12 }}>Texte avec blancs *</label>
                          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6 }}>
                            Utilisez ____ (4 underscores) pour marquer chaque espace vide.
                          </div>
                          <textarea className="form-input" rows={3} style={{ resize: 'vertical', fontFamily: 'monospace', fontSize: 13 }}
                            value={q.text || ''}
                            onChange={e => updateQ(i, 'text', e.target.value)}
                            placeholder="Ex : Paris est la capitale de la ____." />
                          <label className="form-label" style={{ fontSize: 12, marginTop: 8 }}>Réponse(s) attendue(s)</label>
                          <input className="form-input" value={q.answer || ''}
                            onChange={e => updateQ(i, 'answer', e.target.value)}
                            placeholder="Ex : France (si plusieurs blancs, séparez par | )" />
                        </div>
                      )}

                      {/* Correspondance */}
                      {q.type === 'match' && (
                        <div style={{ marginBottom: 8 }}>
                          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8 }}>Définissez les paires Gauche → Droite</div>
                          {(q.choices || []).map((pair, ci) => (
                            <div key={ci} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                              <input className="form-input" style={{ flex: 1 }}
                                placeholder={`Gauche ${ci + 1}`}
                                value={typeof pair === 'object' ? (pair.left || '') : ''}
                                onChange={e => updateChoice(i, ci, { left: e.target.value })} />
                              <span style={{ color: 'var(--text-muted)', fontSize: 18, flexShrink: 0 }}>↔</span>
                              <input className="form-input" style={{ flex: 1 }}
                                placeholder={`Droite ${ci + 1}`}
                                value={typeof pair === 'object' ? (pair.right || '') : ''}
                                onChange={e => updateChoice(i, ci, { right: e.target.value })} />
                              {(q.choices || []).length > 2 && (
                                <button className="btn btn-outline btn-sm" style={{ padding: '2px 8px', flexShrink: 0 }} onClick={() => removeChoice(i, ci)}>−</button>
                              )}
                            </div>
                          ))}
                          <button className="btn btn-outline btn-sm" style={{ marginTop: 4 }} onClick={() => addChoice(i)}>+ Paire</button>
                        </div>
                      )}

                      {/* Classement */}
                      {q.type === 'order' && (
                        <div style={{ marginBottom: 8 }}>
                          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8 }}>
                            Saisissez les éléments dans le bon ordre. Les étudiants devront les reclasser.
                          </div>
                          {(q.choices || []).map((c, ci) => (
                            <div key={ci} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', minWidth: 22 }}>{ci + 1}.</span>
                              <input className="form-input" style={{ flex: 1 }}
                                placeholder={`Élément ${ci + 1}`} value={c}
                                onChange={e => updateChoice(i, ci, e.target.value)} />
                              {(q.choices || []).length > 2 && (
                                <button className="btn btn-outline btn-sm" style={{ padding: '2px 8px' }} onClick={() => removeChoice(i, ci)}>−</button>
                              )}
                            </div>
                          ))}
                          <button className="btn btn-outline btn-sm" style={{ marginTop: 4 }} onClick={() => addChoice(i)}>+ Élément</button>
                        </div>
                      )}

                      {/* Ouverte & Upload */}
                      {(q.type === 'open' || q.type === 'upload') && (
                        <div style={{ fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic', marginBottom: 8, padding: '8px 12px', background: '#f8fafc', borderRadius: 6, border: '1px solid var(--border)' }}>
                          {q.type === 'upload' ? '📎 L\'étudiant devra déposer un fichier. Correction manuelle.' : '📝 Réponse libre. Correction manuelle par l\'enseignant.'}
                        </div>
                      )}

                      {/* Explication */}
                      {['mcq', 'mcq_multi', 'truefalse', 'short', 'fill', 'order', 'match'].includes(q.type) && (
                        <input className="form-input" style={{ fontSize: 12, marginTop: 6 }}
                          placeholder="💡 Explication affichée après correction (optionnel)"
                          value={q.explanation || ''}
                          onChange={e => updateQ(i, 'explanation', e.target.value)} />
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-outline" onClick={() => setCreating(false)}>Annuler</button>
              <button className="btn btn-primary" onClick={saveExam}>
                {editingExam ? 'Enregistrer les modifications' : "Créer l'examen"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
