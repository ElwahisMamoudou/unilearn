import { useEffect, useState, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
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
const catGrad = (id) => CAT_GRADIENTS[(id||0) % CAT_GRADIENTS.length]
const catIcon = (name='') => {
  const l = name.toLowerCase()
  if (l.includes('info')||l.includes('prog')||l.includes('algo')) return '💻'
  if (l.includes('math')) return '📐'
  if (l.includes('phys')) return '⚛️'
  if (l.includes('chim')) return '🧪'
  if (l.includes('bio')) return '🧬'
  if (l.includes('meca')||l.includes('tim')) return '⚙️'
  if (l.includes('elec')) return '⚡'
  return '📚'
}

const TABS_ADMIN_TEACHER = ['overview', 'students', 'courses', 'forum', 'homeworks', 'exams', 'sessions']
const TABS_STUDENT       = ['courses', 'forum', 'homeworks', 'exams', 'sessions']

const TAB_LABELS = {
  overview:  'Accueil',
  students:  'Etudiants',
  courses:   'Cours & Lecons',
  forum:     'Forum',
  homeworks: 'Devoirs',
  exams:     'Examens',
  sessions:  'Cours en ligne',
}

const Q_TYPE_LABELS = {
  mcq:       { label: 'QCM — 1 reponse' },
  mcq_multi: { label: 'QCM — plusieurs reponses' },
  truefalse: { label: 'Vrai / Faux' },
  short:     { label: 'Reponse courte' },
  open:      { label: 'Reponse ouverte' },
  fill:      { label: 'Texte a trous' },
  match:     { label: 'Correspondance' },
  order:     { label: 'Classement' },
  upload:    { label: 'Fichier a remettre' },
}

export default function ClassDetail() {
  const { id }   = useParams()
  const navigate = useNavigate()
  const { user } = useAuthStore()

  const isAdmin   = user?.role === 'admin'
  const isTeacher = user?.role === 'teacher'
  const isStudent = user?.role === 'student'
  const canManage = isAdmin || isTeacher

  const TABS = isStudent ? TABS_STUDENT : TABS_ADMIN_TEACHER

  const [tab,         setTab]         = useState(TABS[0])
  const [cls,         setCls]         = useState(null)
  const [students,    setStudents]    = useState([])
  const [courses,     setCourses]     = useState([])
  const [homeworks,   setHomeworks]   = useState([])
  const [exams,       setExams]       = useState([])
  const [sessions,    setSessions]    = useState([])
  const [allUsers,    setAllUsers]    = useState([])
  const [allCourses,  setAllCourses]  = useState([])
  const [loading,     setLoading]     = useState(true)
  const [msg,         setMsg]         = useState({ text: '', type: '' })

  // ── Leçons ──
  const [selCourse,   setSelCourse]   = useState(null)
  const [lessons,     setLessons]     = useState([])
  const [uploadModal, setUploadModal] = useState(false)
  const [lessonForm,  setLessonForm]  = useState({ title: '', duration: '', order: 0 })
  const [lessonFile,  setLessonFile]  = useState(null)
  const [uploading,   setUploading]   = useState(false)
  const [dragOver,    setDragOver]    = useState(false)
  const fileRef = useRef()

  // ── Sessions ──
  const [sessionModal, setSessionModal] = useState(false)
  const [sessionForm,  setSessionForm]  = useState({ title: '', scheduled_at: '', course_id: '' })

  // ── Devoirs ──
  const [hwModal,    setHwModal]    = useState(false)
  const [hwForm,     setHwForm]     = useState({ title: '', description: '', due_date: '', max_score: 20, course_id: '', is_published: false })
  const [hwFile,     setHwFile]     = useState(null)       // ← fichier joint optionnel
  const [hwDragOver, setHwDragOver] = useState(false)
  const hwFileRef = useRef()

  // ── Cours (création) ──
  const [courseCreateModal, setCourseCreateModal] = useState(false)
  const [courseCreateForm,  setCourseCreateForm]  = useState({ title: '', description: '', teacher_id: '', category_id: '', is_published: true })
  const [categories, setCategories] = useState([])
  const [courseCreatedId,  setCourseCreatedId]  = useState(null)
  const [pendingThumb,     setPendingThumb]     = useState(null)
  const [courseThumbPreview, setCourseThumbPreview] = useState(null)
  const [assigningTeacherCourseId, setAssigningTeacherCourseId] = useState(null)
  const courseThumbRef = useRef()

  // ── Examens ──
  const [exModal, setExModal] = useState(false)
  const EMPTY_EX_FORM = {
    title: '', description: '', duration_min: 60, course_id: '',
    is_published: false, starts_at: '', ends_at: '',
    shuffle_questions: false, max_attempts: 1, passing_score: '', show_score_after: 'immediately',
  }
  const [exForm,    setExForm]    = useState(EMPTY_EX_FORM)
  const [questions, setQuestions] = useState([])

  // ── Flash ──────────────────────────────────────────────────────────────
  const flash = (text, type = 'success') => {
    setMsg({ text, type })
    setTimeout(() => setMsg({ text: '', type: '' }), 3500)
  }

  // ── Rechargement cours ─────────────────────────────────────────────────
  const reloadCourses = useCallback(async () => {
    try {
      const detail = await api.get(`/classes/${id}`)
      if (detail.data.courses) setCourses(detail.data.courses)
    } catch {}
  }, [id])

  // ── Init ───────────────────────────────────────────────────────────────
  useEffect(() => {
    const init = async () => {
      try {
        const [clr, str] = await Promise.all([
          api.get(`/classes/${id}`),
          api.get(`/classes/${id}/students`),
        ])
        setCls(clr.data)
        setStudents(str.data)

        if (clr.data.courses) {
          setCourses(clr.data.courses)
        } else {
          const classId = parseInt(id)
          const belongsToClass = c => Number(c.class_group_id ?? c.class_id) === classId
          const cr = await api.get('/courses/my')
          setCourses(cr.data.filter(belongsToClass))
        }

        if (isAdmin) {
          const [ur, acr, cats] = await Promise.all([
            api.get('/admin/users'),
            api.get('/admin/courses'),
            api.get('/categories').catch(() => ({ data: [] })),
          ])
          setAllUsers(ur.data)
          setAllCourses(acr.data)
          setCategories(cats.data)
          if (!clr.data.courses) {
             setCourses(acr.data.filter(c => Number(c.class_group_id ?? c.class_id) === parseInt(id)))
          }
        }
      } catch {}
      setLoading(false)
    }
    init()
  }, [id])

  // ── Chargement par onglet ──────────────────────────────────────────────
  const loadTab = async (t, force = false) => {
    if (t === 'homeworks' && (homeworks.length === 0 || force) && courses.length > 0) {
      const all = []
      for (const c of courses) {
        const r = await api.get(`/homeworks/course/${c.id}`).catch(() => ({ data: [] }))
        all.push(...r.data.map(h => ({ ...h, course_title: c.title })))
      }
      setHomeworks(all)
    }
    if (t === 'exams' && (exams.length === 0 || force) && courses.length > 0) {
      const all = []
      for (const c of courses) {
        const r = await api.get(`/exams/course/${c.id}`).catch(() => ({ data: [] }))
        all.push(...r.data.map(e => ({ ...e, course_title: c.title })))
      }
      setExams(all)
    }
    if (t === 'sessions' && (sessions.length === 0 || force) && courses.length > 0) {
      const all = []
      for (const c of courses) {
        const r = await api.get(`/sessions/course/${c.id}`).catch(() => ({ data: [] }))
        all.push(...r.data.map(s => ({ ...s, course_title: c.title })))
      }
      setSessions(all)
    }
  }

  const switchTab = (t) => { setTab(t); loadTab(t) }
  useEffect(() => { if (courses.length > 0) loadTab(tab) }, [courses])

  // ── Actions leçons ─────────────────────────────────────────────────────
  const openCourse = async (c) => {
    if (selCourse?.id === c.id) { setSelCourse(null); return }
    const r = await api.get(`/courses/${c.id}/lessons`)
    setLessons(r.data)
    setSelCourse(c)
  }

  const uploadLesson = async (e) => {
    e.preventDefault()
    if (!lessonFile) return flash('Selectionnez un fichier', 'error')
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('course_id', selCourse.id)
      fd.append('title', lessonForm.title)
      fd.append('duration', lessonForm.duration)
      fd.append('order', lessonForm.order)
      fd.append('file', lessonFile)
      await api.post('/lessons/upload', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
      flash('Lecon ajoutee !')
      setUploadModal(false)
      setLessonForm({ title: '', duration: '', order: 0 })
      setLessonFile(null)
      const r = await api.get(`/courses/${selCourse.id}/lessons`)
      setLessons(r.data)
    } catch (err) {
      flash(err.response?.data?.detail || 'Erreur upload', 'error')
    } finally {
      setUploading(false)
    }
  }

  const deleteLesson = async (lessonId) => {
    if (!confirm('Supprimer cette lecon ?')) return
    await api.delete(`/lessons/${lessonId}`)
    flash('Lecon supprimee')
    const r = await api.get(`/courses/${selCourse.id}/lessons`)
    setLessons(r.data)
  }

  // ── Actions sessions ───────────────────────────────────────────────────
  const createSession = async (e) => {
    e.preventDefault()
    try {
      await api.post('/sessions', {
        course_id:    parseInt(sessionForm.course_id),
        title:        sessionForm.title,
        scheduled_at: sessionForm.scheduled_at ? new Date(sessionForm.scheduled_at).toISOString() : null,
      })
      flash('Session creee !')
      setSessionModal(false)
      setSessionForm({ title: '', scheduled_at: '', course_id: '' })
      setSessions([])
      loadTab('sessions', true)
    } catch (err) {
      flash(err.response?.data?.detail || 'Erreur', 'error')
    }
  }

  const startSession  = async (s) => { await api.post(`/sessions/${s.id}/start`); flash('Session demarree !'); setSessions([]); loadTab('sessions', true); navigate(`/room/${s.room_id}`) }
  const endSession    = async (s) => { await api.post(`/sessions/${s.id}/end`); flash('Session terminee'); setSessions([]); loadTab('sessions', true) }
  const deleteSession = async (s) => { if (!confirm('Supprimer cette session ?')) return; await api.delete(`/sessions/${s.id}`); flash('Session supprimee'); setSessions([]); loadTab('sessions', true) }

  // ── Création devoir avec fichier joint optionnel ───────────────────────
  const createHomework = async (e) => {
    e.preventDefault()
    if (!hwForm.course_id) return flash('Selectionnez un cours', 'error')
    if (!hwForm.title.trim()) return flash('Le titre est requis', 'error')
    if (!hwForm.due_date) return flash('La date limite est requise', 'error')

    try {
      // FormData obligatoire car on peut avoir un fichier joint.
      // FastAPI reçoit les champs via Form(...) et le fichier via File(None).
      const fd = new FormData()
      fd.append('course_id',    hwForm.course_id)
      fd.append('title',        hwForm.title.trim())
      fd.append('description',  hwForm.description || '')
      fd.append('due_date',     new Date(hwForm.due_date).toISOString())
      fd.append('max_score',    String(parseFloat(hwForm.max_score) || 20))
      fd.append('is_published', String(hwForm.is_published))
      if (hwFile) fd.append('file', hwFile)

      await api.post('/homeworks', fd, { headers: { 'Content-Type': 'multipart/form-data' } })

      flash('Devoir cree !')
      setHwModal(false)
      setHwFile(null)
      setHwForm({ title: '', description: '', due_date: '', max_score: 20, course_id: '', is_published: false })
      setHomeworks([])
      loadTab('homeworks', true)
    } catch (err) {
      const d = err.response?.data?.detail
      flash(Array.isArray(d) ? d.map(x => x.msg).join(' | ') : d || 'Erreur', 'error')
    }
  }

  const downloadHomeworkFile = async (hw) => {
    try {
      const r = await api.get(`/homeworks/${hw.id}/file`, { responseType: 'blob' })
      const url = URL.createObjectURL(r.data)
      const a = document.createElement('a')
      a.href = url
      a.download = hw.file_path?.split('/').pop() || `${hw.title || 'devoir'}`
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      flash(err.response?.data?.detail || 'Impossible de télécharger le fichier', 'error')
    }
  }

  const deleteHomework = async (hwId) => {
    if (!confirm('Supprimer ce devoir ?')) return
    await api.delete(`/homeworks/${hwId}`)
    flash('Devoir supprime')
    setHomeworks([])
    loadTab('homeworks', true)
  }

  const assignTeacherToCourse = async (courseId, teacherId) => {
  if (!teacherId) return
  setAssigningTeacherCourseId(courseId)
  try {
    await api.patch(`/admin/courses/${courseId}/teacher`, { teacher_id: parseInt(teacherId) })
    flash('Enseignant inscrit au cours !')
    const [acr, detail] = await Promise.all([
      api.get('/admin/courses'),
      api.get(`/classes/${id}`),
    ])
    setAllCourses(acr.data)
    if (detail.data.courses) setCourses(detail.data.courses)
  } catch (err) {
    flash(err.response?.data?.detail || 'Erreur assignation enseignant', 'error')
  } finally {
    setAssigningTeacherCourseId(null)
  }
}
  
  // ── Création cours pour la classe ──────────────────────────────────────
  const createCourseForClass = async (e) => {
    e.preventDefault()
    if (!courseCreateForm.title.trim()) return flash('Le titre est requis', 'error')
    if (!courseCreateForm.teacher_id)   return flash('Selectionnez un enseignant', 'error')
    try {
      const { data: newCourse } = await api.post('/admin/courses', {
        title:        courseCreateForm.title,
        description:  courseCreateForm.description || null,
        teacher_id:   parseInt(courseCreateForm.teacher_id),
        category_id:  courseCreateForm.category_id ? parseInt(courseCreateForm.category_id) : null,
        is_published: courseCreateForm.is_published,
        class_id:     parseInt(id),
      })
      // Upload thumbnail si présent
      if (pendingThumb instanceof File) {
        try {
          const fd = new FormData()
          fd.append('file', pendingThumb)
          await api.post(`/admin/courses/${newCourse.id}/thumbnail`, fd, { headers: { 'Content-Type': 'multipart/form-data' } })
        } catch {}
      }
      flash('Cours cree et associe a la classe !')
      setCourseCreateModal(false)
      setCourseCreatedId(null)
      setPendingThumb(null)
      setCourseThumbPreview(null)
      const [acr, detail] = await Promise.all([api.get('/admin/courses'), api.get(`/classes/${id}`)])
      setAllCourses(acr.data)
      if (detail.data.courses) {
        setCourses(detail.data.courses)
      } else {
          setCourses(acr.data.filter(c => Number(c.class_group_id ?? c.class_id) === parseInt(id)))
      }
    } catch (err) {
      flash(err.response?.data?.detail || 'Erreur', 'error')
    }
  }

  // ── Questions d'examen ─────────────────────────────────────────────────
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

  const addQuestion  = (type = 'mcq') => setQuestions(q => [...q, EMPTY_QUESTION(type)])
  const removeQ      = (i) => setQuestions(q => q.filter((_, j) => j !== i))
  const updateQ      = (i, f, v) => setQuestions(q => { const a = [...q]; a[i] = { ...a[i], [f]: v }; return a })
  const moveQuestion = (from, to) => setQuestions(q => { const a = [...q]; const [m] = a.splice(from, 1); a.splice(to, 0, m); return a })
  const updateChoice = (qi, ci, val) => setQuestions(q => {
    const a = [...q]
    if (typeof a[qi].choices[ci] === 'object') { a[qi].choices[ci] = { ...a[qi].choices[ci], ...val } }
    else { a[qi].choices[ci] = val }
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
  const addChoice    = (qi) => setQuestions(q => { const a = [...q]; const isMatch = a[qi].type === 'match'; a[qi].choices = [...(a[qi].choices || []), isMatch ? { left: '', right: '' } : '']; return a })
  const removeChoice = (qi, ci) => setQuestions(q => { const a = [...q]; a[qi].choices = a[qi].choices.filter((_, j) => j !== ci); return a })

  // ── Création examen ────────────────────────────────────────────────────
  const createExam = async (e) => {
    e.preventDefault()
    if (!exForm.course_id)      return flash('Selectionnez un cours', 'error')
    if (!exForm.title.trim())   return flash('Le titre est requis', 'error')
    if (questions.length === 0) return flash('Ajoutez au moins une question', 'error')
    for (let i = 0; i < questions.length; i++) {
      const q = questions[i]
      if (q.type !== 'fill' && !q.text.trim()) return flash(`Question ${i + 1} : le texte est requis`, 'error')
      if ((q.type === 'mcq' || q.type === 'mcq_multi') && q.choices.filter(c => (typeof c === 'string' ? c : c.left || '').trim()).length < 2)
        return flash(`Question ${i + 1} : au moins 2 choix requis`, 'error')
    }
    try {
      await api.post('/exams', {
        course_id: parseInt(exForm.course_id), title: exForm.title, description: exForm.description || null,
        duration_min: parseInt(exForm.duration_min), is_published: exForm.is_published,
        starts_at: exForm.starts_at || null, ends_at: exForm.ends_at || null,
        shuffle_questions: exForm.shuffle_questions, max_attempts: parseInt(exForm.max_attempts) || 1,
        passing_score: exForm.passing_score !== '' ? parseFloat(exForm.passing_score) : null,
        show_score_after: exForm.show_score_after,
        questions: questions.map((q, i) => ({
          order: i, type: q.type, text: q.text.trim(), points: q.points, explanation: q.explanation || null,
          choices: examChoicesForPayload(q),
          answer: examAnswerForPayload(q),
        })),
      })
      flash('Examen cree !')
      setExModal(false)
      setQuestions([])
      setExams([])
      loadTab('exams', true)
    } catch (err) {
      const d = err.response?.data?.detail
      flash(Array.isArray(d) ? d.map(x => x.msg).join(' | ') : d || 'Erreur', 'error')
    }
  }

  const deleteExam = async (exId) => {
    if (!confirm('Supprimer cet examen ?')) return
    await api.delete(`/exams/${exId}`)
    flash('Examen supprime')
    setExams([])
    loadTab('exams', true)
  }

  // ── Actions étudiants ──────────────────────────────────────────────────
  const enrollToCourse = async (courseId) => {
    try {
      const r = await api.post(`/classes/${id}/enroll-course/${courseId}`)
      flash(`${r.data.enrolled} etudiant(s) inscrit(s) au cours "${r.data.course}"`)
    } catch (err) { flash(err.response?.data?.detail || 'Erreur', 'error') }
  }

  const addStudent = async (sid) => {
    try {
      await api.post(`/classes/${id}/students`, { student_ids: [sid] })
      flash('Etudiant ajoute')
      const r = await api.get(`/classes/${id}/students`)
      setStudents(r.data)
    } catch (err) { flash(err.response?.data?.detail || 'Erreur', 'error') }
  }

  const removeStudent = async (sid) => {
    await api.delete(`/classes/${id}/students/${sid}`)
    flash('Etudiant retire')
    const r = await api.get(`/classes/${id}/students`)
    setStudents(r.data)
  }

  const setMatricule = async (sid, current) => {
    const m = prompt('Numero de matricule :', current || '')
    if (!m) return
    try {
      await api.patch(`/classes/students/${sid}/matricule?matricule=${m}`)
      flash('Matricule enregistre')
      const r = await api.get(`/classes/${id}/students`)
      setStudents(r.data)
    } catch (err) { flash(err.response?.data?.detail || 'Erreur', 'error') }
  }

  // ── Garde ──────────────────────────────────────────────────────────────
  if (loading) return <div className="loading-overlay"><div className="spinner" /></div>
  if (!cls)    return <div className="loading-overlay">Classe introuvable</div>

  const notInClass = allUsers.filter(u => u.role === 'student' && !students.find(s => s.id === u.id))
  const courseBelongsToClass = c => Number(c.class_group_id ?? c.class_id) === Number(id)
  const canManageCourse = c => isAdmin || (isTeacher && (c.teacher_id === user?.id || courseBelongsToClass(c)))
  const manageableCourses = courses.filter(canManageCourse)
  const firstManageableCourse = manageableCourses[0]

  return (
    <div>
      {msg.text && (
        <div className={`alert alert-${msg.type === 'error' ? 'error' : 'success'}`}>
          {msg.text}
        </div>
      )}

      {/* ── En-tête ── */}
      <div style={{ background: 'linear-gradient(135deg, var(--navy), #1a3a6e)', borderRadius: 16, padding: '24px 28px', marginBottom: 24, color: '#fff', display: 'flex', alignItems: 'center', gap: 18 }}>
        <button onClick={() => navigate('/classes')} style={{ background: 'rgba(255,255,255,.15)', border: 'none', color: '#fff', borderRadius: 8, padding: '6px 12px', cursor: 'pointer', fontSize: 13 }}>
          Classes
        </button>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <h2 style={{ fontFamily: 'Playfair Display, serif', fontSize: 20, margin: 0 }}>{cls.name}</h2>
            {cls.code && <span style={{ fontSize: 11, background: 'rgba(255,255,255,.2)', padding: '2px 8px', borderRadius: 20 }}>{cls.code}</span>}
          </div>
          <div style={{ opacity: .65, fontSize: 12, marginTop: 4, display: 'flex', gap: 16 }}>
            {cls.level              && <span>{cls.level}</span>}
            {cls.academic_year_name && <span>{cls.academic_year_name}</span>}
            {cls.teacher_name       && <span>Enseignant : {cls.teacher_name}</span>}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 20 }}>
          {[['Etudiants', students.length], ['Cours', courses.length]].map(([l, v]) => (
            <div key={l} style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 22, fontWeight: 700 }}>{v}</div>
              <div style={{ fontSize: 11, opacity: .6 }}>{l}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Onglets ── */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', marginBottom: 24, overflowX: 'auto' }}>
        {TABS.map(t => (
          <button key={t} onClick={() => switchTab(t)} style={{ padding: '10px 18px', border: 'none', background: 'none', cursor: 'pointer', fontSize: 14, fontWeight: 500, whiteSpace: 'nowrap', borderBottom: tab === t ? '2px solid var(--blue)' : '2px solid transparent', color: tab === t ? 'var(--blue)' : 'var(--text-muted)' }}>
            {TAB_LABELS[t]}
          </button>
        ))}
      </div>

      {/* ════════════════════════════════════════════════
          OVERVIEW
      ════════════════════════════════════════════════ */}
      {tab === 'overview' && (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 14, marginBottom: 24 }}>
            {[
              { label: 'Etudiants',      value: `${students.length}/${cls.max_students}`, t: 'students'  },
              { label: 'Cours',          value: courses.length,                            t: 'courses'   },
              { label: 'Forum',          value: 'Discussion',                              t: 'forum'     },
              { label: 'Devoirs',        value: '—',                                       t: 'homeworks' },
              { label: 'Examens',        value: '—',                                       t: 'exams'     },
              { label: 'Cours en ligne', value: '—',                                       t: 'sessions'  },
            ].map((s, i) => (
              <div key={i} className="card" style={{ cursor: 'pointer' }} onClick={() => switchTab(s.t)}>
                <div className="card-body">
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{s.label}</div>
                  <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--navy)' }}>{s.value}</div>
                </div>
              </div>
            ))}
          </div>
           {canManage && manageableCourses.length > 0 && (    
            <div>
              <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--navy)', marginBottom: 10 }}>Actions rapides</div>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <button className="btn btn-outline" onClick={() => { switchTab('courses'); setTimeout(() => openCourse(firstManageableCourse), 100) }}>Ajouter une lecon</button>
                <button className="btn btn-outline" onClick={() => { setHwModal(true); setHwForm({ title: '', description: '', due_date: '', max_score: 20, course_id: firstManageableCourse?.id || '', is_published: false }); setHwFile(null) }}>Creer un devoir</button>
                <button className="btn btn-outline" onClick={() => { setExModal(true); setExForm({ ...EMPTY_EX_FORM, course_id: firstManageableCourse?.id || '' }); setQuestions([]) }}>Creer un examen</button>
                <button className="btn btn-primary" onClick={() => { setSessionModal(true); setSessionForm({ title: '', scheduled_at: '', course_id: firstManageableCourse?.id || '' }) }}>Demarrer cours en ligne</button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ════════════════════════════════════════════════
          STUDENTS
      ════════════════════════════════════════════════ */}
      {tab === 'students' && (
        <div style={{ display: 'grid', gridTemplateColumns: isAdmin ? '1fr 1fr' : '1fr', gap: 24 }}>
          <div>
            <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 12, color: 'var(--navy)' }}>Inscrits ({students.length}/{cls.max_students})</div>
            {students.length === 0
              ? <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>Aucun etudiant inscrit.</div>
              : students.map(s => (
                <div key={s.id} className="card" style={{ marginBottom: 8 }}>
                  <div className="card-body" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 34, height: 34, borderRadius: '50%', background: '#eff6ff', color: 'var(--blue)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 12, flexShrink: 0 }}>
                      {s.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--navy)' }}>{s.name}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                        {s.email}
                        {s.matricule && <span style={{ marginLeft: 8, background: '#ede9fe', color: '#7c3aed', padding: '1px 6px', borderRadius: 10, fontSize: 10, fontWeight: 600 }}>{s.matricule}</span>}
                      </div>
                    </div>
                    {isAdmin && (
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button className="btn btn-outline btn-sm" style={{ fontSize: 11 }} onClick={() => setMatricule(s.id, s.matricule)}>Matricule</button>
                        <button className="btn btn-danger btn-sm"  style={{ fontSize: 11 }} onClick={() => removeStudent(s.id)}>Retirer</button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
          </div>
          {isAdmin && (
            <div>
              <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 12, color: 'var(--navy)' }}>Inscrire un etudiant</div>
              {notInClass.length === 0
                ? <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>Tous les etudiants sont inscrits.</div>
                : notInClass.map(s => (
                  <div key={s.id} className="card" style={{ marginBottom: 8 }}>
                    <div className="card-body" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--navy)' }}>{s.name}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{s.email}</div>
                      </div>
                      <button className="btn btn-primary btn-sm" onClick={() => addStudent(s.id)}>+ Inscrire</button>
                    </div>
                  </div>
                ))}
            </div>
          )}
        </div>
      )}

      {/* ════════════════════════════════════════════════
          COURSES
      ════════════════════════════════════════════════ */}
      {tab === 'courses' && (
        <div>
          {isAdmin && (
            <div style={{ marginBottom: 20, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
              <button className="btn btn-primary btn-sm" onClick={() => {
                setCourseCreateForm({ title: '', description: '', teacher_id: cls.teacher_id ? String(cls.teacher_id) : '', category_id: '', is_published: true })
                setCourseCreateModal(true)
              }}>
                + Creer un cours pour cette classe
              </button>
              <div style={{ flex: 1, minWidth: 260, display: 'flex', gap: 8, padding: '10px 14px', background: '#f8fafc', borderRadius: 10, border: '1px solid var(--border)', alignItems: 'center' }}>
                <select className="form-select" style={{ flex: 1 }} id="course-sel">
                  <option value="">-- Associer un cours existant --</option>
                  {allCourses.map(c => <option key={c.id} value={c.id}>{c.title} ({c.teacher_name})</option>)}
                </select>
                <button className="btn btn-outline btn-sm" onClick={() => { const v = document.getElementById('course-sel').value; if (v) enrollToCourse(v) }}>Inscrire la classe</button>
              </div>
            </div>
          )}

          {courses.length === 0 ? (
            <div className="empty-state"><h3>Aucun cours</h3><p>Creez le premier cours pour cette classe.</p></div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 20 }}>
              {courses.map(c => {
                const thumb = thumbUrl(c.thumbnail)
                const [g0, g1] = catGrad(c.category_id || c.id)
                const icon = catIcon(c.category_name || c.title)
                const pct = Math.round(c.progress_pct || 0)
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
                    {/* ── IMAGE / ICÔNE ── */}
                    <div style={{ height: 200, position: 'relative', overflow: 'hidden', flexShrink: 0 }}>
                      <div style={{
                        position: 'absolute', inset: 0,
                        background: thumb ? `url(${thumb}) center/cover no-repeat` : `linear-gradient(145deg, ${g0} 0%, ${g1} 100%)`,
                        transition: 'transform .4s ease',
                      }} />
                      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(0,0,0,.65) 0%, transparent 55%)' }} />
                      {!thumb && (
                        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 70, filter: 'drop-shadow(0 4px 12px rgba(0,0,0,.3))' }}>
                          {icon}
                        </div>
                      )}
                      {/* Badge publié */}
                      <div style={{ position: 'absolute', top: 12, right: 12, background: c.is_published ? 'rgba(34,197,94,.9)' : 'rgba(245,158,11,.9)', color: '#fff', fontSize: 10, fontWeight: 800, padding: '4px 10px', borderRadius: 20 }}>
                        {c.is_published ? '✓ PUBLIÉ' : '✏ BROUILLON'}
                      </div>
                      {/* Titre sur image */}
                      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '12px 16px' }}>
                        <div style={{ fontWeight: 800, fontSize: 15, color: '#fff', textShadow: '0 2px 8px rgba(0,0,0,.5)', lineHeight: 1.3 }}>{c.title}</div>
                      </div>
                      {/* Barre progression */}
                      {isStudent && pct > 0 && (
                        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 4, background: 'rgba(255,255,255,.2)' }}>
                          <div style={{ height: '100%', width: `${pct}%`, background: pct === 100 ? '#22c55e' : '#3b82f6', transition: 'width .6s' }} />
                        </div>
                      )}
                    </div>

                    {/* ── INFOS ── */}
                    <div style={{ padding: '14px 16px', flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <div style={{ display: 'flex', gap: 12, fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>
                        <span>👨‍🏫 {c.teacher_name || 'Non assigné'}</span>
                        <span>📖 {c.lesson_count || 0} leçon(s)</span>
                        {isStudent && <span style={{ color: pct === 100 ? '#22c55e' : 'var(--blue)' }}>{pct}%</span>}
                      </div>

                      {/* ── ACTIONS ── */}
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
                        <button className="btn btn-primary btn-sm" style={{ flex: 1 }}
                          onClick={() => navigate(`/courses/${c.id}`)}>
                          Voir →
                        </button>
                        <button className="btn btn-outline btn-sm"
                          onClick={() => openCourse(c)}>
                          {expanded ? 'Fermer' : 'Leçons'}
                        </button>
                        {canManageCourse(c) && (
                          <button className="btn btn-outline btn-sm"
                            onClick={() => { setSelCourse(c); setLessonForm({ title: '', duration: '', order: c.lesson_count }); setLessonFile(null); setUploadModal(true); openCourse(c) }}>
                            + Leçon
                          </button>
                        )}
                      </div>
                          {isAdmin && (
                        <div style={{ marginTop: 10, padding: 10, borderRadius: 10, background: '#f8fafc', border: '1px solid var(--border)' }}>
                          <label className="form-label" style={{ fontSize: 11, marginBottom: 6 }}>
                            Inscrire / changer l'enseignant
                          </label>
                          <select
                            className="form-select"
                            value={c.teacher_id || ''}
                            disabled={assigningTeacherCourseId === c.id}
                            onChange={e => assignTeacherToCourse(c.id, e.target.value)}
                          >
                            <option value="">-- Choisir un enseignant --</option>
                            {allUsers.filter(u => u.role === 'teacher').map(t => (
                              <option key={t.id} value={t.id}>{t.name}</option>
                            ))}
                          </select>
                          {assigningTeacherCourseId === c.id && (
                            <div style={{ marginTop: 6, fontSize: 11, color: 'var(--text-muted)' }}>
                              Enregistrement...
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* ── LEÇONS EXPANDÉES ── */}
                    {expanded && (
                      <div style={{ borderTop: '1px solid var(--border)', padding: '12px 16px', background: '#f8fafc' }}>
                        {lessons.length === 0 ? (
                          <div style={{ fontSize: 13, color: 'var(--text-muted)', padding: '4px 0' }}>Aucune leçon.</div>
                        ) : lessons.map((l, i) => (
                          <div key={l.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 0', borderBottom: i < lessons.length - 1 ? '1px solid var(--border)' : 'none' }}>
                            <div style={{ width: 24, height: 24, borderRadius: 6, flexShrink: 0, background: l.type === 'pdf' ? '#dbeafe' : '#dcfce7', color: l.type === 'pdf' ? '#1d4ed8' : '#16a34a', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12 }}>
                              {l.type === 'pdf' ? '📄' : '🎬'}
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--navy)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.title}</div>
                              <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{l.type === 'pdf' ? 'PDF' : 'Vidéo'}{l.duration ? ` · ${l.duration}` : ''}</div>
                            </div>
                            {l.file_path && (
                              <button className="btn btn-outline btn-sm" style={{ fontSize: 10, padding: '2px 8px' }} onClick={() => navigate(`/lesson/${l.id}`)}>
                                Ouvrir
                              </button>
                            )}
                            {canManage && (
                              <button className="btn btn-danger btn-sm" style={{ fontSize: 10, padding: '2px 6px' }} onClick={() => deleteLesson(l.id)}>×</button>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ════════════════════════════════════════════════
          FORUM
      ════════════════════════════════════════════════ */}
      {tab === 'forum' && (
        <ForumTab
          courses={courses}
          user={user}
          canPost={canManage || isStudent}
        />
      )}

      {/* ════════════════════════════════════════════════
          HOMEWORKS
      ════════════════════════════════════════════════ */}
      {tab === 'homeworks' && (
        <div>
          {canManage && courses.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <button className="btn btn-primary btn-sm" onClick={() => {
                setHwModal(true)
                setHwFile(null)
                setHwForm({ title: '', description: '', due_date: '', max_score: 20, course_id: courses[0]?.id || '', is_published: false })
              }}>
                + Creer un devoir
              </button>
            </div>
          )}
          {homeworks.length === 0
            ? <div className="empty-state"><h3>Aucun devoir</h3></div>
            : homeworks.map(hw => {
              const due  = new Date(hw.due_date)
              const late = new Date() > due
              return (
                <div key={hw.id} className="card" style={{ marginBottom: 10 }}>
                  <div className="card-body" style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--navy)' }}>{hw.title}</div>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 3 }}>
                        {hw.course_title} · {due.toLocaleDateString('fr-FR')} · /{hw.max_score}
                        {late && <span style={{ color: '#ef4444', marginLeft: 8, fontWeight: 600 }}>Delai depasse</span>}
                        {canManage && <span style={{ marginLeft: 8 }}>· {hw.submission_count || 0} soumission(s)</span>}
                      </div>
                      {/* Indicateur fichier joint */}
                      {hw.has_file && (
                        <div style={{ marginTop: 4 }}>
                          <button
                            type="button"
                            className="btn btn-outline btn-sm"
                            onClick={() => downloadHomeworkFile(hw)}
                            📎 Fichier joint — télécharger
                           </button>
                        </div>
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
                      {hw.is_published ? 'Publie' : 'Brouillon'}
                    </span>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button className="btn btn-outline btn-sm" onClick={() => navigate(`/homeworks?course=${hw.course_id}`)}>
                        {isStudent ? 'Soumettre' : 'Voir soumissions'}
                      </button>
                      {canManage && <button className="btn btn-danger btn-sm" onClick={() => deleteHomework(hw.id)}>Supprimer</button>}
                    </div>
                  </div>
                </div>
              )
            })}
        </div>
      )}

      {/* ════════════════════════════════════════════════
          EXAMS
      ════════════════════════════════════════════════ */}
      {tab === 'exams' && (
        <div>
          {canManage && courses.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <button className="btn btn-primary btn-sm" onClick={() => { setExModal(true); setExForm({ ...EMPTY_EX_FORM, course_id: courses[0]?.id || '' }); setQuestions([]) }}>
                + Creer un examen
              </button>
            </div>
          )}
          {exams.length === 0
            ? <div className="empty-state"><h3>Aucun examen</h3></div>
            : exams.map(ex => (
              <div key={ex.id} className="card" style={{ marginBottom: 10 }}>
                <div className="card-body" style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--navy)' }}>{ex.title}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 3 }}>
                      {ex.course_title} · {ex.duration_min} min · {ex.questions?.length || 0} question(s)
                      {canManage && ` · ${ex.submission_count || 0} soumission(s)`}
                    </div>
                  </div>
                  <span style={{ fontSize: 11, padding: '2px 10px', borderRadius: 20, background: ex.is_published ? '#d1fae5' : '#fef9c3', color: ex.is_published ? '#065f46' : '#854d0e' }}>
                    {ex.is_published ? 'Publie' : 'Brouillon'}
                  </span>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button className="btn btn-outline btn-sm" onClick={() => navigate(`/exams?course=${ex.course_id}`)}>
                      {isStudent ? 'Passer' : 'Gerer'}
                    </button>
                    {canManage && <button className="btn btn-danger btn-sm" onClick={() => deleteExam(ex.id)}>Supprimer</button>}
                  </div>
                </div>
              </div>
            ))}
        </div>
      )}

      {/* ════════════════════════════════════════════════
          SESSIONS
      ════════════════════════════════════════════════ */}
      {tab === 'sessions' && (
        <div>
          {canManage && courses.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <button className="btn btn-primary btn-sm" onClick={() => { setSessionModal(true); setSessionForm({ title: '', scheduled_at: '', course_id: courses[0]?.id || '' }) }}>
                Planifier / Demarrer un cours en ligne
              </button>
            </div>
          )}
          {sessions.length === 0
            ? <div className="empty-state"><h3>Aucune session</h3><p>Planifiez votre premier cours en ligne.</p></div>
            : sessions.map(s => (
              <div key={s.id} className="card" style={{ marginBottom: 10 }}>
                <div className="card-body" style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--navy)' }}>{s.title}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 3 }}>
                      {s.course_title}{s.scheduled_at && ` · ${new Date(s.scheduled_at).toLocaleString('fr-FR')}`}
                    </div>
                  </div>
                  <span style={{ fontSize: 11, padding: '2px 10px', borderRadius: 20, fontWeight: 600, background: s.is_active ? '#d1fae5' : '#f1f5f9', color: s.is_active ? '#065f46' : '#64748b' }}>
                    {s.is_active ? 'En direct' : s.ended_at ? 'Termine' : 'Planifie'}
                  </span>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {!s.is_active && !s.ended_at && canManage && <button className="btn btn-primary btn-sm" onClick={() => startSession(s)}>Demarrer</button>}
                    {s.is_active && (
                      <>
                        <button className="btn btn-primary btn-sm" onClick={() => navigate(`/room/${s.room_id}`)}>Rejoindre</button>
                        {canManage && <button className="btn btn-outline btn-sm" onClick={() => endSession(s)}>Terminer</button>}
                      </>
                    )}
                    {canManage && <button className="btn btn-danger btn-sm" onClick={() => deleteSession(s)}>Supprimer</button>}
                  </div>
                </div>
              </div>
            ))}
        </div>
      )}

      {/* ════════════════════════════════════════════════════════
          MODALS
      ════════════════════════════════════════════════════════ */}

      {/* ── Modal upload leçon ── */}
      {uploadModal && (
        <div className="modal-overlay" onClick={() => setUploadModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">Ajouter une lecon — {selCourse?.title}</span>
              <button className="modal-close" onClick={() => setUploadModal(false)}>×</button>
            </div>
            <form onSubmit={uploadLesson}>
              <div className="modal-body">
                <div className="form-group">
                  <label className="form-label">Titre *</label>
                  <input className="form-input" required value={lessonForm.title} onChange={e => setLessonForm({ ...lessonForm, title: e.target.value })} placeholder="Ex : La Membrane Cellulaire" />
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Duree estimee</label>
                    <input className="form-input" value={lessonForm.duration} onChange={e => setLessonForm({ ...lessonForm, duration: e.target.value })} placeholder="Ex : 45 min" />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Ordre</label>
                    <input className="form-input" type="number" min={0} value={lessonForm.order} onChange={e => setLessonForm({ ...lessonForm, order: parseInt(e.target.value) })} />
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">Fichier (PDF ou Video) *</label>
                  <div
                    className={`upload-zone${dragOver ? ' drag-over' : ''}`}
                    onDragOver={e => { e.preventDefault(); setDragOver(true) }}
                    onDragLeave={() => setDragOver(false)}
                    onDrop={e => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) setLessonFile(f) }}
                    onClick={() => fileRef.current.click()}
                  >
                    {lessonFile ? (
                      <>
                        <div style={{ fontWeight: 600, marginTop: 8 }}>{lessonFile.name}</div>
                        <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>{(lessonFile.size / 1024 / 1024).toFixed(1)} MB</p>
                      </>
                    ) : (
                      <>
                        <div style={{ fontWeight: 600, marginTop: 8 }}>Glisser-deposer ou cliquer</div>
                        <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>PDF, MP4, WebM acceptes</p>
                      </>
                    )}
                    <input ref={fileRef} type="file" accept=".pdf,video/*" style={{ display: 'none' }} onChange={e => setLessonFile(e.target.files[0])} />
                  </div>
                </div>
                {uploading && <div className="alert alert-info">Upload en cours...</div>}
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-outline" onClick={() => setUploadModal(false)}>Annuler</button>
                <button type="submit" className="btn btn-primary" disabled={uploading}>{uploading ? 'Upload...' : 'Uploader'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Modal session ── */}
      {sessionModal && (
        <div className="modal-overlay" onClick={() => setSessionModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">Cours en ligne</span>
              <button className="modal-close" onClick={() => setSessionModal(false)}>×</button>
            </div>
            <form onSubmit={createSession}>
              <div className="modal-body">
                <div className="form-group">
                  <label className="form-label">Cours *</label>
                  <select className="form-select" required value={sessionForm.course_id} onChange={e => setSessionForm({ ...sessionForm, course_id: e.target.value })}>
                    <option value="">-- Choisir --</option>
                    {manageableCourses.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Titre de la session *</label>
                  <input className="form-input" required value={sessionForm.title} onChange={e => setSessionForm({ ...sessionForm, title: e.target.value })} placeholder="Ex : Cours du 15 mars" />
                </div>
                <div className="form-group">
                  <label className="form-label">Date et heure (optionnel)</label>
                  <input className="form-input" type="datetime-local" value={sessionForm.scheduled_at} onChange={e => setSessionForm({ ...sessionForm, scheduled_at: e.target.value })} />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-outline" onClick={() => setSessionModal(false)}>Annuler</button>
                <button type="submit" className="btn btn-primary">Creer la session</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Modal devoir (AVEC upload fichier joint) ── */}
      {hwModal && (
        <div className="modal-overlay" onClick={() => { setHwModal(false); setHwFile(null) }}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">Nouveau devoir</span>
              <button className="modal-close" onClick={() => { setHwModal(false); setHwFile(null) }}>×</button>
            </div>
            <form onSubmit={createHomework}>
              <div className="modal-body">

                {/* Cours */}
                <div className="form-group">
                  <label className="form-label">Cours *</label>
                  <select className="form-select" required value={hwForm.course_id} onChange={e => setHwForm({ ...hwForm, course_id: e.target.value })}>
                    <option value="">-- Choisir un cours --</option>
                    {manageableCourses.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
                  </select>
                </div>

                {/* Titre */}
                <div className="form-group">
                  <label className="form-label">Titre *</label>
                  <input className="form-input" required value={hwForm.title} onChange={e => setHwForm({ ...hwForm, title: e.target.value })} placeholder="Ex : TP Cinematique — Serie 3" />
                </div>

                {/* Description */}
                <div className="form-group">
                  <label className="form-label">Description / Consignes</label>
                  <textarea className="form-input" rows={3} value={hwForm.description} onChange={e => setHwForm({ ...hwForm, description: e.target.value })} placeholder="Decrivez les attentes, le bareme, les consignes..." style={{ resize: 'vertical' }} />
                </div>

                {/* Date + note max */}
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Date limite *</label>
                    <input className="form-input" type="datetime-local" required value={hwForm.due_date} onChange={e => setHwForm({ ...hwForm, due_date: e.target.value })} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Note maximale</label>
                    <input className="form-input" type="number" min={1} max={100} value={hwForm.max_score} onChange={e => setHwForm({ ...hwForm, max_score: e.target.value })} />
                  </div>
                </div>

                {/* ── Zone upload fichier joint ── */}
                <div className="form-group">
                  <label className="form-label">
                    Fichier joint
                    <span style={{ marginLeft: 6, fontSize: 11, color: 'var(--text-muted)', fontWeight: 400 }}>— optionnel (PDF, Word, ZIP, image…)</span>
                  </label>
                  <div
                    style={{
                      border: `2px dashed ${hwFile ? 'var(--blue)' : 'var(--border)'}`,
                      borderRadius: 10, padding: '18px 16px', textAlign: 'center',
                      cursor: 'pointer',
                      background: hwDragOver ? '#eff6ff' : hwFile ? '#f0fdf4' : '#fafafa',
                      transition: 'all 0.15s ease',
                    }}
                    onDragOver={e => { e.preventDefault(); setHwDragOver(true) }}
                    onDragLeave={() => setHwDragOver(false)}
                    onDrop={e => { e.preventDefault(); setHwDragOver(false); const f = e.dataTransfer.files[0]; if (f) setHwFile(f) }}
                    onClick={() => hwFileRef.current.click()}
                  >
                    {hwFile ? (
                      <>
                        <div style={{ fontSize: 28, marginBottom: 6 }}>📎</div>
                        <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--navy)' }}>{hwFile.name}</div>
                        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>{(hwFile.size / 1024 / 1024).toFixed(2)} MB</div>
                        <button
                          type="button"
                          onClick={e => { e.stopPropagation(); setHwFile(null) }}
                          style={{ marginTop: 8, fontSize: 11, color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}
                        >
                          Supprimer le fichier
                        </button>
                      </>
                    ) : (
                      <>
                        <div style={{ fontSize: 28, marginBottom: 6 }}>📁</div>
                        <div style={{ fontWeight: 500, fontSize: 13, color: 'var(--navy)' }}>Glisser-deposer ou cliquer pour joindre un fichier</div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>PDF, DOCX, XLSX, ZIP, PNG, JPG — max 50 MB</div>
                      </>
                    )}
                    <input
                      ref={hwFileRef}
                      type="file"
                      accept=".pdf,.doc,.docx,.xls,.xlsx,.zip,.rar,.png,.jpg,.jpeg,.pptx,.txt,.csv"
                      style={{ display: 'none' }}
                      onChange={e => { if (e.target.files[0]) setHwFile(e.target.files[0]) }}
                    />
                  </div>
                </div>

                {/* Publier */}
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, cursor: 'pointer' }}>
                  <input type="checkbox" checked={hwForm.is_published} onChange={e => setHwForm({ ...hwForm, is_published: e.target.checked })} />
                  Publier immediatement (visible par les etudiants)
                </label>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-outline" onClick={() => { setHwModal(false); setHwFile(null) }}>Annuler</button>
                <button type="submit" className="btn btn-primary">Creer le devoir</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Modal création cours ── */}
      {courseCreateModal && (
        <div className="modal-overlay" onClick={() => { setCourseCreateModal(false); setPendingThumb(null); setCourseThumbPreview(null) }}>
          <div className="modal" style={{ maxWidth: 560, width: '95vw', maxHeight: '92vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">Nouveau cours — {cls.name}</span>
              <button className="modal-close" onClick={() => { setCourseCreateModal(false); setPendingThumb(null); setCourseThumbPreview(null) }}>×</button>
            </div>
            <form onSubmit={createCourseForClass}>
              <div className="modal-body">

                {/* ── Zone image ── */}
                <div className="form-group">
                  <label className="form-label">
                    Image du cours
                    <span style={{ marginLeft: 6, fontSize: 11, color: 'var(--text-muted)', fontWeight: 400 }}>— JPG · PNG · WEBP · max 5 MB</span>
                  </label>
                  <div
                    onClick={() => courseThumbRef.current.click()}
                    style={{
                      height: courseThumbPreview ? 180 : 110, borderRadius: 12,
                      border: `2px dashed ${courseThumbPreview ? '#22c55e' : '#e2e8f0'}`,
                      background: courseThumbPreview ? '#f0fdf4' : '#f8fafc',
                      cursor: 'pointer', overflow: 'hidden', position: 'relative',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      transition: 'all .2s',
                    }}
                  >
                    {courseThumbPreview ? (
                      <>
                        <img src={courseThumbPreview} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0, transition: 'opacity .2s' }}
                          onMouseEnter={e => e.currentTarget.style.opacity = 1}
                          onMouseLeave={e => e.currentTarget.style.opacity = 0}>
                          <span style={{ color: '#fff', fontWeight: 700 }}>Changer</span>
                        </div>
                      </>
                    ) : (
                      <div style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: 28, marginBottom: 6 }}>🖼️</div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--navy)' }}>Cliquer pour ajouter une image</div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3 }}>Affichée en grande icône sur les cartes de cours</div>
                      </div>
                    )}
                    <input ref={courseThumbRef} type="file" accept="image/*" style={{ display: 'none' }}
                      onChange={e => {
                        const f = e.target.files[0]
                        if (!f) return
                        setPendingThumb(f)
                        const r = new FileReader()
                        r.onload = ev => setCourseThumbPreview(ev.target.result)
                        r.readAsDataURL(f)
                      }} />
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">Titre *</label>
                  <input className="form-input" required value={courseCreateForm.title} onChange={e => setCourseCreateForm(f => ({ ...f, title: e.target.value }))} placeholder="Ex : Introduction aux reseaux" />
                </div>
                <div className="form-group">
                  <label className="form-label">Description</label>
                  <textarea className="form-input" rows={2} value={courseCreateForm.description} onChange={e => setCourseCreateForm(f => ({ ...f, description: e.target.value }))} style={{ resize: 'vertical' }} />
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Enseignant *</label>
                    <select className="form-select" required value={courseCreateForm.teacher_id} onChange={e => setCourseCreateForm(f => ({ ...f, teacher_id: e.target.value }))}>
                      <option value="">-- Choisir --</option>
                      {allUsers.filter(u => u.role === 'teacher').map(t => (
                        <option key={t.id} value={t.id}>{t.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Categorie</label>
                    <select className="form-select" value={courseCreateForm.category_id} onChange={e => setCourseCreateForm(f => ({ ...f, category_id: e.target.value }))}>
                      <option value="">Sans categorie</option>
                      {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">Statut</label>
                  <select className="form-select" value={String(courseCreateForm.is_published)} onChange={e => setCourseCreateForm(f => ({ ...f, is_published: e.target.value === 'true' }))}>
                    <option value="true">Publie</option>
                    <option value="false">Brouillon</option>
                  </select>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-outline" onClick={() => { setCourseCreateModal(false); setPendingThumb(null); setCourseThumbPreview(null) }}>Annuler</button>
                <button type="submit" className="btn btn-primary">Creer le cours</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Modal examen ── */}
      {exModal && (
        <div className="modal-overlay" onClick={() => setExModal(false)}>
          <div className="modal" style={{ maxWidth: 780, width: '95vw', maxHeight: '94vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">Nouvel examen</span>
              <button className="modal-close" onClick={() => setExModal(false)}>×</button>
            </div>
            <form onSubmit={createExam}>
              <div className="modal-body">
                <div style={{ fontWeight: 700, color: 'var(--navy)', fontSize: 13, marginBottom: 10, paddingBottom: 6, borderBottom: '1px solid var(--border)' }}>Informations generales</div>

                <div className="form-group">
                  <label className="form-label">Cours *</label>
                  <select className="form-select" required value={exForm.course_id} onChange={e => setExForm(f => ({ ...f, course_id: e.target.value }))}>
                    <option value="">-- Choisir un cours --</option>
                    {manageableCourses.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Titre *</label>
                  <input className="form-input" value={exForm.title} onChange={e => setExForm(f => ({ ...f, title: e.target.value }))} placeholder="Ex : Examen final" />
                </div>
                <div className="form-group">
                  <label className="form-label">Description</label>
                  <textarea className="form-input" rows={2} value={exForm.description} onChange={e => setExForm(f => ({ ...f, description: e.target.value }))} style={{ resize: 'vertical' }} />
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Duree (min)</label>
                    <input className="form-input" type="number" min={5} value={exForm.duration_min} onChange={e => setExForm(f => ({ ...f, duration_min: parseInt(e.target.value) }))} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Statut initial</label>
                    <select className="form-select" value={String(exForm.is_published)} onChange={e => setExForm(f => ({ ...f, is_published: e.target.value === 'true' }))}>
                      <option value="false">Brouillon</option>
                      <option value="true">Publie</option>
                    </select>
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Date d'ouverture</label>
                    <input className="form-input" type="datetime-local" value={exForm.starts_at} onChange={e => setExForm(f => ({ ...f, starts_at: e.target.value }))} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Date de fermeture</label>
                    <input className="form-input" type="datetime-local" value={exForm.ends_at} onChange={e => setExForm(f => ({ ...f, ends_at: e.target.value }))} />
                  </div>
                </div>

                <div style={{ fontWeight: 700, color: 'var(--navy)', fontSize: 13, margin: '16px 0 10px', paddingBottom: 6, borderBottom: '1px solid var(--border)' }}>Parametres avances</div>
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Tentatives autorisees</label>
                    <input className="form-input" type="number" min={0} value={exForm.max_attempts} onChange={e => setExForm(f => ({ ...f, max_attempts: e.target.value }))} placeholder="0 = illimite" />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Note de passage (%)</label>
                    <input className="form-input" type="number" min={0} max={100} value={exForm.passing_score} onChange={e => setExForm(f => ({ ...f, passing_score: e.target.value }))} placeholder="Ex : 50" />
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Affichage du score</label>
                    <select className="form-select" value={exForm.show_score_after} onChange={e => setExForm(f => ({ ...f, show_score_after: e.target.value }))}>
                      <option value="immediately">Immediatement</option>
                      <option value="after_grading">Apres correction manuelle</option>
                      <option value="never">Ne pas afficher</option>
                    </select>
                  </div>
                  <div className="form-group" style={{ display: 'flex', alignItems: 'flex-end', paddingBottom: 4 }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
                      <input type="checkbox" checked={exForm.shuffle_questions} onChange={e => setExForm(f => ({ ...f, shuffle_questions: e.target.checked }))} style={{ width: 16, height: 16 }} />
                      <span className="form-label" style={{ margin: 0 }}>Melanger les questions</span>
                    </label>
                  </div>
                </div>

                {/* Questions */}
                <div style={{ borderTop: '1px solid var(--border)', marginTop: 16, paddingTop: 16 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
                    <div style={{ fontWeight: 700, color: 'var(--navy)', fontSize: 13 }}>Questions ({questions.length})</div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {Object.entries(Q_TYPE_LABELS).map(([type, { label }]) => (
                        <button key={type} type="button" className="btn btn-outline btn-sm" style={{ fontSize: 11, padding: '3px 10px' }} onClick={() => addQuestion(type)}>{label}</button>
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
                        <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginRight: 4 }}>
                            <button type="button" onClick={() => i > 0 && moveQuestion(i, i - 1)} disabled={i === 0} style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 3, cursor: i === 0 ? 'not-allowed' : 'pointer', padding: '0 5px', fontSize: 10, opacity: i === 0 ? 0.3 : 1 }}>▲</button>
                            <button type="button" onClick={() => i < questions.length - 1 && moveQuestion(i, i + 1)} disabled={i === questions.length - 1} style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 3, cursor: i === questions.length - 1 ? 'not-allowed' : 'pointer', padding: '0 5px', fontSize: 10, opacity: i === questions.length - 1 ? 0.3 : 1 }}>▼</button>
                          </div>
                          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', minWidth: 24 }}>#{i + 1}</span>
                          <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 10, background: '#f1f5f9', color: 'var(--text-muted)', fontWeight: 500, flexShrink: 0 }}>{Q_TYPE_LABELS[q.type]?.label}</span>
                          {q.type !== 'fill' && <input className="form-input" style={{ flex: 1, minWidth: 120 }} placeholder="Texte de la question *" value={q.text} onChange={e => updateQ(i, 'text', e.target.value)} />}
                          <input className="form-input" style={{ width: 72, flexShrink: 0, textAlign: 'center' }} type="number" min={0.5} step={0.5} value={q.points} onChange={e => updateQ(i, 'points', parseFloat(e.target.value))} title="Points" />
                          <button type="button" className="btn btn-danger btn-sm" onClick={() => removeQ(i)}>×</button>
                        </div>

                        {q.type === 'mcq' && (
                          <div style={{ marginBottom: 8 }}>
                            {(q.choices || []).map((c, ci) => (
                              <div key={ci} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                                <input type="radio" name={`ans_${i}`} value={String(ci)} checked={q.answer === String(ci)} onChange={() => updateQ(i, 'answer', String(ci))} />
                                <input className="form-input" style={{ flex: 1 }} placeholder={`Choix ${ci + 1}`} value={c} onChange={e => updateChoice(i, ci, e.target.value)} />
                                {(q.choices || []).length > 2 && <button type="button" className="btn btn-outline btn-sm" style={{ padding: '2px 8px' }} onClick={() => removeChoice(i, ci)}>-</button>}
                              </div>
                            ))}
                            <button type="button" className="btn btn-outline btn-sm" style={{ marginTop: 4 }} onClick={() => addChoice(i)}>+ Choix</button>
                          </div>
                        )}

                        {q.type === 'mcq_multi' && (
                          <div style={{ marginBottom: 8 }}>
                            {(q.choices || []).map((c, ci) => {
                              const isCorrect = Array.isArray(q.answer) && q.answer.includes(String(ci))
                              return (
                                <div key={ci} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                                  <input type="checkbox" checked={isCorrect} onChange={() => { const curr = Array.isArray(q.answer) ? q.answer : []; updateQ(i, 'answer', isCorrect ? curr.filter(v => v !== String(ci)) : [...curr, String(ci)]) }} />
                                  <input className="form-input" style={{ flex: 1 }} placeholder={`Choix ${ci + 1}`} value={c} onChange={e => updateChoice(i, ci, e.target.value)} />
                                  {(q.choices || []).length > 2 && <button type="button" className="btn btn-outline btn-sm" style={{ padding: '2px 8px' }} onClick={() => removeChoice(i, ci)}>-</button>}
                                </div>
                              )
                            })}
                            <button type="button" className="btn btn-outline btn-sm" style={{ marginTop: 4 }} onClick={() => addChoice(i)}>+ Choix</button>
                          </div>
                        )}

                        {q.type === 'truefalse' && (
                          <div style={{ display: 'flex', gap: 16, marginBottom: 8 }}>
                            {[['true', 'Vrai'], ['false', 'Faux']].map(([v, label]) => (
                              <label key={v} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', padding: '6px 16px', borderRadius: 8, border: `1px solid ${q.answer === v ? '#93c5fd' : 'var(--border)'}`, background: q.answer === v ? '#eff6ff' : 'transparent' }}>
                                <input type="radio" name={`ans_${i}`} value={v} checked={q.answer === v} onChange={() => updateQ(i, 'answer', v)} />
                                <span style={{ fontSize: 14 }}>{label}</span>
                              </label>
                            ))}
                          </div>
                        )}

                        {q.type === 'short' && (
                          <div style={{ marginBottom: 8 }}>
                            <label className="form-label" style={{ fontSize: 12 }}>Reponse attendue exacte</label>
                            <input className="form-input" value={q.answer || ''} onChange={e => updateQ(i, 'answer', e.target.value)} placeholder="La bonne reponse" />
                          </div>
                        )}

                        {q.type === 'fill' && (
                          <div style={{ marginBottom: 8 }}>
                            <label className="form-label" style={{ fontSize: 12 }}>Texte avec blancs *</label>
                            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6 }}>Utilisez ____ (4 underscores) pour chaque espace vide.</div>
                            <textarea className="form-input" rows={3} style={{ resize: 'vertical', fontFamily: 'monospace', fontSize: 13 }} value={q.text || ''} onChange={e => updateQ(i, 'text', e.target.value)} />
                            <label className="form-label" style={{ fontSize: 12, marginTop: 8 }}>Reponse(s) attendue(s)</label>
                            <input className="form-input" value={q.answer || ''} onChange={e => updateQ(i, 'answer', e.target.value)} placeholder="Ex : France" />
                          </div>
                        )}

                        {q.type === 'match' && (
                          <div style={{ marginBottom: 8 }}>
                            {(q.choices || []).map((pair, ci) => (
                              <div key={ci} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                                <input className="form-input" style={{ flex: 1 }} placeholder={`Gauche ${ci + 1}`} value={typeof pair === 'object' ? (pair.left || '') : ''} onChange={e => updateChoice(i, ci, { left: e.target.value })} />
                                <span style={{ color: 'var(--text-muted)' }}>→</span>
                                <input className="form-input" style={{ flex: 1 }} placeholder={`Droite ${ci + 1}`} value={typeof pair === 'object' ? (pair.right || '') : ''} onChange={e => updateChoice(i, ci, { right: e.target.value })} />
                                {(q.choices || []).length > 2 && <button type="button" className="btn btn-outline btn-sm" style={{ padding: '2px 8px', flexShrink: 0 }} onClick={() => removeChoice(i, ci)}>-</button>}
                              </div>
                            ))}
                            <button type="button" className="btn btn-outline btn-sm" style={{ marginTop: 4 }} onClick={() => addChoice(i)}>+ Paire</button>
                          </div>
                        )}

                        {q.type === 'order' && (
                          <div style={{ marginBottom: 8 }}>
                            {(q.choices || []).map((c, ci) => (
                              <div key={ci} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', minWidth: 22 }}>{ci + 1}.</span>
                                <input className="form-input" style={{ flex: 1 }} placeholder={`Element ${ci + 1}`} value={c} onChange={e => updateChoice(i, ci, e.target.value)} />
                                {(q.choices || []).length > 2 && <button type="button" className="btn btn-outline btn-sm" style={{ padding: '2px 8px' }} onClick={() => removeChoice(i, ci)}>-</button>}
                              </div>
                            ))}
                            <button type="button" className="btn btn-outline btn-sm" style={{ marginTop: 4 }} onClick={() => addChoice(i)}>+ Element</button>
                          </div>
                        )}

                        {(q.type === 'open' || q.type === 'upload') && (
                          <div style={{ fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic', marginBottom: 8, padding: '8px 12px', background: '#f8fafc', borderRadius: 6, border: '1px solid var(--border)' }}>
                            {q.type === 'upload' ? "L'etudiant devra deposer un fichier. Correction manuelle." : "Reponse libre. Correction manuelle par l'enseignant."}
                          </div>
                        )}

                        {['mcq', 'mcq_multi', 'truefalse', 'short', 'fill', 'order', 'match'].includes(q.type) && (
                          <input className="form-input" style={{ fontSize: 12, marginTop: 6 }} placeholder="Explication affichee apres correction (optionnel)" value={q.explanation || ''} onChange={e => updateQ(i, 'explanation', e.target.value)} />
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-outline" onClick={() => setExModal(false)}>Annuler</button>
                <button type="submit" className="btn btn-primary">Creer l'examen</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}


/* ══════════════════════════════════════════════════════════
   FORUM — composant greffé dans ClassDetail
   Forum par cours, questions + réponses
══════════════════════════════════════════════════════════ */
function ForumTab({ courses, user, canPost }) {
  const isTeacher = user?.role === 'teacher'
  const isAdmin   = user?.role === 'admin'

  const [selCourseId, setSelCourseId] = useState(courses[0]?.id || null)
  const [questions,   setQuestions]   = useState([])
  const [loading,     setLoading]     = useState(false)
  const [openQ,       setOpenQ]       = useState(null)
  const [showForm,    setShowForm]    = useState(false)
  const [form,        setForm]        = useState({ title: '', body: '' })
  const [replyBodies, setReplyBodies] = useState({})
  const [sending,     setSending]     = useState(false)
  const [msg,         setMsg]         = useState('')

  const flash = text => { setMsg(text); setTimeout(() => setMsg(''), 3000) }

  const load = useCallback(async () => {
    if (!selCourseId) return
    setLoading(true)
    try {
      const r = await api.get(`/forum/course/${selCourseId}`)
      setQuestions(r.data)
    } catch {}
    finally { setLoading(false) }
  }, [selCourseId])

  useEffect(() => {
  if (!selCourseId && courses.length > 0) {
    setSelCourseId(courses[0].id)
    return
  }
  if (selCourseId && !courses.some(c => c.id === selCourseId)) {
    setSelCourseId(courses[0]?.id || null)
  }
}, [courses, selCourseId])

  const postQuestion = async e => {
    e.preventDefault()
    setSending(true)
    try {
      await api.post(`/forum/course/${selCourseId}`, form)
      flash('Question publiee')
      setForm({ title: '', body: '' })
      setShowForm(false)
      load()
    } catch (err) {
      flash(err.response?.data?.detail || 'Erreur')
    } finally { setSending(false) }
  }

  const postReply = async questionId => {
    const body = replyBodies[questionId]?.trim()
    if (!body) return
    setSending(true)
    try {
      await api.post(`/forum/post/${questionId}/reply`, { body })
      setReplyBodies(prev => ({ ...prev, [questionId]: '' }))
      flash('Reponse ajoutee')
      load()
    } catch (err) {
      flash(err.response?.data?.detail || 'Erreur')
    } finally { setSending(false) }
  }

  const deleteQuestion = async questionId => {
    if (!confirm('Supprimer cette question ?')) return
    await api.delete(`/forum/post/${questionId}`)
    if (openQ?.id === questionId) setOpenQ(null)
    load()
  }

  return (
    <div>
      {courses.length > 1 && (
        <div className="form-group" style={{ maxWidth: 380, marginBottom: 20 }}>
          <label className="form-label">Forum du cours</label>
          <select className="form-select" value={selCourseId || ''} onChange={e => { setSelCourseId(parseInt(e.target.value)); setOpenQ(null); setQuestions([]) }}>
            {courses.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
          </select>
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <span style={{ fontSize: 14, color: 'var(--text-muted)' }}>
          {loading ? 'Chargement...' : `${questions.length} question${questions.length !== 1 ? 's' : ''}`}
        </span>
        {canPost && !showForm && (
          <button className="btn btn-primary btn-sm" onClick={() => setShowForm(true)}>Poser une question</button>
        )}
      </div>

      {msg && <div className="alert alert-success" style={{ marginBottom: 16 }}>{msg}</div>}

      {showForm && (
        <div className="card" style={{ marginBottom: 20 }}>
          <div className="card-header">
            <span className="card-title">Nouvelle question</span>
            <button className="btn btn-outline btn-sm" onClick={() => setShowForm(false)}>Annuler</button>
          </div>
          <form onSubmit={postQuestion}>
            <div className="card-body">
              <div className="form-group">
                <label className="form-label">Titre</label>
                <input className="form-input" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} required />
              </div>
              <div className="form-group">
                <label className="form-label">Details</label>
                <textarea className="form-input" rows={3} value={form.body} onChange={e => setForm({ ...form, body: e.target.value })} required style={{ resize: 'vertical' }} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button type="submit" className="btn btn-primary" disabled={sending}>{sending ? 'Publication...' : 'Publier'}</button>
              </div>
            </div>
          </form>
        </div>
      )}

      {loading ? (
        <div className="loading-overlay"><div className="spinner" /></div>
      ) : questions.length === 0 ? (
        <div className="empty-state">
          <h3>Aucune question</h3>
          <p>Soyez le premier a poser une question sur ce cours.</p>
        </div>
      ) : questions.map(q => (
        <div key={q.id} className="card" style={{ marginBottom: 12, border: openQ?.id === q.id ? '1.5px solid var(--blue)' : undefined }}>
          <div className="card-body" style={{ cursor: 'pointer' }} onClick={() => setOpenQ(openQ?.id === q.id ? null : q)}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: 15, color: 'var(--navy)', marginBottom: 4 }}>
                  {q.title}
                  {q.is_closed && <span style={{ marginLeft: 10, fontSize: 11, background: '#fee2e2', color: '#991b1b', padding: '2px 8px', borderRadius: 12, fontWeight: 700 }}>Fermee</span>}
                </div>
                <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>{q.body}</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8, display: 'flex', gap: 16 }}>
                  <strong>{q.author_name}</strong>
                  <span>{new Date(q.created_at).toLocaleDateString('fr-FR')}</span>
                  <span>{q.reply_count} reponse{q.reply_count !== 1 ? 's' : ''}</span>
                </div>
              </div>
              <div onClick={e => e.stopPropagation()}>
                {(user?.id === q.author_id || isTeacher || isAdmin) && (
                  <button className="btn btn-danger btn-sm" onClick={() => deleteQuestion(q.id)}>Supprimer</button>
                )}
              </div>
            </div>
          </div>

          {openQ?.id === q.id && (
            <div style={{ borderTop: '1px solid var(--border)', padding: '16px 24px', background: '#fafafa' }}>
              {(!q.replies || q.replies.length === 0) && (
                <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 12 }}>Aucune reponse pour l'instant.</p>
              )}
              {q.replies?.map(r => (
                <div key={r.id} style={{ padding: '10px 14px', borderRadius: 8, marginBottom: 8, background: r.is_pinned ? '#f0fdf4' : '#fff', border: r.is_pinned ? '1px solid #a7f3d0' : '1px solid var(--border)' }}>
                  <div style={{ fontSize: 13, lineHeight: 1.6 }}>{r.body}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4, display: 'flex', gap: 10 }}>
                    <strong>{r.author_name}</strong>
                    <span>{new Date(r.created_at).toLocaleDateString('fr-FR')}</span>
                    {r.is_pinned && <span style={{ color: 'var(--success)', fontWeight: 700 }}>Validee</span>}
                  </div>
                </div>
              ))}
              {canPost && !q.is_closed && (
                <div style={{ marginTop: 12, display: 'flex', gap: 10 }}>
                  <textarea
                    value={replyBodies[q.id] || ''}
                    onChange={e => setReplyBodies(prev => ({ ...prev, [q.id]: e.target.value }))}
                    placeholder="Votre reponse..."
                    className="form-input"
                    rows={2}
                    style={{ flex: 1, resize: 'vertical' }}
                  />
                  <button
                    className="btn btn-primary btn-sm"
                    style={{ alignSelf: 'flex-end' }}
                    disabled={sending || !(replyBodies[q.id] || '').trim()}
                    onClick={() => postReply(q.id)}
                  >
                    {sending ? '...' : 'Repondre'}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
