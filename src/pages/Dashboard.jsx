import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../api/client'
import useAuthStore from '../store/authStore'

export default function Dashboard() {
  const { user }  = useAuthStore()
  const navigate  = useNavigate()
  const [classes, setClasses] = useState([])
  const [stats,   setStats]   = useState(null)
  const [users,   setUsers]   = useState([])
  const [loading, setLoading] = useState(true)

  const isAdmin   = user?.role === 'admin'
  const isTeacher = user?.role === 'teacher'
  const isStudent = user?.role === 'student'

  useEffect(() => {
    const load = async () => {
      try {
        // Classes selon le rôle
        const cr = await api.get('/classes')
        setClasses(cr.data)

        if (isAdmin) {
          const [sr, ur] = await Promise.all([
            api.get('/admin/stats'),
            api.get('/admin/users'),
          ])
          setStats(sr.data)
          setUsers(ur.data)
        }
      } catch {}
      setLoading(false)
    }
    load()
  }, [])

  if (loading) return <div className="loading-overlay"><div className="spinner" /></div>

  // ── VUE ADMIN ──────────────────────────────────
  if (isAdmin) {
    const teachers = users.filter(u => u.role === 'teacher')
    const students = users.filter(u => u.role === 'student')

    return (
      <>
        {/* Stats globales */}
        {stats && (
          <div className="stats-grid" style={{ marginBottom: 28 }}>
            {[
              { label: 'Classes',      value: classes.length,       cls: 'stat-blue'  },
              { label: 'Étudiants',    value: stats.total_students, cls: 'stat-green' },
              { label: 'Enseignants',  value: stats.total_teachers, cls: 'stat-gold'  },
              { label: 'Cours',        value: stats.total_courses,  cls: 'stat-navy'  },
              { label: 'Examens',      value: stats.total_exams,    cls: 'stat-blue'  },
              { label: 'Inscriptions', value: stats.total_enrollments, cls: 'stat-green' },
            ].map((s, i) => (
              <div key={i} className={`stat-card ${s.cls}`}>
                <div className="stat-label">{s.label}</div>
                <div className="stat-value">{s.value}</div>
              </div>
            ))}
          </div>
        )}

        {/* Classes */}
        <div className="section-header" style={{ marginBottom: 16 }}>
          <span className="section-title">Classes & Promotions</span>
          <button className="btn btn-primary" onClick={() => navigate('/classes')}>
            Gérer les classes →
          </button>
        </div>

        {classes.length === 0 ? (
          <div className="empty-state">
            <div className="icon">🎓</div>
            <h3>Aucune classe créée</h3>
            <p>Commencez par créer une classe pour organiser vos étudiants.</p>
            <button className="btn btn-primary" style={{ marginTop: 16 }}
              onClick={() => navigate('/classes')}>
              Créer la première classe
            </button>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 }}>
            {classes.map(c => (
              <ClassCard key={c.id} cls={c} onClick={() => navigate(`/classes/${c.id}`)} />
            ))}
          </div>
        )}

        {/* Utilisateurs récents */}
        {users.length > 0 && (
          <>
            <div className="section-header" style={{ marginTop: 32, marginBottom: 16 }}>
              <span className="section-title">Utilisateurs ({users.length})</span>
              <button className="btn btn-outline btn-sm" onClick={() => navigate('/admin')}>
                Gérer →
              </button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {users.slice(0, 5).map(u => (
                <div key={u.id} className="card">
                  <div className="card-body" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{
                      width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
                      background: u.role === 'teacher' ? '#dbeafe' : u.role === 'admin' ? '#ede9fe' : '#d1fae5',
                      color: u.role === 'teacher' ? 'var(--blue)' : u.role === 'admin' ? '#7c3aed' : 'var(--success)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontWeight: 700, fontSize: 13,
                    }}>
                      {u.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--navy)' }}>{u.name}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{u.email}</div>
                    </div>
                    <span style={{
                      fontSize: 11, padding: '2px 8px', borderRadius: 20, fontWeight: 600,
                      background: u.role === 'teacher' ? '#dbeafe' : u.role === 'admin' ? '#ede9fe' : '#d1fae5',
                      color: u.role === 'teacher' ? 'var(--blue)' : u.role === 'admin' ? '#7c3aed' : 'var(--success)',
                    }}>
                      {u.role === 'teacher' ? 'Enseignant' : u.role === 'admin' ? 'Admin' : 'Étudiant'}
                    </span>
                  </div>
                </div>
              ))}
              {users.length > 5 && (
                <button className="btn btn-outline btn-sm" style={{ alignSelf: 'center' }}
                  onClick={() => navigate('/admin')}>
                  Voir tous les {users.length} utilisateurs →
                </button>
              )}
            </div>
          </>
        )}
      </>
    )
  }

  // ── VUE ENSEIGNANT & ÉTUDIANT (identiques structurellement) ──
  return (
    <>
      <div className="section-header" style={{ marginBottom: 20 }}>
        <span className="section-title">
          {isTeacher ? 'Mes classes' : 'Mes classes'}
        </span>
      </div>

      {classes.length === 0 ? (
        <div className="empty-state">
          <div className="icon">🎓</div>
          <h3>{isTeacher ? 'Aucune classe assignée' : 'Aucune classe'}</h3>
          <p>
            {isTeacher
              ? "L'administrateur ne vous a pas encore assigné de classe."
              : "L'administrateur ne vous a pas encore inscrit dans une classe."}
          </p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 }}>
          {classes.map(c => (
            <ClassCard key={c.id} cls={c} onClick={() => navigate(`/classes/${c.id}`)} />
          ))}
        </div>
      )}
    </>
  )
}


/* ── Carte classe réutilisable ─────────────────── */
function ClassCard({ cls: c, onClick }) {
  const pct = Math.min(100, Math.round(c.student_count / c.max_students * 100))
  return (
    <div className="card" style={{ cursor: 'pointer' }} onClick={onClick}>
      <div className="card-body">
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 14 }}>
          <div style={{
            width: 44, height: 44, borderRadius: 12, flexShrink: 0,
            background: c.is_active ? '#eff6ff' : '#f1f5f9',
            color: c.is_active ? 'var(--blue)' : 'var(--text-muted)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20,
          }}>🎓</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--navy)',
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {c.name}
            </div>
            {c.code && (
              <span style={{ fontSize: 10, background: '#ede9fe', color: '#7c3aed',
                padding: '1px 7px', borderRadius: 10, fontWeight: 600 }}>
                {c.code}
              </span>
            )}
          </div>
        </div>

        {/* Infos */}
        <div style={{ fontSize: 12, color: 'var(--text-muted)', display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 14 }}>
          {c.level             && <span> {c.level}</span>}
          {c.academic_year_name && <span> {c.academic_year_name}</span>}
          {c.teacher_name      && <span> {c.teacher_name}</span>}
        </div>

        {/* Barre étudiants */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>
            <span>👥 {c.student_count} étudiants</span>
            <span>{pct}%</span>
          </div>
          <div style={{ height: 5, background: '#e2e8f0', borderRadius: 3, overflow: 'hidden' }}>
            <div style={{
              height: '100%', borderRadius: 3,
              background: pct > 90 ? '#ef4444' : 'var(--blue)',
              width: `${pct}%`,
            }} />
          </div>
        </div>

        <div style={{ marginTop: 14, fontSize: 13, color: 'var(--blue)', fontWeight: 500, textAlign: 'right' }}>
          Ouvrir →
        </div>
      </div>
    </div>
  )
}
