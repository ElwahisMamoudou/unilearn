import { useEffect, useState, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import api from '../api/client'
import useAuthStore from '../store/authStore'

/* ── URL thumbnail / fichiers ── */
const BACKEND = (import.meta.env.VITE_API_URL || '').replace(/\/api\/?$/, '')
const fileUrl = path => {
  if (!path) return null
  if (path.startsWith('http')) return path
  const clean = path.replace(/\\/g, '/').replace(/^\/+/, '')
  return BACKEND ? `${BACKEND}/${clean}` : `/${clean}`
}

const TABS = [
  { key: 'overview',  label: '🏠 Accueil' },
  { key: 'students',  label: '👥 Étudiants' },
  { key: 'courses',   label: '📚 Cours' },
  { key: 'homeworks', label: '📝 Devoirs' },
  { key: 'exams',     label: '📋 Examens' },
  { key: 'sessions',  label: '🎥 Cours en ligne' },
]

/* ── Visionneuse PDF plein écran ── */
function PdfViewer({ url, title, onClose }) {
  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(0,0,0,0.88)', backdropFilter: 'blur(6px)',
        display: 'flex', flexDirection: 'column',
      }}
      onClick={onClose}
    >
      <div
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '12px 20px', background: '#0f1f3d', flexShrink: 0,
        }}
        onClick={e => e.stopPropagation()}
      >
        <span style={{ color: '#fff', fontWeight: 700, fontSize: 15, display: 'flex', alignItems: 'center', gap: 8 }}>
          📄 {title}
        </span>
        <div style={{ display: 'flex', gap: 10 }}>
          <a
            href={url} target="_blank" rel="noopener noreferrer"
            style={{
              background: '#3b82f6', color: '#fff', borderRadius: 8,
              padding: '7px 16px', fontWeight: 700, fontSize: 13,
              textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 6,
            }}
          >⬇ Télécharger</a>
          <button
            onClick={onClose}
            style={{
              background: 'rgba(255,255,255,.15)', color: '#fff', border: 'none',
              borderRadius: 8, padding: '7px 14px', fontWeight: 700, cursor: 'pointer', fontSize: 16,
            }}
          >✕</button>
        </div>
      </div>
      <div style={{ flex: 1, overflow: 'hidden' }} onClick={e => e.stopPropagation()}>
        <iframe src={url} title={title} style={{ width: '100%', height: '100%', border: 'none' }} />
      </div>
    </div>
  )
}

/* ── Icônes type de leçon ── */
const lessonIcon = l => {
  const url = (l.file_url || '').toLowerCase()
  const type = (l.content_type || '').toLowerCase()
  if (url.endsWith('.pdf') || type === 'pdf')   return { icon: '📄', color: '#ef4444', label: 'PDF' }
  if (url.match(/\.(mp4|webm|mov|avi)$/) || type === 'video') return { icon: '🎬', color: '#8b5cf6', label: 'Vidéo' }
  if (type === 'text' || type === 'article')    return { icon: '📝', color: '#3b82f6', label: 'Article' }
  if (type === 'quiz')                          return { icon: '❓', color: '#f59e0b', label: 'Quiz' }
  return { icon: '📖', color: '#64748b', label: 'Leçon' }
}

