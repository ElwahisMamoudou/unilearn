import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../api/client'
import CourseCard from '../components/CourseCard'
import useAuthStore from '../store/authStore'

export default function CoursesPage({ myOnly }) {
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const [courses, setCourses]     = useState([])
  const [search, setSearch]       = useState('')
  const [loading, setLoading]     = useState(true)
  const [enrolling, setEnrolling] = useState(null)
  const [msg, setMsg]             = useState({ text: '', type: '' })

  const isStudent = user?.role === 'student'
  const isTeacher = user?.role === 'teacher'
  const isAdmin   = user?.role === 'admin'

  const flash = (text, type = 'success') => {
    setMsg({ text, type })
    setTimeout(() => setMsg({ text: '', type: '' }), 3000)
  }

  const load = () => {
    setLoading(true)
    api.get(myOnly ? '/courses/my' : '/courses')
      .then(r => { setCourses(r.data); setLoading(false) })
  }
  useEffect(load, [myOnly])

  const enroll = async (e, courseId) => {
    e.stopPropagation()
    setEnrolling(courseId)
    try {
      await api.post(`/courses/${courseId}/enroll`)
      flash('Inscription reussie')
      load()
    } catch (err) {
      flash(err.response?.data?.detail || 'Erreur', 'error')
    } finally { setEnrolling(null) }
  }

  const filtered = courses.filter(c =>
    c.title.toLowerCase().includes(search.toLowerCase()) ||
    c.teacher_name?.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <>
      <div className="section-header">
        <span className="section-title">
          {myOnly
            ? isTeacher ? 'Mes cours crees' : 'Mes cours inscrits'
            : 'Catalogue des cours'}
        </span>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>{filtered.length} cours</span>
          {isTeacher && (
            <button className="btn btn-primary btn-sm" onClick={() => navigate('/teacher')}>
              Creer un cours
            </button>
          )}
        </div>
      </div>

      {msg.text && (
        <div className={`alert alert-${msg.type === 'error' ? 'error' : 'success'}`}>{msg.text}</div>
      )}

      <div className="search-bar" style={{ marginBottom: 24 }}>
        <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>Recherche</span>
        <input
          placeholder="Rechercher un cours ou un enseignant..."
          value={search} onChange={e => setSearch(e.target.value)} />
        {search && (
          <button style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
            onClick={() => setSearch('')}>Effacer</button>
        )}
      </div>

      {loading ? (
        <div className="loading-overlay"><div className="spinner" /></div>
      ) : filtered.length === 0 ? (
        <div className="empty-state">
          <h3>{search ? 'Aucun cours trouve' : 'Aucun cours disponible'}</h3>
          <p>{search ? 'Essayez un autre terme' : isTeacher ? 'Creez votre premier cours' : 'Revenez plus tard.'}</p>
          {isTeacher && !search && (
            <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={() => navigate('/teacher')}>
              Creer un cours
            </button>
          )}
        </div>
      ) : (
        <div className="course-grid">
          {filtered.map(c => (
            <div key={c.id} style={{ position: 'relative' }}>
              <CourseCard course={c} onClick={() => navigate(`/courses/${c.id}`)} />

              {isStudent && !c.enrolled && !myOnly && (
                <button className="btn btn-primary btn-sm"
                  style={{ position: 'absolute', bottom: 16, right: 16 }}
                  onClick={e => enroll(e, c.id)} disabled={enrolling === c.id}>
                  {enrolling === c.id ? 'Inscription...' : "S'inscrire"}
                </button>
              )}
              {isStudent && c.enrolled && (
                <span style={{
                  position: 'absolute', bottom: 16, right: 16,
                  background: '#d1fae5', color: 'var(--success)',
                  fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20,
                }}>Inscrit</span>
              )}
              {isTeacher && (
                <span style={{
                  position: 'absolute', bottom: 16, right: 16,
                  background: '#dbeafe', color: 'var(--blue)',
                  fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20,
                }}>Mon cours</span>
              )}
              {isAdmin && (
                <span style={{
                  position: 'absolute', bottom: 16, right: 16,
                  background: '#ede9fe', color: '#7c3aed',
                  fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20,
                }}>Admin</span>
              )}
            </div>
          ))}
        </div>
      )}
    </>
  )
}
