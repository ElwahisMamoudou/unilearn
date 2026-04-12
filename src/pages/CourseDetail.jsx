import { useEffect, useState, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import api from '../api/client'
import useAuthStore from '../store/authStore'

const TABS = [
  { key: 'overview',  label: '🏠 Accueil' },
  { key: 'students',  label: '👥 Étudiants' },
  { key: 'courses',   label: '📚 Cours' },
  { key: 'homeworks', label: '📝 Devoirs' },
  { key: 'exams',     label: '📋 Examens' },
  { key: 'sessions',  label: '🎥 Cours en ligne' },
]

export default function ClassDetail() {
  const { id }    = useParams()
  const navigate  = useNavigate()
  const { user }  = useAuthStore()
  const [tab, setTab]         = useState('overview')
  const [cls, setCls]         = useState(null)
  const [students, setStudents] = useState([])
  const [courses, setCourses] = useState([])
  const [homeworks, setHomeworks] = useState([])
  const [exams, setExams]     = useState([])
  const [sessions, setSessions] = useState([])
  const [allStudents, setAllStudents] = useState([])
  const [allCourses, setAllCourses]   = useState([])
  const [loading, setLoading] = useState(true)
  const [msg, setMsg]         = useState({ text: '', type: '' })

  const isAdmin   = user?.role === 'admin'
  const isTeacher = user?.role === 'teacher'
  const isStudent = user?.role === 'student'

  const flash = (text, type = 'success') => {
    setMsg({ text, type })
    setTimeout(() => setMsg({ text: '', type: '' }), 3500)
  }

  // ── Chargement ──────────────────────────────────
  const loadAll = async () => {
    try {
      const [clr, str] = await Promise.all([
        api.get(`/classes/${id}`),
        api.get(`/classes/${id}/students`),
      ])
      setCls(clr.data)
      setStudents(str.data)

      // Cours liés à cette classe via les cours du teacher assigné
      if (clr.data.teacher_id) {
        const cr = await api.get('/courses/my')
        // Filtrer les cours de cet enseignant
        setCourses(cr.data.filter(c => c.teacher_id === clr.data.teacher_id))
      }

      if (isAdmin) {
        const ur = await api.get('/admin/users')
        setAllStudents(ur.data.filter(u => u.role === 'student'))
        const acr = await api.get('/admin/courses')
        setAllCourses(acr.data)
      }
    } catch {}
    setLoading(false)
  }

  const loadTabData = async (t) => {
    if (t === 'homeworks' && homeworks.length === 0) {
      // Récupérer les devoirs de tous les cours de la classe
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

  const switchTab = (t) => { setTab(t); loadTabData(t) }

  // ── Actions étudiants ────────────────────────────
  const addStudent = async (studentId) => {
    try {
      await api.post(`/classes/${id}/students`, { student_ids: [studentId] })
      flash('Étudiant ajouté')
      const r = await api.get(`/classes/${id}/students`)
      setStudents(r.data)
    } catch (err) { flash(err.response?.data?.detail || 'Erreur', 'error') }
  }

  const removeStudent = async (studentId) => {
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

  // ── Inscrire classe à un cours ────────────────────
  const enrollClassToCourse = async (courseId) => {
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
      {msg.text && <div className={`alert alert-${msg.type === 'error' ? 'error' : 'success'}`}>{msg.text}</div>}

      {/* En-tête classe */}
      <div style={{
        background: 'linear-gradient(135deg, var(--navy), #1a3a6e)',
        borderRadius: 16, padding: '28px 32px', marginBottom: 24,
        color: '#fff', display: 'flex', alignItems: 'center', gap: 20,
      }}>
        <button onClick={() => navigate('/classes')}
          style={{ background: 'rgba(255,255,255,.15)', border: 'none', color: '#fff',
            borderRadius: 8, padding: '6px 12px', cursor: 'pointer', fontSize: 14 }}>
          ← Retour
        </button>
        <div style={{ fontSize: 36 }}>🎓</div>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <h2 style={{ fontFamily: 'Playfair Display, serif', fontSize: 22, margin: 0 }}>{cls.name}</h2>
            {cls.code && (
              <span style={{ fontSize: 12, background: 'rgba(255,255,255,.2)', padding: '2px 10px', borderRadius: 20 }}>
                {cls.code}
              </span>
            )}
          </div>
          <div style={{ opacity: .7, fontSize: 13, marginTop: 4, display: 'flex', gap: 20 }}>
            {cls.level             && <span>📚 {cls.level}</span>}
            {cls.academic_year_name && <span>📅 {cls.academic_year_name}</span>}
            {cls.teacher_name      && <span>👨‍🏫 {cls.teacher_name}</span>}
          </div>
        </div>
        {/* Stats rapides */}
        <div style={{ display: 'flex', gap: 24 }}>
          {[
            ['Étudiants', students.length],
            ['Cours',     courses.length],
          ].map(([l, v]) => (
            <div key={l} style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 24, fontWeight: 700 }}>{v}</div>
              <div style={{ fontSize: 11, opacity: .6 }}>{l}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Onglets */}
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

      {/* ── Onglet Accueil ── */}
      {tab === 'overview' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          {[
            { icon: '👥', label: 'Étudiants inscrits', value: `${students.length} / ${cls.max_students}`, tab: 'students' },
            { icon: '📚', label: 'Cours disponibles',  value: courses.length,  tab: 'courses'   },
            { icon: '📝', label: 'Devoirs actifs',      value: homeworks.filter(h => h.is_published).length || '—', tab: 'homeworks' },
            { icon: '📋', label: 'Examens publiés',     value: exams.filter(e => e.is_published).length || '—',     tab: 'exams'     },
            { icon: '🎥', label: 'Sessions vidéo',      value: sessions.length || '—', tab: 'sessions' },
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
          {isAdmin && (
            <div className="card" style={{ cursor: 'pointer' }} onClick={() => navigate(`/exams`)}>
              <div className="card-body" style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <span style={{ fontSize: 28 }}>⚙️</span>
                <div>
                  <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Administration</div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--navy)' }}>Gérer les évaluations</div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Onglet Étudiants ── */}
      {tab === 'students' && (
        <div style={{ display: 'grid', gridTemplateColumns: isAdmin ? '1fr 1fr' : '1fr', gap: 24 }}>
          {/* Liste inscrits */}
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
                        <span style={{ marginLeft: 8, background: '#ede9fe', color: '#7c3aed',
                          padding: '1px 6px', borderRadius: 10, fontSize: 10, fontWeight: 600 }}>
                          {s.matricule}
                        </span>
                      )}
                    </div>
                  </div>
                  {isAdmin && (
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button className="btn btn-outline btn-sm" style={{ fontSize: 11 }}
                        onClick={() => setMatricule(s.id, s.matricule)}>
                        Matricule
                      </button>
                      <button className="btn btn-danger btn-sm" style={{ fontSize: 11 }}
                        onClick={() => removeStudent(s.id)}>
                        Retirer
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Ajouter étudiants (admin) */}
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

      {/* ── Onglet Cours ── */}
      {tab === 'courses' && (
        <div>
          {isAdmin && allCourses.length > 0 && (
            <div style={{ marginBottom: 20, padding: 16, background: '#f8fafc', borderRadius: 10, border: '1px solid var(--border)' }}>
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

          {courses.length === 0 ? (
            <div className="empty-state">
              <h3>Aucun cours</h3>
              <p>Aucun cours n'est encore associé à cette classe.</p>
            </div>
          ) : courses.map(c => (
            <div key={c.id} className="card" style={{ marginBottom: 10, cursor: 'pointer' }}
              onClick={() => navigate(`/courses/${c.id}`)}>
              <div className="card-body" style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--navy)' }}>{c.title}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                    {c.teacher_name} · {c.lesson_count} leçon(s)
                  </div>
                </div>
                <span style={{ fontSize: 11, padding: '2px 10px', borderRadius: 20,
                  background: c.is_published ? '#d1fae5' : '#fef9c3',
                  color: c.is_published ? '#065f46' : '#854d0e' }}>
                  {c.is_published ? 'Publié' : 'Brouillon'}
                </span>
                <span style={{ fontSize: 13, color: 'var(--blue)' }}>Voir →</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Onglet Devoirs ── */}
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
                      📚 {hw.course_title} · 📅 À rendre : {due.toLocaleString('fr-FR')} · 📊 /{hw.max_score}
                      {late && <span style={{ color: '#ef4444', marginLeft: 8, fontWeight: 600 }}>⚠ Délai dépassé</span>}
                    </div>
                  </div>
                  <span style={{ fontSize: 11, padding: '2px 10px', borderRadius: 20,
                    background: hw.is_published ? '#d1fae5' : '#fef9c3',
                    color: hw.is_published ? '#065f46' : '#854d0e' }}>
                    {hw.is_published ? 'Publié' : 'Brouillon'}
                  </span>
                  {isStudent && hw.is_published && (
                    <button className="btn btn-primary btn-sm"
                      onClick={() => navigate(`/homeworks?course=${hw.course_id}`)}>
                      {hw.my_submission ? 'Voir ma soumission' : 'Soumettre'}
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

      {/* ── Onglet Examens ── */}
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
                <span style={{ fontSize: 11, padding: '2px 10px', borderRadius: 20,
                  background: ex.is_published ? '#d1fae5' : '#fef9c3',
                  color: ex.is_published ? '#065f46' : '#854d0e' }}>
                  {ex.is_published ? 'Publié' : 'Brouillon'}
                </span>
                <button className="btn btn-outline btn-sm"
                  onClick={() => navigate(`/exams?course=${ex.course_id}`)}>
                  {isStudent ? 'Passer →' : 'Gérer →'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Onglet Sessions vidéo ── */}
      {tab === 'sessions' && (
        <div>
          {(isAdmin || isTeacher) && (
            <div style={{ marginBottom: 16 }}>
              {courses.length > 0 && (
                <button className="btn btn-primary btn-sm"
                  onClick={() => navigate(`/courses/${courses[0]?.id}`)}>
                  + Planifier un cours en ligne
                </button>
              )}
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
                <span style={{ fontSize: 11, padding: '2px 10px', borderRadius: 20, fontWeight: 600,
                  background: s.is_active ? '#d1fae5' : '#f1f5f9',
                  color: s.is_active ? '#065f46' : '#64748b' }}>
                  {s.is_active ? '🔴 En direct' : s.ended_at ? 'Terminé' : 'Planifié'}
                </span>
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