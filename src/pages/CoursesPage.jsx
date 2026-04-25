import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../api/client'
import useAuthStore from '../store/authStore'

/* ── Palette couleurs par catégorie ── */
const CAT_GRADIENTS = [
  ['#1e3a5f', '#0ea5e9'],
  ['#1a2e1a', '#22c55e'],
  ['#2e1a1a', '#ef4444'],
  ['#2e2a1a', '#f59e0b'],
  ['#1a1a2e', '#8b5cf6'],
  ['#1a2e2e', '#14b8a6'],
  ['#2e1a2e', '#ec4899'],
]

const catGradient = (name = '', id = 0) => {
  const idx = id % CAT_GRADIENTS.length
  return CAT_GRADIENTS[idx]
}

/* ── Icônes catégories ── */
const CAT_ICONS = {
  'mathématiques': '📐', 'maths': '📐', 'math': '📐',
  'informatique': '💻', 'info': '💻', 'programmation': '💻',
  'physique': '⚛️', 'chimie': '🧪', 'biologie': '🧬',
  'histoire': '📜', 'géographie': '🌍', 'littérature': '📖',
  'anglais': '🇬🇧', 'langue': '💬', 'technique': '⚙️',
  'maintenance': '🔧', 'electronique': '⚡', 'automatique': '🤖',
}
const getCatIcon = (name = '') => {
  const lower = name.toLowerCase()
  for (const [key, icon] of Object.entries(CAT_ICONS)) {
    if (lower.includes(key)) return icon
  }
  return '📚'
}