/* ══════════════════════════════════════════════
   Panneau leçons d'un cours (inline, extensible)
══════════════════════════════════════════════ */
function CourseLessonsPanel({ course, onOpenPdf }) {
  const [lessons,  setLessons]  = useState(null)   // null = pas encore chargé
  const [loading,  setLoading]  = useState(false)
  const [open,     setOpen]     = useState(false)

  const toggle = async () => {
    if (!open && lessons === null) {
      setLoading(true)
      try {
        const { data } = await api.get(`/courses/${course.id}/lessons`)
        setLessons(data)
      } catch {
        setLessons([])
      } finally {
        setLoading(false)
      }
    }
    setOpen(v => !v)
  }

  const thumb = fileUrl(course.thumbnail)
  const CAT_GRADIENTS = [
    ['#1e3a5f','#0ea5e9'],['#1a2e1a','#22c55e'],['#2e1a1a','#ef4444'],
    ['#2e2a1a','#f59e0b'],['#1a1a2e','#8b5cf6'],['#1a2e2e','#14b8a6'],
  ]
  const grad = CAT_GRADIENTS[(course.category_id || course.id || 0) % CAT_GRADIENTS.length]

  return (
    <div style={{
      borderRadius: 14, border: '1px solid #e2e8f0',
      overflow: 'hidden', marginBottom: 10,
      boxShadow: open ? '0 8px 24px rgba(59,130,246,.1)' : '0 2px 6px rgba(0,0,0,.04)',
      transition: 'box-shadow .2s',
    }}>
      {/* ── En-tête cours (cliquable) ── */}
      <div
        onClick={toggle}
        style={{
          display: 'flex', alignItems: 'center', gap: 14,
          padding: '14px 18px', cursor: 'pointer', background: 'white',
          borderBottom: open ? '1px solid #f1f5f9' : 'none',
          transition: 'background .15s',
        }}
        onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'}
        onMouseLeave={e => e.currentTarget.style.background = 'white'}
      >
        {/* Thumbnail */}
        <div style={{
          width: 52, height: 52, borderRadius: 12, flexShrink: 0, overflow: 'hidden',
          background: thumb ? `url(${thumb}) center/cover` : `linear-gradient(135deg,${grad[0]},${grad[1]})`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 22,
        }}>
          {!thumb && '📚'}
        </div>

        {/* Infos */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: '#0f1f3d', marginBottom: 3 }}>
            {course.title}
          </div>
          <div style={{ fontSize: 12, color: '#64748b', display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <span>👨‍🏫 {course.teacher_name || '—'}</span>
            <span>📖 {course.lesson_count ?? (lessons?.length ?? '?')} leçon{(course.lesson_count ?? 0) > 1 ? 's' : ''}</span>
            {course.student_count > 0 && <span>👥 {course.student_count}</span>}
          </div>
        </div>

        {/* Badge statut */}
        <span style={{
          fontSize: 11, padding: '3px 12px', borderRadius: 20, fontWeight: 700, flexShrink: 0,
          background: course.is_published ? '#d1fae5' : '#fef9c3',
          color: course.is_published ? '#065f46' : '#854d0e',
        }}>
          {course.is_published ? 'Publié' : 'Brouillon'}
        </span>

        {/* Chevron */}
        <div style={{
          width: 28, height: 28, borderRadius: 8, background: '#f1f5f9',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 12, flexShrink: 0, color: '#64748b',
          transform: open ? 'rotate(180deg)' : 'none',
          transition: 'transform .25s',
        }}>▼</div>
      </div>

      {/* ── Corps : liste des leçons ── */}
      {open && (
        <div style={{ background: '#fafbfc', padding: '12px 18px 16px' }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '20px 0', color: '#94a3b8', fontSize: 13 }}>
              ⏳ Chargement des leçons...
            </div>
          ) : !lessons || lessons.length === 0 ? (
            <div style={{
              textAlign: 'center', padding: '18px 0',
              color: '#94a3b8', fontSize: 13,
            }}>
              📭 Aucune leçon dans ce cours pour le moment.
            </div>
          ) : (
            <>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 10 }}>
                {lessons.length} leçon{lessons.length > 1 ? 's' : ''}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {lessons.map((l, i) => {
                  const { icon, color, label } = lessonIcon(l)
                  const isPdf  = (l.file_url || '').toLowerCase().endsWith('.pdf')
                  const isVid  = (l.file_url || '').toLowerCase().match(/\.(mp4|webm|mov)$/)
                  const fUrl   = fileUrl(l.file_url)

                  return (
                    <div
                      key={l.id}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 12,
                        padding: '11px 14px', borderRadius: 11,
                        background: 'white',
                        border: '1px solid #e8ecf4',
                        transition: 'box-shadow .15s',
                      }}
                      onMouseEnter={e => e.currentTarget.style.boxShadow = '0 4px 12px rgba(59,130,246,.1)'}
                      onMouseLeave={e => e.currentTarget.style.boxShadow = 'none'}
                    >
                      {/* Numéro */}
                      <div style={{
                        width: 28, height: 28, borderRadius: 8, flexShrink: 0,
                        background: '#f1f5f9',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 11, fontWeight: 800, color: '#64748b',
                      }}>
                        {i + 1}
                      </div>

                      {/* Icône type */}
                      <div style={{
                        width: 34, height: 34, borderRadius: 10, flexShrink: 0,
                        background: `${color}18`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 17,
                      }}>
                        {icon}
                      </div>

                      {/* Titre + meta */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{
                          fontWeight: 600, fontSize: 13, color: '#0f1f3d',
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        }}>
                          {l.title}
                        </div>
                        <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2, display: 'flex', gap: 8, alignItems: 'center' }}>
                          <span style={{ color, fontWeight: 700 }}>{label}</span>
                          {l.duration_min > 0 && <span>⏱ {l.duration_min} min</span>}
                          {l.is_free && (
                            <span style={{ background: '#f0fdf4', color: '#16a34a', padding: '1px 6px', borderRadius: 8, fontWeight: 700, fontSize: 10 }}>
                              GRATUIT
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Boutons d'action */}
                      <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                        {isPdf && fUrl && (
                          <>
                            {/* Ouvrir dans la visionneuse */}
                            <button
                              onClick={e => { e.stopPropagation(); onOpenPdf(fUrl, l.title) }}
                              style={{
                                display: 'inline-flex', alignItems: 'center', gap: 5,
                                padding: '6px 12px', borderRadius: 9,
                                border: '1.5px solid #fca5a5',
                                background: '#fff5f5', color: '#ef4444',
                                fontSize: 11, fontWeight: 700, cursor: 'pointer',
                                transition: 'all .15s',
                              }}
                              onMouseEnter={e => { e.currentTarget.style.background = '#fef2f2'; e.currentTarget.style.transform = 'scale(1.04)' }}
                              onMouseLeave={e => { e.currentTarget.style.background = '#fff5f5'; e.currentTarget.style.transform = 'scale(1)' }}
                            >
                              📄 Ouvrir
                            </button>
                            {/* Télécharger */}
                            <a
                              href={fUrl} target="_blank" rel="noopener noreferrer"
                              onClick={e => e.stopPropagation()}
                              style={{
                                display: 'inline-flex', alignItems: 'center', gap: 5,
                                padding: '6px 12px', borderRadius: 9,
                                border: '1.5px solid #bae6fd',
                                background: '#f0f9ff', color: '#0369a1',
                                fontSize: 11, fontWeight: 700, cursor: 'pointer',
                                textDecoration: 'none',
                                transition: 'all .15s',
                              }}
                              onMouseEnter={e => e.currentTarget.style.background = '#e0f2fe'}
                              onMouseLeave={e => e.currentTarget.style.background = '#f0f9ff'}
                            >
                              ⬇ DL
                            </a>
                          </>
                        )}

                        {isVid && fUrl && (
                          <a
                            href={fUrl} target="_blank" rel="noopener noreferrer"
                            onClick={e => e.stopPropagation()}
                            style={{
                              display: 'inline-flex', alignItems: 'center', gap: 5,
                              padding: '6px 12px', borderRadius: 9,
                              border: '1.5px solid #ddd6fe',
                              background: '#f5f3ff', color: '#7c3aed',
                              fontSize: 11, fontWeight: 700,
                              textDecoration: 'none',
                            }}
                          >
                            ▶ Voir
                          </a>
                        )}

                        {!isPdf && !isVid && fUrl && (
                          <a
                            href={fUrl} target="_blank" rel="noopener noreferrer"
                            onClick={e => e.stopPropagation()}
                            style={{
                              display: 'inline-flex', alignItems: 'center', gap: 5,
                              padding: '6px 12px', borderRadius: 9,
                              border: '1.5px solid #e2e8f0',
                              background: '#f8fafc', color: '#475569',
                              fontSize: 11, fontWeight: 700,
                              textDecoration: 'none',
                            }}
                          >
                            🔗 Ouvrir
                          </a>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </>
          )}

          {/* Bouton "Aller au cours complet" */}
          <div style={{ marginTop: 14, textAlign: 'right' }}>
            <a
              href={`/courses/${course.id}`}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                fontSize: 12, fontWeight: 700, color: '#3b82f6',
                textDecoration: 'none',
                padding: '7px 16px', borderRadius: 10,
                border: '1.5px solid #bfdbfe',
                background: '#eff6ff',
                transition: 'all .15s',
              }}
              onMouseEnter={e => e.currentTarget.style.background = '#dbeafe'}
              onMouseLeave={e => e.currentTarget.style.background = '#eff6ff'}
            >
              Voir le cours complet →
            </a>
          </div>
        </div>
      )}
    </div>
  )
}

