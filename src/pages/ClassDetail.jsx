import { useEffect, useState, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import api from '../api/client'
import useAuthStore from '../store/authStore'

const TABS_ADMIN_TEACHER = ['overview', 'students', 'courses', 'forum', 'homeworks', 'exams', 'sessions']
const TABS_STUDENT       = ['courses',  'forum',    'homeworks', 'exams', 'sessions']

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

  const [tab,        setTab]        = useState(TABS[0])
  const [cls,        setCls]        = useState(null)
  const [students,   setStudents]   = useState([])
  const [courses,    setCourses]    = useState([])
  const [homeworks,  setHomeworks]  = useState([])
  const [exams,      setExams]      = useState([])
  const [sessions,   setSessions]   = useState([])
  const [allUsers,   setAllUsers]   = useState([])
  const [allCourses, setAllCourses] = useState([])
  const [loading,    setLoading]    = useState(true)
  const [msg,        setMsg]        = useState({ text: '', type: '' })

  const [selCourse,   setSelCourse]   = useState(null)
  const [lessons,     setLessons]     = useState([])
  const [uploadModal, setUploadModal] = useState(false)
  const [lessonForm,  setLessonForm]  = useState({ title: '', duration: '', order: 0 })
  const [lessonFile,  setLessonFile]  = useState(null)
  const [uploading,   setUploading]   = useState(false)
  const [dragOver,    setDragOver]    = useState(false)
  const fileRef = useRef()

  const [sessionModal, setSessionModal] = useState(false)
  const [sessionForm,  setSessionForm]  = useState({ title: '', scheduled_at: '', course_id: '' })

  const [hwModal, setHwModal] = useState(false)
  const [hwForm,  setHwForm]  = useState({ title: '', description: '', due_date: '', max_score: 20, course_id: '', is_published: false })

  const [exModal,   setExModal]   = useState(false)
  const EMPTY_EX_FORM = { title: '', description: '', duration_min: 60, course_id: '', is_published: false, starts_at: '', ends_at: '', shuffle_questions: false, max_attempts: 1, passing_score: '', show_score_after: 'immediately' }
  const [exForm,    setExForm]    = useState(EMPTY_EX_FORM)
  const [questions, setQuestions] = useState([])

  const [courseModal,      setCourseModal]      = useState(false)
  const [courseForm,       setCourseForm]       = useState({ title: '', description: '', teacher_id: '', is_published: true })
  const [editCourseModal,  setEditCourseModal]  = useState(false)
  const [editCourseTarget, setEditCourseTarget] = useState(null)
  const [editCourseForm,   setEditCourseForm]   = useState({ title: '', description: '', teacher_id: '', is_published: true })

  const flash = (text, type = 'success') => {
    setMsg({ text, type })
    setTimeout(() => setMsg({ text: '', type: '' }), 3500)
  }

  // ✅ Recharger les cours de la classe
  const reloadCourses = async (classTeacherId) => {
    if (isAdmin) {
      const acr = await api.get('/admin/courses')
      setAllCourses(acr.data)
      // ✅ CORRECTION : on prend TOUS les cours liés à cette classe (par class_group_id)
      // ET les cours de l'enseignant responsable
      const classId = parseInt(id)
      const classCourses = acr.data.filter(c =>
        c.class_group_id === classId || c.teacher_id === classTeacherId
      )
      setCourses(classCourses)
    } else {
      const cr = await api.get('/courses/my')
      setCourses(isStudent ? cr.data : cr.data.filter(c => c.teacher_id === classTeacherId))
    }
  }

  useEffect(() => {
    const init = async () => {
      try {
        const [clr, str] = await Promise.all([
          api.get(`/classes/${id}`),
          api.get(`/classes/${id}/students`),
        ])
        setCls(clr.data)
        setStudents(str.data)
        const teacherId = clr.data.teacher_id

        if (isAdmin) {
          const [ur, acr] = await Promise.all([
            api.get('/admin/users'),
            api.get('/admin/courses'),
          ])
          setAllUsers(ur.data)
          setAllCourses(acr.data)
          // ✅ Tous les cours dont class_group_id == cette classe OU teacher == responsable
          const classId = parseInt(id)
          setCourses(acr.data.filter(c =>
            c.class_group_id === classId || c.teacher_id === teacherId
          ))
        } else {
          const cr = await api.get('/courses/my')
          setCourses(isStudent ? cr.data : cr.data.filter(c => c.teacher_id === teacherId))
        }
      } catch (err) {
        console.error('Erreur init ClassDetail:', err)
      }
      setLoading(false)
    }
    init()
  }, [id])

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

  const openCourse = async (c) => {
    if (selCourse?.id === c.id) { setSelCourse(null); return }
    const r = await api.get(`/courses/${c.id}/lessons`)
    setLessons(r.data); setSelCourse(c)
  }

  const uploadLesson = async (e) => {
    e.preventDefault()
    if (!lessonFile) return flash('Selectionnez un fichier', 'error')
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('course_id', selCourse.id)
      fd.append('title',     lessonForm.title)
      fd.append('duration',  lessonForm.duration)
      fd.append('order',     lessonForm.order)
      fd.append('file',      lessonFile)
      await api.post('/lessons/upload', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
      flash('Lecon ajoutee !')
      setUploadModal(false)
      setLessonForm({ title: '', duration: '', order: 0 })
      setLessonFile(null)
      const r = await api.get(`/courses/${selCourse.id}/lessons`)
      setLessons(r.data)
    } catch (err) {
      flash(err.response?.data?.detail || 'Erreur upload', 'error')
    } finally { setUploading(false) }
  }

  const deleteLesson = async (lessonId) => {
    if (!confirm('Supprimer cette lecon ?')) return
    await api.delete(`/lessons/${lessonId}`)
    flash('Lecon supprimee')
    const r = await api.get(`/courses/${selCourse.id}/lessons`)
    setLessons(r.data)
  }

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
      setSessions([]); loadTab('sessions', true)
    } catch (err) { flash(err.response?.data?.detail || 'Erreur', 'error') }
  }

  const startSession  = async (s) => { await api.post(`/sessions/${s.id}/start`); flash('Session demarree !'); setSessions([]); loadTab('sessions', true); navigate(`/room/${s.room_id}`) }
  const endSession    = async (s) => { await api.post(`/sessions/${s.id}/end`); flash('Session terminee'); setSessions([]); loadTab('sessions', true) }
  const deleteSession = async (s) => { if (!confirm('Supprimer cette session ?')) return; await api.delete(`/sessions/${s.id}`); flash('Session supprimee'); setSessions([]); loadTab('sessions', true) }

  const createHomework = async (e) => {
    e.preventDefault()
    try {
      await api.post('/homeworks', {
        ...hwForm,
        course_id: parseInt(hwForm.course_id),
        max_score: parseFloat(hwForm.max_score),
        due_date:  new Date(hwForm.due_date).toISOString(),
      })
      flash('Devoir cree !')
      setHwModal(false)
      setHomeworks([]); loadTab('homeworks', true)
    } catch (err) { flash(err.response?.data?.detail || 'Erreur', 'error') }
  }

  const deleteHomework = async (hwId) => {
    if (!confirm('Supprimer ce devoir ?')) return
    await api.delete(`/homeworks/${hwId}`)
    flash('Devoir supprime')
    setHomeworks([]); loadTab('homeworks', true)
  }

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
    if (typeof a[qi].choices[ci] === 'object') a[qi].choices[ci] = { ...a[qi].choices[ci], ...val }
    else a[qi].choices[ci] = val
    return a
  })
  const addChoice    = (qi) => setQuestions(q => { const a = [...q]; const isMatch = a[qi].type === 'match'; a[qi].choices = [...(a[qi].choices || []), isMatch ? { left: '', right: '' } : '']; return a })
  const removeChoice = (qi, ci) => setQuestions(q => { const a = [...q]; a[qi].choices = a[qi].choices.filter((_, j) => j !== ci); return a })

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
        course_id:        parseInt(exForm.course_id),
        title:            exForm.title,
        description:      exForm.description || null,
        duration_min:     parseInt(exForm.duration_min),
        is_published:     exForm.is_published,
        starts_at:        exForm.starts_at || null,
        ends_at:          exForm.ends_at   || null,
        shuffle_questions: exForm.shuffle_questions,
        max_attempts:     parseInt(exForm.max_attempts) || 1,
        passing_score:    exForm.passing_score !== '' ? parseFloat(exForm.passing_score) : null,
        show_score_after: exForm.show_score_after,
        questions: questions.map((q, i) => ({
          order:       i,
          type:        q.type,
          text:        q.text.trim(),
          points:      q.points,
          explanation: q.explanation || null,
          choices:     ['open', 'upload', 'short', 'truefalse', 'fill'].includes(q.type) ? null : q.choices,
          answer:      ['open', 'upload'].includes(q.type) ? null
                       : q.type === 'mcq_multi' ? JSON.stringify(Array.isArray(q.answer) ? q.answer : [])
                       : q.answer,
        })),
      })
      flash('Examen cree !')
      setExModal(false); setQuestions([])
      setExams([]); loadTab('exams', true)
    } catch (err) {
      const d = err.response?.data?.detail
      flash(Array.isArray(d) ? d.map(x => x.msg).join(' | ') : d || 'Erreur', 'error')
    }
  }

  const deleteExam = async (exId) => {
    if (!confirm('Supprimer cet examen ?')) return
    await api.delete(`/exams/${exId}`)
    flash('Examen supprime')
    setExams([]); loadTab('exams', true)
  }

  const enrollToCourse = async (courseId) => {
    if (students.length === 0) return flash("Aucun etudiant dans cette classe. Ajoutez des etudiants avant d'inscrire.", 'error')
    try {
      const r = await api.post(`/classes/${id}/enroll-course/${courseId}`)
      flash(`${r.data.enrolled} etudiant(s) inscrit(s) au cours "${r.data.course}"`)
    } catch (err) { flash(err.response?.data?.detail || 'Erreur', 'error') }
  }

  const openEditCourse = (c) => {
    setEditCourseTarget(c)
    setEditCourseForm({
      title:        c.title,
      description:  c.description || '',
      teacher_id:   c.teacher_id ? String(c.teacher_id) : '',
      is_published: c.is_published,
    })
    setEditCourseModal(true)
  }

  const updateCourse = async (e) => {
    e.preventDefault()
    if (!editCourseForm.title.trim()) return flash('Le titre est requis', 'error')
    if (!editCourseForm.teacher_id)   return flash('Selectionnez un enseignant', 'error')
    try {
      await api.put(`/admin/courses/${editCourseTarget.id}`, {
        title:        editCourseForm.title,
        description:  editCourseForm.description || null,
        teacher_id:   parseInt(editCourseForm.teacher_id),
        is_published: editCourseForm.is_published,
      })
      flash('Cours modifie !')
      setEditCourseModal(false)
      await reloadCourses(cls?.teacher_id)
    } catch (err) { flash(err.response?.data?.detail || 'Erreur', 'error') }
  }

  const addStudent = async (sid) => {
    try {
      await api.post(`/classes/${id}/students`, { student_ids: [sid] })
      flash('Etudiant ajoute')
      const r = await api.get(`/classes/${id}/students`); setStudents(r.data)
    } catch (err) { flash(err.response?.data?.detail || 'Erreur', 'error') }
  }
  const removeStudent = async (sid) => {
    await api.delete(`/classes/${id}/students/${sid}`)
    flash('Etudiant retire')
    const r = await api.get(`/classes/${id}/students`); setStudents(r.data)
  }
  const setMatricule = async (sid, current) => {
    const m = prompt('Numero de matricule :', current || ''); if (!m) return
    try {
      await api.patch(`/classes/students/${sid}/matricule?matricule=${m}`)
      flash('Matricule enregistre')
      const r = await api.get(`/classes/${id}/students`); setStudents(r.data)
    } catch (err) { flash(err.response?.data?.detail || 'Erreur', 'error') }
  }

  const createCourse = async (e) => {
    e.preventDefault()
    if (!courseForm.title.trim()) return flash('Le titre est requis', 'error')
    if (!courseForm.teacher_id)   return flash('Selectionnez un enseignant', 'error')
    try {
      const { data: newCourse } = await api.post('/admin/courses', {
        title:        courseForm.title,
        description:  courseForm.description || null,
        teacher_id:   parseInt(courseForm.teacher_id),
        is_published: courseForm.is_published,
      })
      await api.post(`/classes/${id}/enroll-course/${newCourse.id}`).catch(() => {})
      flash('Cours cree et associe a la classe !')
      setCourseModal(false)
      setCourseForm({ title: '', description: '', teacher_id: '', is_published: true })
      // ✅ Recharger et inclure le nouveau cours
      const acr = await api.get('/admin/courses')
      setAllCourses(acr.data)
      const classId = parseInt(id)
      setCourses(acr.data.filter(c =>
        c.class_group_id === classId || c.teacher_id === cls?.teacher_id || c.id === newCourse.id
      ))
    } catch (err) { flash(err.response?.data?.detail || 'Erreur', 'error') }
  }

  if (loading) return <div className="loading-overlay"><div className="spinner" /></div>
  if (!cls)    return <div className="loading-overlay">Classe introuvable</div>

  const notInClass = allUsers.filter(u => u.role === 'student' && !students.find(s => s.id === u.id))

  return (
    <div>
      {msg.text && <div className={`alert alert-${msg.type === 'error' ? 'error' : 'success'}`}>{msg.text}</div>}

      {/* En-tete */}
      <div style={{ background: 'linear-gradient(135deg, var(--navy), #1a3a6e)', borderRadius: 16, padding: '24px 28px', marginBottom: 24, color: '#fff', display: 'flex', alignItems: 'center', gap: 18 }}>
        <button onClick={() => navigate('/classes')} style={{ background: 'rgba(255,255,255,.15)', border: 'none', color: '#fff', borderRadius: 8, padding: '6px 12px', cursor: 'pointer', fontSize: 13 }}>
          ← Classes
        </button>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <h2 style={{ fontFamily: 'Playfair Display, serif', fontSize: 20, margin: 0 }}>{cls.name}</h2>
            {cls.code && <span style={{ fontSize: 11, background: 'rgba(255,255,255,.2)', padding: '2px 8px', borderRadius: 20 }}>{cls.code}</span>}
          </div>
          <div style={{ opacity: .65, fontSize: 12, marginTop: 4, display: 'flex', gap: 16 }}>
            {cls.level             && <span>{cls.level}</span>}
            {cls.academic_year_name && <span>{cls.academic_year_name}</span>}
            {cls.teacher_name      && <span>Enseignant : {cls.teacher_name}</span>}
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

      {/* Onglets */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', marginBottom: 24, overflowX: 'auto' }}>
        {TABS.map(t => (
          <button key={t} onClick={() => switchTab(t)} style={{ padding: '10px 18px', border: 'none', background: 'none', cursor: 'pointer', fontSize: 14, fontWeight: 500, whiteSpace: 'nowrap', borderBottom: tab === t ? '2px solid var(--blue)' : '2px solid transparent', color: tab === t ? 'var(--blue)' : 'var(--text-muted)' }}>
            {TAB_LABELS[t]}
          </button>
        ))}
      </div>

      {/* ── OVERVIEW ── */}
      {tab === 'overview' && (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 14, marginBottom: 24 }}>
            {[
              { label: 'Etudiants',     value: `${students.length}/${cls.max_students}`, t: 'students'  },
              { label: 'Cours',         value: courses.length,                            t: 'courses'   },
              { label: 'Forum',         value: 'Discussion',                              t: 'forum'     },
              { label: 'Devoirs',       value: '—',                                       t: 'homeworks' },
              { label: 'Examens',       value: '—',                                       t: 'exams'     },
              { label: 'Cours en ligne',value: '—',                                       t: 'sessions'  },
            ].map((s, i) => (
              <div key={i} className="card" style={{ cursor: 'pointer' }} onClick={() => switchTab(s.t)}>
                <div className="card-body">
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{s.label}</div>
                  <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--navy)' }}>{s.value}</div>
                </div>
              </div>
            ))}
          </div>
          {canManage && courses.length > 0 && (
            <div>
              <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--navy)', marginBottom: 10 }}>Actions rapides</div>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <button className="btn btn-outline" onClick={() => { switchTab('courses'); setTimeout(() => openCourse(courses[0]), 100) }}>Ajouter une lecon</button>
                <button className="btn btn-outline" onClick={() => { setHwModal(true); setHwForm({ title: '', description: '', due_date: '', max_score: 20, course_id: courses[0]?.id || '', is_published: false }) }}>Creer un devoir</button>
                <button className="btn btn-outline" onClick={() => { setExModal(true); setExForm({ ...EMPTY_EX_FORM, course_id: courses[0]?.id || '' }); setQuestions([]) }}>Creer un examen</button>
                <button className="btn btn-primary" onClick={() => { setSessionModal(true); setSessionForm({ title: '', scheduled_at: '', course_id: courses[0]?.id || '' }) }}>Demarrer cours en ligne</button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── STUDENTS ── */}
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

      {/* ── COURSES ── */}
      {tab === 'courses' && (
        <div>
          {isAdmin && (
            <div style={{ marginBottom: 20, padding: 16, background: '#f8fafc', borderRadius: 10, border: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--navy)' }}>Inscrire toute la classe a un cours</div>
                <button className="btn btn-primary btn-sm" onClick={() => {
                  setCourseForm({ title: '', description: '', teacher_id: cls.teacher_id ? String(cls.teacher_id) : '', is_published: true })
                  setCourseModal(true)
                }}>+ Creer un nouveau cours</button>
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <select className="form-select" style={{ flex: 1 }} id="course-sel">
                  <option value="">-- Choisir un cours existant --</option>
                  {allCourses.map(c => <option key={c.id} value={c.id}>{c.title} ({c.teacher_name})</option>)}
                </select>
                <button className="btn btn-primary" onClick={() => { const v = document.getElementById('course-sel').value; if (v) enrollToCourse(v) }}>Inscrire la classe</button>
              </div>
            </div>
          )}
          {courses.length === 0
            ? <div className="empty-state"><h3>Aucun cours</h3><p>Créez un cours ou inscrivez la classe à un cours existant.</p></div>
            : courses.map(c => (
              <div key={c.id}>
                <div className="card" style={{ marginBottom: selCourse?.id === c.id ? 0 : 10, borderBottomLeftRadius: selCourse?.id === c.id ? 0 : undefined, borderBottomRightRadius: selCourse?.id === c.id ? 0 : undefined }}>
                  <div className="card-body" style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                    <div style={{ flex: 1, cursor: 'pointer' }} onClick={() => openCourse(c)}>
                      <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--navy)' }}>{c.title}</div>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                        {c.teacher_name} · {c.lesson_count} lecon(s)
                        {isStudent && ` · ${c.progress_pct}% termine`}
                      </div>
                    </div>
                    <span style={{ fontSize: 11, padding: '2px 10px', borderRadius: 20, background: c.is_published ? '#d1fae5' : '#fef9c3', color: c.is_published ? '#065f46' : '#854d0e' }}>
                      {c.is_published ? 'Publie' : 'Brouillon'}
                    </span>
                    {isAdmin && (
                      <button className="btn btn-outline btn-sm" onClick={() => openEditCourse(c)}>Modifier</button>
                    )}
                    {canManage && (
                      <button className="btn btn-primary btn-sm" onClick={() => {
                        setSelCourse(c)
                        setLessonForm({ title: '', duration: '', order: c.lesson_count })
                        setLessonFile(null)
                        setUploadModal(true)
                        openCourse(c)
                      }}>
                        Ajouter une lecon
                      </button>
                    )}
                    <button className="btn btn-outline btn-sm" onClick={() => openCourse(c)}>
                      {selCourse?.id === c.id ? 'Fermer' : 'Lecons'}
                    </button>
                  </div>
                </div>
                {selCourse?.id === c.id && (
                  <div style={{ border: '1px solid var(--border)', borderTop: 'none', borderBottomLeftRadius: 12, borderBottomRightRadius: 12, padding: '12px 16px', background: '#fafafa', marginBottom: 10 }}>
                    {lessons.length === 0
                      ? <div style={{ fontSize: 13, color: 'var(--text-muted)', padding: '8px 0' }}>Aucune lecon. Cliquez "Ajouter une lecon" pour commencer.</div>
                      : lessons.map((l, i) => (
                        <div key={l.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                          <div style={{ width: 26, height: 26, borderRadius: 6, background: l.type === 'pdf' ? '#dbeafe' : '#dcfce7', color: l.type === 'pdf' ? 'var(--blue)' : 'var(--success)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, flexShrink: 0 }}>{i + 1}</div>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--navy)' }}>{l.title}</div>
                            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{l.type === 'pdf' ? 'PDF' : 'Video'}{l.duration ? ` · ${l.duration}` : ''}</div>
                          </div>
                          <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 12, background: l.file_path ? '#dcfce7' : '#fee2e2', color: l.file_path ? '#065f46' : '#991b1b' }}>
                            {l.file_path ? 'Fichier OK' : 'Manquant'}
                          </span>
                          {isStudent && l.file_path && <button className="btn btn-outline btn-sm" onClick={() => navigate(`/lesson/${l.id}`)}>Ouvrir</button>}
                          {canManage && <button className="btn btn-danger btn-sm" onClick={() => deleteLesson(l.id)}>Supprimer</button>}
                        </div>
                      ))}
                  </div>
                )}
              </div>
            ))}
        </div>
      )}

      {/* ── FORUM ── */}
      {tab === 'forum' && (
        <ForumTab courses={courses} user={user} canPost={canManage || isStudent} />
      )}

      {/* ── HOMEWORKS ── */}
      {tab === 'homeworks' && (
        <div>
          {canManage && courses.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <button className="btn btn-primary btn-sm" onClick={() => { setHwModal(true); setHwForm({ title: '', description: '', due_date: '', max_score: 20, course_id: courses[0]?.id || '', is_published: false }) }}>
                + Creer un devoir
              </button>
            </div>
          )}
          {homeworks.length === 0 ? <div className="empty-state"><h3>Aucun devoir</h3></div>
            : homeworks.map(hw => {
              const due = new Date(hw.due_date); const late = new Date() > due
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

      {/* ── EXAMS ── */}
      {tab === 'exams' && (
        <div>
          {canManage && courses.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <button className="btn btn-primary btn-sm" onClick={() => { setExModal(true); setExForm({ ...EMPTY_EX_FORM, course_id: courses[0]?.id || '' }); setQuestions([]) }}>
                + Creer un examen
              </button>
            </div>
          )}
          {exams.length === 0 ? <div className="empty-state"><h3>Aucun examen</h3></div>
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

      {/* ── SESSIONS ── */}
      {tab === 'sessions' && (
        <div>
          {canManage && courses.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <button className="btn btn-primary btn-sm" onClick={() => { setSessionModal(true); setSessionForm({ title: '', scheduled_at: '', course_id: courses[0]?.id || '' }) }}>
                Planifier / Demarrer un cours en ligne
              </button>
            </div>
          )}
          {sessions.length === 0 ? <div className="empty-state"><h3>Aucune session</h3><p>Planifiez votre premier cours en ligne.</p></div>
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

      {/* ════ MODALS ════ */}

      {uploadModal && (
        <div className="modal-overlay" onClick={() => setUploadModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">Ajouter une lecon — {selCourse?.title}</span>
              <button className="modal-close" onClick={() => setUploadModal(false)}>x</button>
            </div>
            <form onSubmit={uploadLesson}>
              <div className="modal-body">
                <div className="form-group"><label className="form-label">Titre *</label><input className="form-input" required value={lessonForm.title} onChange={e => setLessonForm({ ...lessonForm, title: e.target.value })} placeholder="Ex : La Membrane Cellulaire" /></div>
                <div className="form-row">
                  <div className="form-group"><label className="form-label">Duree estimee</label><input className="form-input" value={lessonForm.duration} onChange={e => setLessonForm({ ...lessonForm, duration: e.target.value })} placeholder="Ex : 45 min" /></div>
                  <div className="form-group"><label className="form-label">Ordre</label><input className="form-input" type="number" min={0} value={lessonForm.order} onChange={e => setLessonForm({ ...lessonForm, order: parseInt(e.target.value) })} /></div>
                </div>
                <div className="form-group">
                  <label className="form-label">Fichier (PDF ou Video) *</label>
                  <div className={`upload-zone${dragOver ? ' drag-over' : ''}`}
                    onDragOver={e => { e.preventDefault(); setDragOver(true) }}
                    onDragLeave={() => setDragOver(false)}
                    onDrop={e => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) setLessonFile(f) }}
                    onClick={() => fileRef.current.click()}>
                    {lessonFile
                      ? <><div style={{ fontWeight: 600, marginTop: 8 }}>{lessonFile.name}</div><p style={{ fontSize: 12, color: 'var(--text-muted)' }}>{(lessonFile.size / 1024 / 1024).toFixed(1)} MB</p></>
                      : <><div style={{ fontWeight: 600, marginTop: 8 }}>Glisser-deposer ou cliquer</div><p style={{ fontSize: 12, color: 'var(--text-muted)' }}>PDF, MP4, WebM acceptes</p></>
                    }
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

      {sessionModal && (
        <div className="modal-overlay" onClick={() => setSessionModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header"><span className="modal-title">Cours en ligne</span><button className="modal-close" onClick={() => setSessionModal(false)}>x</button></div>
            <form onSubmit={createSession}>
              <div className="modal-body">
                <div className="form-group"><label className="form-label">Cours *</label><select className="form-select" required value={sessionForm.course_id} onChange={e => setSessionForm({ ...sessionForm, course_id: e.target.value })}><option value="">-- Choisir --</option>{courses.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}</select></div>
                <div className="form-group"><label className="form-label">Titre de la session *</label><input className="form-input" required value={sessionForm.title} onChange={e => setSessionForm({ ...sessionForm, title: e.target.value })} placeholder="Ex : Cours du 15 mars" /></div>
                <div className="form-group"><label className="form-label">Date et heure (optionnel)</label><input className="form-input" type="datetime-local" value={sessionForm.scheduled_at} onChange={e => setSessionForm({ ...sessionForm, scheduled_at: e.target.value })} /></div>
              </div>
              <div className="modal-footer"><button type="button" className="btn btn-outline" onClick={() => setSessionModal(false)}>Annuler</button><button type="submit" className="btn btn-primary">Creer la session</button></div>
            </form>
          </div>
        </div>
      )}

      {hwModal && (
        <div className="modal-overlay" onClick={() => setHwModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header"><span className="modal-title">Nouveau devoir</span><button className="modal-close" onClick={() => setHwModal(false)}>x</button></div>
            <form onSubmit={createHomework}>
              <div className="modal-body">
                <div className="form-group"><label className="form-label">Cours *</label><select className="form-select" required value={hwForm.course_id} onChange={e => setHwForm({ ...hwForm, course_id: e.target.value })}>{courses.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}</select></div>
                <div className="form-group"><label className="form-label">Titre *</label><input className="form-input" required value={hwForm.title} onChange={e => setHwForm({ ...hwForm, title: e.target.value })} /></div>
                <div className="form-group"><label className="form-label">Description</label><textarea className="form-input" rows={2} value={hwForm.description} onChange={e => setHwForm({ ...hwForm, description: e.target.value })} style={{ resize: 'vertical' }} /></div>
                <div className="form-row">
                  <div className="form-group"><label className="form-label">Date limite *</label><input className="form-input" type="datetime-local" required value={hwForm.due_date} onChange={e => setHwForm({ ...hwForm, due_date: e.target.value })} /></div>
                  <div className="form-group"><label className="form-label">Note max</label><input className="form-input" type="number" min={1} value={hwForm.max_score} onChange={e => setHwForm({ ...hwForm, max_score: e.target.value })} /></div>
                </div>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, cursor: 'pointer' }}><input type="checkbox" checked={hwForm.is_published} onChange={e => setHwForm({ ...hwForm, is_published: e.target.checked })} />Publier immediatement</label>
              </div>
              <div className="modal-footer"><button type="button" className="btn btn-outline" onClick={() => setHwModal(false)}>Annuler</button><button type="submit" className="btn btn-primary">Creer</button></div>
            </form>
          </div>
        </div>
      )}

      {exModal && (
        <div className="modal-overlay" onClick={() => setExModal(false)}>
          <div className="modal" style={{ maxWidth: 780, width: '95vw', maxHeight: '94vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header"><span className="modal-title">Nouvel examen</span><button className="modal-close" onClick={() => setExModal(false)}>x</button></div>
            <form onSubmit={createExam}>
              <div className="modal-body">
                <div style={{ fontWeight: 700, color: 'var(--navy)', fontSize: 13, marginBottom: 10, paddingBottom: 6, borderBottom: '1px solid var(--border)' }}>Informations generales</div>
                <div className="form-group"><label className="form-label">Cours *</label><select className="form-select" required value={exForm.course_id} onChange={e => setExForm(f => ({ ...f, course_id: e.target.value }))}><option value="">-- Choisir un cours --</option>{courses.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}</select></div>
                <div className="form-group"><label className="form-label">Titre *</label><input className="form-input" value={exForm.title} onChange={e => setExForm(f => ({ ...f, title: e.target.value }))} placeholder="Ex : Examen final" /></div>
                <div className="form-group"><label className="form-label">Description</label><textarea className="form-input" rows={2} value={exForm.description} onChange={e => setExForm(f => ({ ...f, description: e.target.value }))} style={{ resize: 'vertical' }} /></div>
                <div className="form-row">
                  <div className="form-group"><label className="form-label">Duree (min)</label><input className="form-input" type="number" min={5} value={exForm.duration_min} onChange={e => setExForm(f => ({ ...f, duration_min: parseInt(e.target.value) }))} /></div>
                  <div className="form-group"><label className="form-label">Statut initial</label><select className="form-select" value={String(exForm.is_published)} onChange={e => setExForm(f => ({ ...f, is_published: e.target.value === 'true' }))}><option value="false">Brouillon</option><option value="true">Publie</option></select></div>
                </div>
                <div className="form-row">
                  <div className="form-group"><label className="form-label">Date d'ouverture</label><input className="form-input" type="datetime-local" value={exForm.starts_at} onChange={e => setExForm(f => ({ ...f, starts_at: e.target.value }))} /></div>
                  <div className="form-group"><label className="form-label">Date de fermeture</label><input className="form-input" type="datetime-local" value={exForm.ends_at} onChange={e => setExForm(f => ({ ...f, ends_at: e.target.value }))} /></div>
                </div>
                <div style={{ fontWeight: 700, color: 'var(--navy)', fontSize: 13, margin: '16px 0 10px', paddingBottom: 6, borderBottom: '1px solid var(--border)' }}>Parametres avances</div>
                <div className="form-row">
                  <div className="form-group"><label className="form-label">Tentatives autorisees</label><input className="form-input" type="number" min={0} value={exForm.max_attempts} onChange={e => setExForm(f => ({ ...f, max_attempts: e.target.value }))} placeholder="0 = illimite" /></div>
                  <div className="form-group"><label className="form-label">Note de passage (%)</label><input className="form-input" type="number" min={0} max={100} value={exForm.passing_score} onChange={e => setExForm(f => ({ ...f, passing_score: e.target.value }))} placeholder="Ex : 50" /></div>
                </div>
                <div className="form-row">
                  <div className="form-group"><label className="form-label">Affichage du score</label><select className="form-select" value={exForm.show_score_after} onChange={e => setExForm(f => ({ ...f, show_score_after: e.target.value }))}><option value="immediately">Immediatement</option><option value="after_grading">Apres correction manuelle</option><option value="never">Ne pas afficher</option></select></div>
                  <div className="form-group" style={{ display: 'flex', alignItems: 'flex-end', paddingBottom: 4 }}><label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}><input type="checkbox" checked={exForm.shuffle_questions} onChange={e => setExForm(f => ({ ...f, shuffle_questions: e.target.checked }))} style={{ width: 16, height: 16 }} /><span className="form-label" style={{ margin: 0 }}>Melanger les questions</span></label></div>
                </div>
                <div style={{ borderTop: '1px solid var(--border)', marginTop: 16, paddingTop: 16 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
                    <div style={{ fontWeight: 700, color: 'var(--navy)', fontSize: 13 }}>Questions ({questions.length})</div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {Object.entries(Q_TYPE_LABELS).map(([type, { label }]) => (
                        <button key={type} type="button" className="btn btn-outline btn-sm" style={{ fontSize: 11, padding: '3px 10px' }} onClick={() => addQuestion(type)}>{label}</button>
                      ))}
                    </div>
                  </div>
                  {questions.length === 0 && <div style={{ textAlign: 'center', padding: '24px', border: '2px dashed var(--border)', borderRadius: 10, color: 'var(--text-muted)', fontSize: 14 }}>Cliquez sur un type de question ci-dessus pour ajouter.</div>}
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
                          <button type="button" className="btn btn-danger btn-sm" onClick={() => removeQ(i)}>x</button>
                        </div>
                        {q.type === 'mcq' && (<div style={{ marginBottom: 8 }}>{(q.choices || []).map((c, ci) => (<div key={ci} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}><input type="radio" name={`ans_${i}`} value={String(ci)} checked={q.answer === String(ci)} onChange={() => updateQ(i, 'answer', String(ci))} /><input className="form-input" style={{ flex: 1 }} placeholder={`Choix ${ci + 1}`} value={c} onChange={e => updateChoice(i, ci, e.target.value)} />{(q.choices || []).length > 2 && <button type="button" className="btn btn-outline btn-sm" style={{ padding: '2px 8px' }} onClick={() => removeChoice(i, ci)}>-</button>}</div>))}<button type="button" className="btn btn-outline btn-sm" style={{ marginTop: 4 }} onClick={() => addChoice(i)}>+ Choix</button></div>)}
                        {q.type === 'mcq_multi' && (<div style={{ marginBottom: 8 }}>{(q.choices || []).map((c, ci) => { const isCorrect = Array.isArray(q.answer) && q.answer.includes(String(ci)); return (<div key={ci} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}><input type="checkbox" checked={isCorrect} onChange={() => { const curr = Array.isArray(q.answer) ? q.answer : []; updateQ(i, 'answer', isCorrect ? curr.filter(v => v !== String(ci)) : [...curr, String(ci)]) }} /><input className="form-input" style={{ flex: 1 }} placeholder={`Choix ${ci + 1}`} value={c} onChange={e => updateChoice(i, ci, e.target.value)} />{(q.choices || []).length > 2 && <button type="button" className="btn btn-outline btn-sm" style={{ padding: '2px 8px' }} onClick={() => removeChoice(i, ci)}>-</button>}</div>) })}<button type="button" className="btn btn-outline btn-sm" style={{ marginTop: 4 }} onClick={() => addChoice(i)}>+ Choix</button></div>)}
                        {q.type === 'truefalse' && (<div style={{ display: 'flex', gap: 16, marginBottom: 8 }}>{[['true', 'Vrai'], ['false', 'Faux']].map(([v, label]) => (<label key={v} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', padding: '6px 16px', borderRadius: 8, border: `1px solid ${q.answer === v ? '#93c5fd' : 'var(--border)'}`, background: q.answer === v ? '#eff6ff' : 'transparent' }}><input type="radio" name={`ans_${i}`} value={v} checked={q.answer === v} onChange={() => updateQ(i, 'answer', v)} /><span style={{ fontSize: 14 }}>{label}</span></label>))}</div>)}
                        {q.type === 'short' && (<div style={{ marginBottom: 8 }}><label className="form-label" style={{ fontSize: 12 }}>Reponse attendue exacte</label><input className="form-input" value={q.answer || ''} onChange={e => updateQ(i, 'answer', e.target.value)} placeholder="La bonne reponse" /></div>)}
                        {q.type === 'fill' && (<div style={{ marginBottom: 8 }}><label className="form-label" style={{ fontSize: 12 }}>Texte avec blancs *</label><div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6 }}>Utilisez ____ (4 underscores) pour chaque espace vide.</div><textarea className="form-input" rows={3} style={{ resize: 'vertical', fontFamily: 'monospace', fontSize: 13 }} value={q.text || ''} onChange={e => updateQ(i, 'text', e.target.value)} /><label className="form-label" style={{ fontSize: 12, marginTop: 8 }}>Reponse(s) attendue(s)</label><input className="form-input" value={q.answer || ''} onChange={e => updateQ(i, 'answer', e.target.value)} placeholder="Ex : France" /></div>)}
                        {q.type === 'match' && (<div style={{ marginBottom: 8 }}>{(q.choices || []).map((pair, ci) => (<div key={ci} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}><input className="form-input" style={{ flex: 1 }} placeholder={`Gauche ${ci + 1}`} value={typeof pair === 'object' ? (pair.left || '') : ''} onChange={e => updateChoice(i, ci, { left: e.target.value })} /><span style={{ color: 'var(--text-muted)' }}>→</span><input className="form-input" style={{ flex: 1 }} placeholder={`Droite ${ci + 1}`} value={typeof pair === 'object' ? (pair.right || '') : ''} onChange={e => updateChoice(i, ci, { right: e.target.value })} />{(q.choices || []).length > 2 && <button type="button" className="btn btn-outline btn-sm" style={{ padding: '2px 8px', flexShrink: 0 }} onClick={() => removeChoice(i, ci)}>-</button>}</div>))}<button type="button" className="btn btn-outline btn-sm" style={{ marginTop: 4 }} onClick={() => addChoice(i)}>+ Paire</button></div>)}
                        {q.type === 'order' && (<div style={{ marginBottom: 8 }}>{(q.choices || []).map((c, ci) => (<div key={ci} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}><span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', minWidth: 22 }}>{ci + 1}.</span><input className="form-input" style={{ flex: 1 }} placeholder={`Element ${ci + 1}`} value={c} onChange={e => updateChoice(i, ci, e.target.value)} />{(q.choices || []).length > 2 && <button type="button" className="btn btn-outline btn-sm" style={{ padding: '2px 8px' }} onClick={() => removeChoice(i, ci)}>-</button>}</div>))}<button type="button" className="btn btn-outline btn-sm" style={{ marginTop: 4 }} onClick={() => addChoice(i)}>+ Element</button></div>)}
                        {(q.type === 'open' || q.type === 'upload') && (<div style={{ fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic', marginBottom: 8, padding: '8px 12px', background: '#f8fafc', borderRadius: 6, border: '1px solid var(--border)' }}>{q.type === 'upload' ? "L'etudiant devra deposer un fichier. Correction manuelle." : "Reponse libre. Correction manuelle par l'enseignant."}</div>)}
                        {['mcq', 'mcq_multi', 'truefalse', 'short', 'fill', 'order', 'match'].includes(q.type) && (<input className="form-input" style={{ fontSize: 12, marginTop: 6 }} placeholder="Explication affichee apres correction (optionnel)" value={q.explanation || ''} onChange={e => updateQ(i, 'explanation', e.target.value)} />)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="modal-footer"><button type="button" className="btn btn-outline" onClick={() => setExModal(false)}>Annuler</button><button type="submit" className="btn btn-primary">Creer l'examen</button></div>
            </form>
          </div>
        </div>
      )}

      {editCourseModal && (
        <div className="modal-overlay" onClick={() => setEditCourseModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header"><span className="modal-title">Modifier le cours</span><button className="modal-close" onClick={() => setEditCourseModal(false)}>x</button></div>
            <form onSubmit={updateCourse}>
              <div className="modal-body">
                <div className="form-group"><label className="form-label">Titre *</label><input className="form-input" required value={editCourseForm.title} onChange={e => setEditCourseForm(f => ({ ...f, title: e.target.value }))} /></div>
                <div className="form-group"><label className="form-label">Description</label><textarea className="form-input" rows={2} value={editCourseForm.description} onChange={e => setEditCourseForm(f => ({ ...f, description: e.target.value }))} style={{ resize: 'vertical' }} /></div>
                <div className="form-group"><label className="form-label">Enseignant *</label><select className="form-select" required value={editCourseForm.teacher_id} onChange={e => setEditCourseForm(f => ({ ...f, teacher_id: e.target.value }))}><option value="">-- Choisir un enseignant --</option>{allUsers.filter(u => u.role === 'teacher').map(t => (<option key={t.id} value={t.id}>{t.name}</option>))}</select></div>
                <div className="form-group"><label className="form-label">Statut</label><select className="form-select" value={String(editCourseForm.is_published)} onChange={e => setEditCourseForm(f => ({ ...f, is_published: e.target.value === 'true' }))}><option value="true">Publie</option><option value="false">Brouillon</option></select></div>
              </div>
              <div className="modal-footer"><button type="button" className="btn btn-outline" onClick={() => setEditCourseModal(false)}>Annuler</button><button type="submit" className="btn btn-primary">Enregistrer</button></div>
            </form>
          </div>
        </div>
      )}

      {courseModal && (
        <div className="modal-overlay" onClick={() => setCourseModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header"><span className="modal-title">Nouveau cours — {cls.name}</span><button className="modal-close" onClick={() => setCourseModal(false)}>x</button></div>
            <form onSubmit={createCourse}>
              <div className="modal-body">
                <div className="form-group"><label className="form-label">Titre *</label><input className="form-input" required value={courseForm.title} onChange={e => setCourseForm(f => ({ ...f, title: e.target.value }))} placeholder="Ex : Introduction aux reseaux" /></div>
                <div className="form-group"><label className="form-label">Description</label><textarea className="form-input" rows={2} value={courseForm.description} onChange={e => setCourseForm(f => ({ ...f, description: e.target.value }))} style={{ resize: 'vertical' }} /></div>
                <div className="form-group"><label className="form-label">Enseignant *</label><select className="form-select" required value={courseForm.teacher_id} onChange={e => setCourseForm(f => ({ ...f, teacher_id: e.target.value }))}><option value="">-- Choisir un enseignant --</option>{allUsers.filter(u => u.role === 'teacher').map(t => (<option key={t.id} value={t.id}>{t.name}</option>))}</select></div>
                <div className="form-group"><label className="form-label">Statut</label><select className="form-select" value={String(courseForm.is_published)} onChange={e => setCourseForm(f => ({ ...f, is_published: e.target.value === 'true' }))}><option value="true">Publie</option><option value="false">Brouillon</option></select></div>
              </div>
              <div className="modal-footer"><button type="button" className="btn btn-outline" onClick={() => setCourseModal(false)}>Annuler</button><button type="submit" className="btn btn-primary">Creer le cours</button></div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

/* ══════════════════════════════════════════════════════════
   FORUM
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
    try { const r = await api.get(`/forum/course/${selCourseId}`); setQuestions(r.data) }
    catch {} finally { setLoading(false) }
  }, [selCourseId])

  useEffect(() => { load() }, [load])

  const postQuestion = async e => {
    e.preventDefault(); setSending(true)
    try { await api.post(`/forum/course/${selCourseId}`, form); flash('Question publiee'); setForm({ title: '', body: '' }); setShowForm(false); load() }
    catch (err) { flash(err.response?.data?.detail || 'Erreur') }
    finally { setSending(false) }
  }

  const postReply = async questionId => {
    const body = replyBodies[questionId]?.trim(); if (!body) return
    setSending(true)
    try { await api.post(`/forum/post/${questionId}/reply`, { body }); setReplyBodies(prev => ({ ...prev, [questionId]: '' })); flash('Reponse ajoutee'); load() }
    catch (err) { flash(err.response?.data?.detail || 'Erreur') }
    finally { setSending(false) }
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
        <span style={{ fontSize: 14, color: 'var(--text-muted)' }}>{loading ? 'Chargement...' : `${questions.length} question${questions.length !== 1 ? 's' : ''}`}</span>
        {canPost && !showForm && <button className="btn btn-primary btn-sm" onClick={() => setShowForm(true)}>Poser une question</button>}
      </div>
      {msg && <div className="alert alert-success" style={{ marginBottom: 16 }}>{msg}</div>}
      {showForm && (
        <div className="card" style={{ marginBottom: 20 }}>
          <div className="card-header"><span className="card-title">Nouvelle question</span><button className="btn btn-outline btn-sm" onClick={() => setShowForm(false)}>Annuler</button></div>
          <form onSubmit={postQuestion}>
            <div className="card-body">
              <div className="form-group"><label className="form-label">Titre</label><input className="form-input" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} required /></div>
              <div className="form-group"><label className="form-label">Details</label><textarea className="form-input" rows={3} value={form.body} onChange={e => setForm({ ...form, body: e.target.value })} required style={{ resize: 'vertical' }} /></div>
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}><button type="submit" className="btn btn-primary" disabled={sending}>{sending ? 'Publication...' : 'Publier'}</button></div>
            </div>
          </form>
        </div>
      )}
      {loading ? <div className="loading-overlay"><div className="spinner" /></div>
        : questions.length === 0 ? <div className="empty-state"><h3>Aucune question</h3><p>Soyez le premier a poser une question sur ce cours.</p></div>
        : questions.map(q => (
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
                {(!q.replies || q.replies.length === 0) && <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 12 }}>Aucune reponse pour l'instant.</p>}
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
                    <textarea value={replyBodies[q.id] || ''} onChange={e => setReplyBodies(prev => ({ ...prev, [q.id]: e.target.value }))} placeholder="Votre reponse..." className="form-input" rows={2} style={{ flex: 1, resize: 'vertical' }} />
                    <button className="btn btn-primary btn-sm" style={{ alignSelf: 'flex-end' }} disabled={sending || !(replyBodies[q.id] || '').trim()} onClick={() => postReply(q.id)}>
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