export default function CoursesPage({ myOnly }) {
  const navigate      = useNavigate()
  const { user }      = useAuthStore()
  const [courses,    setCourses]    = useState([])
  const [search,     setSearch]     = useState('')
  const [loading,    setLoading]    = useState(true)
  const [enrolling,  setEnrolling]  = useState(null)
  const [msg,        setMsg]        = useState({ text: '', type: '' })
  const [filterCat,  setFilterCat]  = useState('')
  const [viewMode,   setViewMode]   = useState('grid') // grid | list

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
      .catch(() => setLoading(false))
  }
  useEffect(load, [myOnly])

  const enroll = async (e, courseId) => {
    e.stopPropagation()
    setEnrolling(courseId)
    try {
      await api.post(`/courses/${courseId}/enroll`)
      flash('Inscription réussie !')
      load()
    } catch (err) {
      flash(err.response?.data?.detail || 'Erreur', 'error')
    } finally { setEnrolling(null) }
  }

  // Catégories uniques pour le filtre
  const categories = [...new Set(courses.map(c => c.category?.name).filter(Boolean))]

  const filtered = courses.filter(c => {
    const matchSearch = c.title.toLowerCase().includes(search.toLowerCase()) ||
      c.teacher_name?.toLowerCase().includes(search.toLowerCase())
    const matchCat = !filterCat || c.category?.name === filterCat
    return matchSearch && matchCat
  })

  return (
    <div style={{ fontFamily: "'Sora', 'DM Sans', sans-serif" }}>

      {/* ── Import fonts & Nouveaux Styles Captivants ── */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Sora:wght@400;500;600;700;800&family=DM+Sans:ital,wght@0,400;0,500;0,600;1,400&display=swap');

        /* Design moderne avec Glassmorphism et Ombre Bleutée */
        .course-card-new {
          background: rgba(255, 255, 255, 0.95);
          backdrop-filter: blur(10px);
          border-radius: 20px;
          overflow: hidden;
          border: 1px solid rgba(226, 232, 240, 0.8);
          cursor: pointer;
          transition: all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275); /* Effet rebond dynamique */
          position: relative;
          box-shadow: 0 10px 30px rgba(15, 31, 61, 0.04);
        }
        .course-card-new:hover {
          transform: translateY(-8px);
          box-shadow: 0 20px 40px rgba(59, 130, 246, 0.15);
          border-color: rgba(59, 130, 246, 0.4);
        }
        .course-card-new:hover .course-card-arrow {
          transform: translateX(6px);
          opacity: 1;
        }
        .course-card-arrow {
          transition: transform .3s ease, opacity .3s ease;
          opacity: .5;
        }
        
        /* Conteneur pour le zoom de l'image */
        .card-img-container {
          height: 170px;
          position: relative;
          overflow: hidden;
        }
        .card-img-bg {
          position: absolute;
          inset: 0;
          background-size: cover !important;
          background-position: center !important;
          transition: transform 0.6s ease;
        }
        .course-card-new:hover .card-img-bg {
          transform: scale(1.1); /* Zoom immersif au survol */
        }

        .filter-pill {
          padding: 6px 16px;
          border-radius: 20px;
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
          border: 1.5px solid;
          transition: all .15s ease;
          white-space: nowrap;
        }
        .filter-pill:hover {
          transform: scale(1.05);
        }
        .progress-bar-fill {
          height: 100%;
          border-radius: 4px;
          transition: width .6s cubic-bezier(.34,1.56,.64,1);
        }
        .view-btn {
          width: 36px; height: 36px;
          border-radius: 10px;
          border: 1.5px solid #e2e8f0;
          background: white;
          cursor: pointer;
          display: flex; align-items: center; justify-content: center;
          font-size: 16px;
          transition: all .15s;
        }
        .view-btn.active {
          background: var(--navy, #1e3a6e);
          border-color: var(--navy, #1e3a6e);
          color: white;
        }
        .enroll-btn {
          font-size: 12px; font-weight: 700;
          padding: 7px 16px; border-radius: 10px;
          border: none; cursor: pointer;
          transition: all .15s ease;
          letter-spacing: .2px;
        }
        .enroll-btn:hover { transform: scale(1.04); box-shadow: 0 4px 12px rgba(59, 130, 246, 0.3); }
      `}</style>

      {/* ── En-tête hero ── */}
      <div style={{
        background: 'linear-gradient(135deg, #0f1f3d 0%, #1a3a6e 50%, #0f2d4a 100%)',
        borderRadius: 20, padding: '32px 36px', marginBottom: 32, color: '#fff',
        position: 'relative', overflow: 'hidden',
        boxShadow: '0 20px 40px rgba(15, 31, 61, 0.2)'
      }}>
        {/* Motif décoratif */}
        <div style={{ position: 'absolute', right: -20, top: -20, width: 200, height: 200, borderRadius: '50%', background: 'rgba(255,255,255,.03)', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', right: 60, bottom: -40, width: 140, height: 140, borderRadius: '50%', background: 'rgba(59,130,246,.08)', pointerEvents: 'none' }} />

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16, position: 'relative' }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#60a5fa', letterSpacing: 2, textTransform: 'uppercase', marginBottom: 8 }}>
              UniLearn · Université de Ngaoundéré
            </div>
            <h1 style={{ fontFamily: "'Sora', serif", fontSize: 26, fontWeight: 800, margin: '0 0 8px', letterSpacing: -.3 }}>
              {myOnly
                ? isTeacher ? '📖 Mes cours' : '🎓 Mon parcours'
                : '🌟 Catalogue des cours'}
            </h1>
            <p style={{ opacity: .6, fontSize: 13, margin: 0 }}>
              {filtered.length} cours disponible{filtered.length !== 1 ? 's' : ''}
              {filterCat && ` · ${filterCat}`}
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {isTeacher && (
              <button onClick={() => navigate('/teacher')} style={{
                background: '#3b82f6', border: 'none', borderRadius: 12,
                padding: '10px 20px', color: '#fff', fontWeight: 700, cursor: 'pointer', fontSize: 13,
                transition: 'all 0.2s', boxShadow: '0 4px 12px rgba(59, 130, 246, 0.4)'
              }} onMouseOver={e => e.currentTarget.style.transform = 'scale(1.05)'} onMouseOut={e => e.currentTarget.style.transform = 'scale(1)'}>
                + Créer un cours
              </button>
            )}
          </div>
        </div>

        {/* Stats inline */}
        <div style={{ display: 'flex', gap: 24, marginTop: 20, flexWrap: 'wrap' }}>
          {[
            { v: courses.length,                                         l: 'Cours total' },
            { v: courses.filter(c => c.enrolled).length,                 l: 'Inscrits' },
            { v: courses.filter(c => (c.progress_pct || 0) === 100).length, l: 'Terminés' },
            { v: categories.length,                                      l: 'Catégories' },
          ].map((s, i) => (
            <div key={i}>
              <div style={{ fontSize: 20, fontWeight: 800, color: '#fff' }}>{s.v}</div>
              <div style={{ fontSize: 11, opacity: .5, marginTop: 1 }}>{s.l}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Message flash ── */}
      {msg.text && (
        <div style={{
          padding: '12px 18px', borderRadius: 12, marginBottom: 20,
          background: msg.type === 'error' ? '#fef2f2' : '#f0fdf4',
          border: `1px solid ${msg.type === 'error' ? '#fecaca' : '#bbf7d0'}`,
          color: msg.type === 'error' ? '#dc2626' : '#16a34a',
          fontWeight: 600, fontSize: 14,
        }}>{msg.text}</div>
      )}

      {/* ── Barre de recherche + filtres ── */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 24, alignItems: 'center' }}>
        {/* Recherche */}
        <div style={{ flex: '1 1 260px', position: 'relative' }}>
          <span style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', fontSize: 16, pointerEvents: 'none' }}>🔍</span>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Rechercher un cours, enseignant..."
            style={{
              width: '100%', padding: '11px 14px 11px 42px',
              borderRadius: 12, border: '1.5px solid #e2e8f0',
              fontSize: 13, outline: 'none', background: 'white',
              boxSizing: 'border-box',
              fontFamily: "'Sora', sans-serif",
              transition: 'all 0.2s'
            }}
            onFocus={e => e.currentTarget.style.borderColor = '#3b82f6'}
            onBlur={e => e.currentTarget.style.borderColor = '#e2e8f0'}
          />
          {search && (
            <button onClick={() => setSearch('')} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, color: '#94a3b8' }}>×</button>
          )}
        </div>

        {/* Filtres catégories */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', flex: '0 1 auto' }}>
          <button
            className="filter-pill"
            onClick={() => setFilterCat('')}
            style={{
              background: !filterCat ? 'var(--navy, #1e3a6e)' : 'white',
              color: !filterCat ? 'white' : '#64748b',
              borderColor: !filterCat ? 'var(--navy, #1e3a6e)' : '#e2e8f0',
            }}
          >Tous</button>
          {categories.map(cat => (
            <button key={cat}
              className="filter-pill"
              onClick={() => setFilterCat(cat === filterCat ? '' : cat)}
              style={{
                background: filterCat === cat ? '#3b82f6' : 'white',
                color: filterCat === cat ? 'white' : '#64748b',
                borderColor: filterCat === cat ? '#3b82f6' : '#e2e8f0',
              }}
            >{getCatIcon(cat)} {cat}</button>
          ))}
        </div>

        {/* Mode vue */}
        <div style={{ display: 'flex', gap: 4 }}>
          <button className={`view-btn ${viewMode === 'grid' ? 'active' : ''}`} onClick={() => setViewMode('grid')}>⊞</button>
          <button className={`view-btn ${viewMode === 'list' ? 'active' : ''}`} onClick={() => setViewMode('list')}>☰</button>
        </div>
      </div>

      {/* ── Contenu ── */}
      {loading ? (
        <div className="loading-overlay"><div className="spinner" /></div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 20px' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🔎</div>
          <h3 style={{ color: '#1e3a6e', fontFamily: "'Sora', sans-serif", marginBottom: 8 }}>
            {search ? 'Aucun cours trouvé' : 'Aucun cours disponible'}
          </h3>
          <p style={{ color: '#94a3b8', fontSize: 14 }}>
            {search ? 'Essayez un autre terme de recherche.' : 'Revenez plus tard.'}
          </p>
        </div>
      ) : viewMode === 'grid' ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 24 }}>
          {filtered.map((c, idx) => (
            <CourseCardNew
              key={c.id}
              course={c}
              idx={idx}
              isStudent={isStudent}
              isTeacher={isTeacher}
              isAdmin={isAdmin}
              myOnly={myOnly}
              enrolling={enrolling}
              onEnroll={enroll}
              onClick={() => navigate(`/courses/${c.id}`)}
            />
          ))}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {filtered.map((c, idx) => (
            <CourseListRow
              key={c.id}
              course={c}
              idx={idx}
              isStudent={isStudent}
              isTeacher={isTeacher}
              isAdmin={isAdmin}
              myOnly={myOnly}
              enrolling={enrolling}
              onEnroll={enroll}
              onClick={() => navigate(`/courses/${c.id}`)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

/* ════════════════════════════════════════════════
   CARTE COURS — VUE GRILLE
════════════════════════════════════════════════ */
function CourseCardNew({ course: c, idx, isStudent, isTeacher, isAdmin, myOnly, enrolling, onEnroll, onClick }) {
  const [gradient] = useState(() => catGradient(c.category?.name, c.category_id || idx))
  const icon = getCatIcon(c.category?.name || '')
  const pct  = Math.round(c.progress_pct || 0)

  return (
    <div className="course-card-new" onClick={onClick} style={{ animationDelay: `${idx * 40}ms` }}>

      {/* ── Thumbnail / Banner avec effet de zoom ── */}
      <div className="card-img-container">
        <div className="card-img-bg" style={{
          background: c.thumbnail
            ? `url(${c.thumbnail})`
            : `linear-gradient(135deg, ${gradient[0]} 0%, ${gradient[1]} 100%)`,
        }} />
        
        {/* Overlay dégradé */}
        {!c.thumbnail && (
          <div style={{
            position: 'absolute', inset: 0,
            backgroundImage: `radial-gradient(circle at 30% 50%, rgba(255,255,255,.07) 0%, transparent 60%)`,
          }} />
        )}
        {c.thumbnail && (
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(0,0,0,0.6) 0%, transparent 50%)' }} />
        )}

        {/* Icône catégorie */}
        <div style={{
          position: 'absolute', top: 14, left: 14,
          width: 42, height: 42, borderRadius: 12,
          background: 'rgba(255,255,255,.2)',
          backdropFilter: 'blur(10px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 20, border: '1px solid rgba(255,255,255,.3)',
          boxShadow: '0 4px 10px rgba(0,0,0,0.1)'
        }}>{icon}</div>

        {/* Badge catégorie */}
        {c.category?.name && (
          <div style={{
            position: 'absolute', top: 14, right: 14,
            background: 'rgba(0,0,0,.5)', backdropFilter: 'blur(8px)',
            color: '#fff', fontSize: 10, fontWeight: 700,
            padding: '4px 12px', borderRadius: 20,
            border: '1px solid rgba(255,255,255,.2)',
            letterSpacing: .5, textTransform: 'uppercase',
            boxShadow: '0 4px 10px rgba(0,0,0,0.1)'
          }}>{c.category.name}</div>
        )}

        {/* Badge statut étudiant */}
        {isStudent && c.enrolled && (
          <div style={{
            position: 'absolute', bottom: 14, right: 14,
            background: '#22c55e', color: '#fff',
            fontSize: 10, fontWeight: 800, padding: '4px 12px', borderRadius: 20,
            letterSpacing: .5, boxShadow: '0 4px 10px rgba(34, 197, 94, 0.4)'
          }}>✓ INSCRIT</div>
        )}

        {/* Badge publié/brouillon (enseignant/admin) */}
        {(isTeacher || isAdmin) && (
          <div style={{
            position: 'absolute', bottom: 14, right: 14,
            background: c.is_published ? 'rgba(34,197,94,.9)' : 'rgba(245,158,11,.9)',
            color: '#fff', fontSize: 10, fontWeight: 800,
            padding: '4px 12px', borderRadius: 20, letterSpacing: .5,
            boxShadow: '0 4px 10px rgba(0,0,0,0.2)'
          }}>{c.is_published ? 'PUBLIÉ' : 'BROUILLON'}</div>
        )}

        {/* Barre de progression étudiants */}
        {isStudent && c.enrolled && pct > 0 && (
          <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 4, background: 'rgba(255,255,255,.3)' }}>
            <div className="progress-bar-fill" style={{ width: `${pct}%`, background: pct === 100 ? '#22c55e' : '#3b82f6' }} />
          </div>
        )}
      </div>

      {/* ── Contenu texte ── */}
      <div style={{ padding: '20px' }}>
        <h3 style={{
          fontFamily: "'Sora', sans-serif", fontSize: 15, fontWeight: 700,
          color: '#0f1f3d', margin: '0 0 8px', lineHeight: 1.4,
          display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
        }}>{c.title}</h3>

        {c.description && (
          <p style={{
            fontSize: 12, color: '#64748b', margin: '0 0 16px', lineHeight: 1.6,
            display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
          }}>{c.description}</p>
        )}

        {/* Méta */}
        <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap', paddingBottom: 16, borderBottom: '1px solid #f1f5f9' }}>
          <span style={{ fontSize: 11, color: '#64748b', display: 'flex', alignItems: 'center', gap: 4, fontWeight: 500 }}>
            👨‍🏫 {c.teacher_name || 'Non assigné'}
          </span>
          <span style={{ fontSize: 11, color: '#64748b', display: 'flex', alignItems: 'center', gap: 4, fontWeight: 500 }}>
            📖 {c.lesson_count || 0} leçon{(c.lesson_count || 0) > 1 ? 's' : ''}
          </span>
          {c.student_count > 0 && (
            <span style={{ fontSize: 11, color: '#64748b', display: 'flex', alignItems: 'center', gap: 4, fontWeight: 500 }}>
              👥 {c.student_count}
            </span>
          )}
        </div>

        {/* Progression ou action */}
        {isStudent && c.enrolled ? (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>Progression</span>
              <span style={{ fontSize: 11, fontWeight: 800, color: pct === 100 ? '#22c55e' : '#3b82f6' }}>{pct}%</span>
            </div>
            <div style={{ height: 6, background: '#f1f5f9', borderRadius: 4, overflow: 'hidden' }}>
              <div className="progress-bar-fill" style={{ width: `${pct}%`, background: pct === 100 ? '#22c55e' : `linear-gradient(90deg, #3b82f6, #6366f1)` }} />
            </div>
            {pct === 100 && (
              <div style={{ fontSize: 11, color: '#22c55e', fontWeight: 700, marginTop: 8, textAlign: 'center' }}>🎉 Cours terminé !</div>
            )}
          </div>
        ) : isStudent && !c.enrolled ? (
          <button
            className="enroll-btn"
            style={{ width: '100%', background: 'linear-gradient(135deg, #3b82f6, #6366f1)', color: '#fff' }}
            onClick={e => onEnroll(e, c.id)}
            disabled={enrolling === c.id}
          >
            {enrolling === c.id ? '⏳ Inscription...' : "S'inscrire →"}
          </button>
        ) : (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 2 }}>
            <span style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600 }}>
              {isAdmin ? '⚙️ Espace Admin' : isTeacher ? '✏️ Gestion du cours' : ''}
            </span>
            <span className="course-card-arrow" style={{ fontSize: 14, color: '#3b82f6', fontWeight: 800 }}>
              Voir →
            </span>
          </div>
        )}
      </div>
    </div>
  )
}