/* ══════════════════════════════════════════════
   PAGE PRINCIPALE ClassDetail
══════════════════════════════════════════════ */
export default function ClassDetail() {
  const { id }    = useParams()
  const navigate  = useNavigate()
  const { user }  = useAuthStore()

  const [tab,         setTab]         = useState('overview')
  const [cls,         setCls]         = useState(null)
  const [students,    setStudents]    = useState([])
  const [courses,     setCourses]     = useState([])
  const [homeworks,   setHomeworks]   = useState([])
  const [exams,       setExams]       = useState([])
  const [sessions,    setSessions]    = useState([])
  const [allStudents, setAllStudents] = useState([])
  const [allCourses,  setAllCourses]  = useState([])
  const [loading,     setLoading]     = useState(true)
  const [msg,         setMsg]         = useState({ text: '', type: '' })
  const [pdfViewer,   setPdfViewer]   = useState(null)  // { url, title }

  const isAdmin   = user?.role === 'admin'
  const isTeacher = user?.role === 'teacher'
  const isStudent = user?.role === 'student'

  const flash = (text, type = 'success') => {
    setMsg({ text, type })
    setTimeout(() => setMsg({ text: '', type: '' }), 3500)
  }

  const loadAll = async () => {
    try {
      const [clr, str] = await Promise.all([
        api.get(`/classes/${id}`),
        api.get(`/classes/${id}/students`),
      ])
      setCls(clr.data)
      setStudents(str.data)

      if (clr.data.teacher_id) {
        const cr = await api.get('/courses/my')
        setCourses(cr.data.filter(c => c.teacher_id === clr.data.teacher_id))
      } else {
        // Charger tous les cours liés à la classe via class_group_id ou class_id
        try {
          const cr = await api.get(`/classes/${id}`)
          if (cr.data.courses) setCourses(cr.data.courses)
        } catch {}
      }

      if (isAdmin) {
        const ur  = await api.get('/admin/users')
        setAllStudents(ur.data.filter(u => u.role === 'student'))
        const acr = await api.get('/admin/courses')
        setAllCourses(acr.data)
      }
    } catch {}
    setLoading(false)
  }

  const loadTabData = async t => {
    if (t === 'homeworks' && homeworks.length === 0) {
      const all = []
      for (const c of courses) {
        const r = await api.get(`/homeworks/course/${c.id}`).catch(() => ({ data: [] }))
        all.push(...r.data.map(h => ({ ...h, course_title: c.title })))
      }
      setHomeworks(all)
    }
    if (t === 'exams' && exams.length === 0) {
      const all = []
      for (const c of courses) {
        const r = await api.get(`/exams/course/${c.id}`).catch(() => ({ data: [] }))
        all.push(...r.data.map(e => ({ ...e, course_title: c.title })))
      }
      setExams(all)
    }
    if (t === 'sessions' && sessions.length === 0) {
      const all = []
      for (const c of courses) {
        const r = await api.get(`/sessions/course/${c.id}`).catch(() => ({ data: [] }))
        all.push(...r.data.map(s => ({ ...s, course_title: c.title })))
      }
      setSessions(all)
    }
  }

  useEffect(() => { loadAll() }, [id])
  useEffect(() => { if (courses.length > 0) loadTabData(tab) }, [tab, courses])

  const switchTab = t => { setTab(t); loadTabData(t) }

  /* ── Actions étudiants ── */
  const addStudent = async studentId => {
    try {
      await api.post(`/classes/${id}/students`, { student_ids: [studentId] })
      flash('Étudiant ajouté')
      const r = await api.get(`/classes/${id}/students`)
      setStudents(r.data)
    } catch (err) { flash(err.response?.data?.detail || 'Erreur', 'error') }
  }

  const removeStudent = async studentId => {
    await api.delete(`/classes/${id}/students/${studentId}`)
    flash('Étudiant retiré')
    const r = await api.get(`/classes/${id}/students`)
    setStudents(r.data)
  }

  const setMatricule = async (studentId, current) => {
    const m = prompt('Numéro de matricule :', current || '')
    if (!m) return
    try {
      await api.patch(`/classes/students/${studentId}/matricule?matricule=${m}`)
      flash('Matricule enregistré')
      const r = await api.get(`/classes/${id}/students`)
      setStudents(r.data)
    } catch (err) { flash(err.response?.data?.detail || 'Erreur', 'error') }
  }

  const enrollClassToCourse = async courseId => {
    try {
      const r = await api.post(`/classes/${id}/enroll-course/${courseId}`)
      flash(`${r.data.enrolled} étudiant(s) inscrit(s) au cours "${r.data.course}"`)
    } catch (err) { flash(err.response?.data?.detail || 'Erreur', 'error') }
  }

  if (loading) return <div className="loading-overlay"><div className="spinner" /></div>
  if (!cls)    return <div className="loading-overlay">Classe introuvable</div>

  const notInClass = allStudents.filter(s => !students.find(st => st.id === s.id))

  return (
    <div>
      {/* Visionneuse PDF */}
      {pdfViewer && (
        <PdfViewer
          url={pdfViewer.url}
          title={pdfViewer.title}
          onClose={() => setPdfViewer(null)}
        />
      )}

      {msg.text && (
        <div className={`alert alert-${msg.type === 'error' ? 'error' : 'success'}`}>{msg.text}</div>
      )}

      {/* ── En-tête classe ── */}
      <div style={{
        background: 'linear-gradient(135deg, var(--navy), #1a3a6e)',
        borderRadius: 16, padding: '28px 32px', marginBottom: 24,
        color: '#fff', display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap',
      }}>
        <button onClick={() => navigate('/classes')} style={{
          background: 'rgba(255,255,255,.15)', border: 'none', color: '#fff',
          borderRadius: 8, padding: '6px 12px', cursor: 'pointer', fontSize: 14,
        }}>← Retour</button>
        <div style={{ fontSize: 36 }}>🎓</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <h2 style={{ fontFamily: 'Playfair Display, serif', fontSize: 22, margin: 0 }}>{cls.name}</h2>
            {cls.code && (
              <span style={{ fontSize: 12, background: 'rgba(255,255,255,.2)', padding: '2px 10px', borderRadius: 20 }}>
                {cls.code}
              </span>
            )}
          </div>
          <div style={{ opacity: .7, fontSize: 13, marginTop: 4, display: 'flex', gap: 20, flexWrap: 'wrap' }}>
            {cls.level              && <span>📚 {cls.level}</span>}
            {cls.academic_year_name && <span>📅 {cls.academic_year_name}</span>}
            {cls.teacher_name       && <span>👨‍🏫 {cls.teacher_name}</span>}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 24 }}>
          {[['Étudiants', students.length], ['Cours', courses.length]].map(([l, v]) => (
            <div key={l} style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 24, fontWeight: 700 }}>{v}</div>
              <div style={{ fontSize: 11, opacity: .6 }}>{l}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Onglets ── */}
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

      {/* ── Accueil ── */}
      {tab === 'overview' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 16 }}>
          {[
            { icon: '👥', label: 'Étudiants inscrits', value: `${students.length} / ${cls.max_students}`, tab: 'students' },
            { icon: '📚', label: 'Cours disponibles',  value: courses.length,  tab: 'courses' },
            { icon: '📝', label: 'Devoirs actifs',     value: homeworks.filter(h => h.is_published).length || '—', tab: 'homeworks' },
            { icon: '📋', label: 'Examens publiés',    value: exams.filter(e => e.is_published).length || '—',     tab: 'exams' },
            { icon: '🎥', label: 'Sessions vidéo',     value: sessions.length || '—', tab: 'sessions' },
          ].map((s, i) => (
            <div key={i} className="card" style={{ cursor: 'pointer' }} onClick={() => switchTab(s.tab)}>
              <div className="card-body" style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <span style={{ fontSize: 28 }}>{s.icon}</span>
                <div>
                  <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>{s.label}</div>
                  <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--navy)' }}>{s.value}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Étudiants ── */}
      {tab === 'students' && (
        <div style={{ display: 'grid', gridTemplateColumns: isAdmin ? '1fr 1fr' : '1fr', gap: 24 }}>
          <div>
            <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 12, color: 'var(--navy)' }}>
              Inscrits ({students.length}/{cls.max_students})
            </div>
            {students.length === 0 ? (
              <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>Aucun étudiant dans cette classe.</div>
            ) : students.map(s => (
              <div key={s.id} className="card" style={{ marginBottom: 8 }}>
                <div className="card-body" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{
                    width: 34, height: 34, borderRadius: '50%', background: '#eff6ff',
                    color: 'var(--blue)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontWeight: 700, fontSize: 13, flexShrink: 0,
                  }}>
                    {s.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--navy)' }}>{s.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                      {s.email}
                      {s.matricule && (
                        <span style={{ marginLeft: 8, background: '#ede9fe', color: '#7c3aed', padding: '1px 6px', borderRadius: 10, fontSize: 10, fontWeight: 600 }}>
                          {s.matricule}
                        </span>
                      )}
                    </div>
                  </div>
                  {isAdmin && (
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button className="btn btn-outline btn-sm" style={{ fontSize: 11 }}
                        onClick={() => setMatricule(s.id, s.matricule)}>Matricule</button>
                      <button className="btn btn-danger btn-sm" style={{ fontSize: 11 }}
                        onClick={() => removeStudent(s.id)}>Retirer</button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
          {isAdmin && (
            <div>
              <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 12, color: 'var(--navy)' }}>
                Ajouter un étudiant
              </div>
              {notInClass.length === 0 ? (
                <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>Tous les étudiants sont inscrits.</div>
              ) : notInClass.map(s => (
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

      {/* ── COURS (avec leçons et PDFs) ── */}
      {tab === 'courses' && (
        <div>
          {/* Inscrire toute la classe (admin) */}
          {isAdmin && allCourses.length > 0 && (
            <div style={{ marginBottom: 20, padding: 16, background: '#f8fafc', borderRadius: 12, border: '1px solid var(--border)' }}>
              <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 10, color: 'var(--navy)' }}>
                Inscrire toute la classe à un cours
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <select className="form-select" style={{ flex: 1 }} id="enroll-course-sel">
                  <option value="">-- Choisir un cours --</option>
                  {allCourses.map(c => <option key={c.id} value={c.id}>{c.title} ({c.teacher_name})</option>)}
                </select>
                <button className="btn btn-primary" onClick={() => {
                  const sel = document.getElementById('enroll-course-sel')
                  if (sel.value) enrollClassToCourse(sel.value)
                }}>Inscrire la classe</button>
              </div>
            </div>
          )}

          {/* Info */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            marginBottom: 16, flexWrap: 'wrap', gap: 8,
          }}>
            <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
              {courses.length} cours · Cliquez sur un cours pour voir ses leçons
            </span>
          </div>

          {courses.length === 0 ? (
            <div className="empty-state">
              <h3>Aucun cours</h3>
              <p>Aucun cours n'est encore associé à cette classe.</p>
            </div>
          ) : (
            /* ── Panneaux extensibles par cours ── */
            courses.map(c => (
              <CourseLessonsPanel
                key={c.id}
                course={c}
                onOpenPdf={(url, title) => setPdfViewer({ url, title })}
              />
            ))
          )}
        </div>
      )}

      {/* ── Devoirs ── */}
      {tab === 'homeworks' && (
        <div>
          {(isAdmin || isTeacher) && (
            <div style={{ marginBottom: 16 }}>
              <button className="btn btn-primary btn-sm" onClick={() => navigate('/homeworks')}>
                + Gérer les devoirs
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
                      📚 {hw.course_title} · 📅 {due.toLocaleString('fr-FR')} · 📊 /{hw.max_score}
                      {late && <span style={{ color: '#ef4444', marginLeft: 8, fontWeight: 600 }}>⚠ Délai dépassé</span>}
                    </div>
                  </div>
                  <span style={{
                    fontSize: 11, padding: '2px 10px', borderRadius: 20,
                    background: hw.is_published ? '#d1fae5' : '#fef9c3',
                    color: hw.is_published ? '#065f46' : '#854d0e',
                  }}>{hw.is_published ? 'Publié' : 'Brouillon'}</span>
                  {isStudent && hw.is_published && (
                    <button className="btn btn-primary btn-sm"
                      onClick={() => navigate(`/homeworks?course=${hw.course_id}`)}>
                      {hw.my_submission ? 'Ma soumission' : 'Soumettre'}
                    </button>
                  )}
                  {(isAdmin || isTeacher) && (
                    <button className="btn btn-outline btn-sm"
                      onClick={() => navigate(`/homeworks?course=${hw.course_id}`)}>
                      Gérer →
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ── Examens ── */}
      {tab === 'exams' && (
        <div>
          {(isAdmin || isTeacher) && (
            <div style={{ marginBottom: 16 }}>
              <button className="btn btn-primary btn-sm" onClick={() => navigate('/exams')}>
                + Gérer les examens
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
                    📚 {ex.course_title} · ⏱ {ex.duration_min} min · {ex.questions?.length || 0} question(s)
                    {ex.starts_at && ` · Début : ${new Date(ex.starts_at).toLocaleString('fr-FR')}`}
                  </div>
                </div>
                <span style={{
                  fontSize: 11, padding: '2px 10px', borderRadius: 20,
                  background: ex.is_published ? '#d1fae5' : '#fef9c3',
                  color: ex.is_published ? '#065f46' : '#854d0e',
                }}>{ex.is_published ? 'Publié' : 'Brouillon'}</span>
                <button className="btn btn-outline btn-sm"
                  onClick={() => navigate(`/exams?course=${ex.course_id}`)}>
                  {isStudent ? 'Passer →' : 'Gérer →'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Sessions vidéo ── */}
      {tab === 'sessions' && (
        <div>
          {(isAdmin || isTeacher) && courses.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <button className="btn btn-primary btn-sm"
                onClick={() => navigate(`/courses/${courses[0]?.id}`)}>
                + Planifier un cours en ligne
              </button>
            </div>
          )}
          {sessions.length === 0 ? (
            <div className="empty-state"><h3>Aucune session planifiée</h3></div>
          ) : sessions.map(s => (
            <div key={s.id} className="card" style={{ marginBottom: 10 }}>
              <div className="card-body" style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--navy)' }}>{s.title}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 3 }}>
                    📚 {s.course_title}
                    {s.scheduled_at && ` · 📅 ${new Date(s.scheduled_at).toLocaleString('fr-FR')}`}
                  </div>
                </div>
                <span style={{
                  fontSize: 11, padding: '2px 10px', borderRadius: 20, fontWeight: 600,
                  background: s.is_active ? '#d1fae5' : '#f1f5f9',
                  color: s.is_active ? '#065f46' : '#64748b',
                }}>{s.is_active ? '🔴 En direct' : s.ended_at ? 'Terminé' : 'Planifié'}</span>
                {s.is_active && (
                  <button className="btn btn-primary btn-sm"
                    onClick={() => navigate(`/room/${s.room_id}`)}>
                    🎥 Rejoindre
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