/* ════════════════════════════════════════════════
   COURS — VUE LISTE
════════════════════════════════════════════════ */
function CourseListRow({ course: c, idx, isStudent, isTeacher, isAdmin, myOnly, enrolling, onEnroll, onClick }) {
  const [gradient] = useState(() => catGradient(c.category?.name, c.category_id || idx))
  const icon = getCatIcon(c.category?.name || '')
  const pct  = Math.round(c.progress_pct || 0)

  return (
    <div onClick={onClick} style={{
      background: 'white', borderRadius: 16, border: '1px solid #e8ecf4',
      padding: '16px 20px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 20,
      transition: 'all .2s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
    }}
      onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 10px 25px rgba(59, 130, 246, 0.1)'; e.currentTarget.style.transform = 'translateX(4px)' }}
      onMouseLeave={e => { e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.transform = 'none' }}
    >
      {/* Thumbnail mini */}
      <div style={{
        width: 64, height: 64, borderRadius: 14, flexShrink: 0,
        background: c.thumbnail
          ? `url(${c.thumbnail}) center/cover no-repeat`
          : `linear-gradient(135deg, ${gradient[0]}, ${gradient[1]})`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 24, boxShadow: '0 4px 10px rgba(0,0,0,0.05)'
      }}>
        {!c.thumbnail && icon}
      </div>

      {/* Infos */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: "'Sora', sans-serif", fontWeight: 700, fontSize: 15, color: '#0f1f3d', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {c.title}
        </div>
        <div style={{ fontSize: 12, color: '#64748b', marginTop: 4, fontWeight: 500 }}>
          {c.teacher_name} <span style={{opacity: 0.5}}>•</span> {c.lesson_count || 0} leçon(s)
          {c.category?.name && <> <span style={{opacity: 0.5}}>•</span> {c.category.name}</>}
        </div>
        {isStudent && c.enrolled && pct > 0 && (
          <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ flex: 1, height: 6, background: '#f1f5f9', borderRadius: 4, overflow: 'hidden' }}>
              <div style={{ width: `${pct}%`, height: '100%', background: pct === 100 ? '#22c55e' : 'linear-gradient(90deg, #3b82f6, #6366f1)', borderRadius: 4 }} />
            </div>
            <span style={{ fontSize: 11, fontWeight: 800, color: pct === 100 ? '#22c55e' : '#3b82f6' }}>{pct}%</span>
          </div>
        )}
      </div>

      {/* Badge */}
      <div style={{ flexShrink: 0 }}>
        {isStudent && c.enrolled
          ? <span style={{ fontSize: 11, background: '#d1fae5', color: '#16a34a', padding: '6px 14px', borderRadius: 20, fontWeight: 800, boxShadow: '0 4px 10px rgba(34, 197, 94, 0.2)' }}>Inscrit ✓</span>
          : isStudent && !c.enrolled
          ? <button className="enroll-btn" style={{ background: '#3b82f6', color: '#fff', padding: '8px 18px', borderRadius: 12 }} onClick={e => onEnroll(e, c.id)} disabled={enrolling === c.id}>
              {enrolling === c.id ? '...' : "S'inscrire"}
            </button>
          : <div style={{ width: 36, height: 36, borderRadius: '50%', background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#3b82f6', fontWeight: 800 }}>→</div>
        }
      </div>
    </div>
  )
}
