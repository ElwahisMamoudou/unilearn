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
const catGradient = (name = '', id = 0) => CAT_GRADIENTS[id % CAT_GRADIENTS.length]

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

/* ── Visionneuse PDF ── */
function PdfViewer({ url, title, onClose }) {
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(6px)',
      display: 'flex', flexDirection: 'column',
    }} onClick={onClose}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '12px 20px', background: '#0f1f3d', flexShrink: 0,
      }} onClick={e => e.stopPropagation()}>
        <span style={{ color: '#fff', fontWeight: 700, fontSize: 15, display: 'flex', alignItems: 'center', gap: 8 }}>
          📄 {title}
        </span>
        <div style={{ display: 'flex', gap: 10 }}>
          <a href={url} target="_blank" rel="noopener noreferrer" style={{
            background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 8,
            padding: '7px 16px', fontWeight: 700, fontSize: 13, cursor: 'pointer',
            textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 6,
          }}>⬇ Télécharger</a>
          <button onClick={onClose} style={{
            background: 'rgba(255,255,255,.15)', color: '#fff', border: 'none',
            borderRadius: 8, padding: '7px 14px', fontWeight: 700, cursor: 'pointer', fontSize: 16,
          }}>✕</button>
        </div>
      </div>
      <div style={{ flex: 1, overflow: 'hidden' }} onClick={e => e.stopPropagation()}>
        <iframe
          src={url}
          title={title}
          style={{ width: '100%', height: '100%', border: 'none' }}
        />
      </div>
    </div>
  )
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
  const [viewMode,   setViewMode]   = useState('grid')
  const [pdfViewer,  setPdfViewer]  = useState(null) // { url, title }

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

  const openPdf = (e, url, title) => {
    e.stopPropagation()
    setPdfViewer({ url, title })
  }

  const categories = [...new Set(courses.map(c => c.category?.name).filter(Boolean))]

  const filtered = courses.filter(c => {
    const matchSearch = c.title.toLowerCase().includes(search.toLowerCase()) ||
      c.teacher_name?.toLowerCase().includes(search.toLowerCase())
    const matchCat = !filterCat || c.category?.name === filterCat
    return matchSearch && matchCat
  })

  return (
    <div style={{ fontFamily: "'Sora', 'DM Sans', sans-serif" }}>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Sora:wght@400;500;600;700;800&family=DM+Sans:ital,wght@0,400;0,500;0,600;1,400&display=swap');

        /* ── Grande carte cours ── */
        .course-card-xl {
          background: #fff;
          border-radius: 22px;
          overflow: hidden;
          border: 1px solid rgba(226, 232, 240, 0.8);
          cursor: pointer;
          transition: all 0.38s cubic-bezier(0.175, 0.885, 0.32, 1.275);
          position: relative;
          box-shadow: 0 6px 24px rgba(15, 31, 61, 0.06);
          display: flex;
          flex-direction: column;
        }
        .course-card-xl:hover {
          transform: translateY(-10px);
          box-shadow: 0 24px 48px rgba(59, 130, 246, 0.18);
          border-color: rgba(59, 130, 246, 0.35);
        }
        .course-card-xl:hover .card-img-zoom {
          transform: scale(1.08);
        }
        .course-card-xl:hover .card-cta-arrow {
          transform: translateX(5px);
          opacity: 1;
        }
        .card-cta-arrow { transition: transform .3s, opacity .3s; opacity: .45; }

        /* ── Zone image grande ── */
        .card-img-xl {
          height: 220px;
          position: relative;
          overflow: hidden;
          flex-shrink: 0;
        }
        .card-img-zoom {
          position: absolute;
          inset: 0;
          background-size: cover !important;
          background-position: center !important;
          transition: transform 0.55s ease;
        }

        /* ── Filtres ── */
        .filter-pill {
          padding: 7px 18px; border-radius: 22px;
          font-size: 12px; font-weight: 700;
          cursor: pointer; border: 1.5px solid;
          transition: all .15s ease; white-space: nowrap;
          font-family: 'Sora', sans-serif;
        }
        .filter-pill:hover { transform: scale(1.05); }

        /* ── Barre progression ── */
        .progress-bar-fill {
          height: 100%; border-radius: 4px;
          transition: width .6s cubic-bezier(.34,1.56,.64,1);
        }

        /* ── Boutons vue ── */
        .view-btn {
          width: 36px; height: 36px; border-radius: 10px;
          border: 1.5px solid #e2e8f0; background: white;
          cursor: pointer; display: flex; align-items: center; justify-content: center;
          font-size: 16px; transition: all .15s;
        }
        .view-btn.active { background: #1e3a6e; border-color: #1e3a6e; color: white; }

        /* ── Btn inscription ── */
        .enroll-btn {
          font-size: 13px; font-weight: 700;
          padding: 9px 20px; border-radius: 12px;
          border: none; cursor: pointer;
          transition: all .18s ease; letter-spacing: .2px;
        }
        .enroll-btn:hover { transform: scale(1.04); box-shadow: 0 6px 16px rgba(59,130,246,.3); }

        /* ── Btn PDF ── */
        .pdf-btn {
          display: inline-flex; align-items: center; gap: 5px;
          font-size: 11px; font-weight: 700; padding: 5px 12px;
          border-radius: 8px; border: 1.5px solid #e2e8f0;
          background: white; cursor: pointer; color: #ef4444;
          transition: all .15s;
        }
        .pdf-btn:hover { background: #fef2f2; border-color: #fca5a5; transform: scale(1.03); }

        /* ── Vue liste ── */
        .course-list-row {
          background: white; border-radius: 18px;
          border: 1px solid #e8ecf4; padding: 16px 20px;
          cursor: pointer; display: flex; align-items: center; gap: 18px;
          transition: all .22s cubic-bezier(0.175, 0.885, 0.32, 1.275);
          box-shadow: 0 2px 8px rgba(15,31,61,.04);
        }
        .course-list-row:hover {
          box-shadow: 0 10px 28px rgba(59,130,246,.12);
          transform: translateX(5px);
          border-color: rgba(59,130,246,.3);
        }
      `}</style>

      {/* ── Visionneuse PDF ── */}
      {pdfViewer && (
        <PdfViewer
          url={pdfViewer.url}
          title={pdfViewer.title}
          onClose={() => setPdfViewer(null)}
        />
      )}

      {/* ── Hero ── */}
      <div style={{
        background: 'linear-gradient(135deg, #0f1f3d 0%, #1a3a6e 50%, #0f2d4a 100%)',
        borderRadius: 22, padding: '32px 36px', marginBottom: 32, color: '#fff',
        position: 'relative', overflow: 'hidden',
        boxShadow: '0 20px 40px rgba(15,31,61,.22)',
      }}>
        <div style={{ position: 'absolute', right: -20, top: -20, width: 220, height: 220, borderRadius: '50%', background: 'rgba(255,255,255,.03)', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', right: 60, bottom: -50, width: 160, height: 160, borderRadius: '50%', background: 'rgba(59,130,246,.07)', pointerEvents: 'none' }} />

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16, position: 'relative' }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#60a5fa', letterSpacing: 2, textTransform: 'uppercase', marginBottom: 8 }}>
              UniLearn · Université de Ngaoundéré
            </div>
            <h1 style={{ fontFamily: "'Sora', serif", fontSize: 26, fontWeight: 800, margin: '0 0 8px', letterSpacing: -.3 }}>
              {myOnly ? (isTeacher ? '📖 Mes cours' : '🎓 Mon parcours') : '🌟 Catalogue des cours'}
            </h1>
            <p style={{ opacity: .6, fontSize: 13, margin: 0 }}>
              {filtered.length} cours disponible{filtered.length !== 1 ? 's' : ''}
              {filterCat && ` · ${filterCat}`}
            </p>
          </div>
          {isTeacher && (
            <button onClick={() => navigate('/teacher')} style={{
              background: '#3b82f6', border: 'none', borderRadius: 12,
              padding: '10px 22px', color: '#fff', fontWeight: 700, cursor: 'pointer', fontSize: 13,
              boxShadow: '0 4px 14px rgba(59,130,246,.4)',
            }}>+ Créer un cours</button>
          )}
        </div>

        <div style={{ display: 'flex', gap: 28, marginTop: 20, flexWrap: 'wrap' }}>
          {[
            { v: courses.length,                                            l: 'Cours total' },
            { v: courses.filter(c => c.enrolled).length,                    l: 'Inscrits' },
            { v: courses.filter(c => (c.progress_pct || 0) === 100).length, l: 'Terminés' },
            { v: categories.length,                                         l: 'Catégories' },
          ].map((s, i) => (
            <div key={i}>
              <div style={{ fontSize: 22, fontWeight: 800 }}>{s.v}</div>
              <div style={{ fontSize: 11, opacity: .5, marginTop: 1 }}>{s.l}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Flash ── */}
      {msg.text && (
        <div style={{
          padding: '12px 18px', borderRadius: 12, marginBottom: 20,
          background: msg.type === 'error' ? '#fef2f2' : '#f0fdf4',
          border: `1px solid ${msg.type === 'error' ? '#fecaca' : '#bbf7d0'}`,
          color: msg.type === 'error' ? '#dc2626' : '#16a34a',
          fontWeight: 600, fontSize: 14,
        }}>{msg.text}</div>
      )}

      {/* ── Barre recherche + filtres ── */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 28, alignItems: 'center' }}>
        <div style={{ flex: '1 1 260px', position: 'relative' }}>
          <span style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', fontSize: 16, pointerEvents: 'none' }}>🔍</span>
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Rechercher un cours, enseignant..."
            style={{
              width: '100%', padding: '11px 14px 11px 42px',
              borderRadius: 12, border: '1.5px solid #e2e8f0',
              fontSize: 13, outline: 'none', background: 'white',
              boxSizing: 'border-box', fontFamily: "'Sora', sans-serif",
              transition: 'border-color .2s',
            }}
            onFocus={e => e.currentTarget.style.borderColor = '#3b82f6'}
            onBlur={e => e.currentTarget.style.borderColor = '#e2e8f0'}
          />
          {search && (
            <button onClick={() => setSearch('')} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: '#94a3b8' }}>×</button>
          )}
        </div>

        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <button className="filter-pill" onClick={() => setFilterCat('')} style={{
            background: !filterCat ? '#1e3a6e' : 'white',
            color: !filterCat ? 'white' : '#64748b',
            borderColor: !filterCat ? '#1e3a6e' : '#e2e8f0',
          }}>Tous</button>
          {categories.map(cat => (
            <button key={cat} className="filter-pill"
              onClick={() => setFilterCat(cat === filterCat ? '' : cat)}
              style={{
                background: filterCat === cat ? '#3b82f6' : 'white',
                color: filterCat === cat ? 'white' : '#64748b',
                borderColor: filterCat === cat ? '#3b82f6' : '#e2e8f0',
              }}
            >{getCatIcon(cat)} {cat}</button>
          ))}
        </div>

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
          <div style={{ fontSize: 52, marginBottom: 16 }}>🔎</div>
          <h3 style={{ color: '#1e3a6e', fontFamily: "'Sora', sans-serif", marginBottom: 8 }}>
            {search ? 'Aucun cours trouvé' : 'Aucun cours disponible'}
          </h3>
          <p style={{ color: '#94a3b8', fontSize: 14 }}>
            {search ? 'Essayez un autre terme.' : 'Revenez plus tard.'}
          </p>
        </div>
      ) : viewMode === 'grid' ? (
        /* ── GRANDE GRILLE ── */
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))',
          gap: 28,
        }}>
          {filtered.map((c, idx) => (
            <CourseCardXL
              key={c.id}
              course={c}
              idx={idx}
              isStudent={isStudent}
              isTeacher={isTeacher}
              isAdmin={isAdmin}
              myOnly={myOnly}
              enrolling={enrolling}
              onEnroll={enroll}
              onOpenPdf={openPdf}
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
              onOpenPdf={openPdf}
              onClick={() => navigate(`/courses/${c.id}`)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

/* ══════════════════════════════════════════════
   GRANDE CARTE COURS (grille)
══════════════════════════════════════════════ */
function CourseCardXL({ course: c, idx, isStudent, isTeacher, isAdmin, enrolling, onEnroll, onOpenPdf, onClick }) {
  const [gradient] = useState(() => catGradient(c.category?.name, c.category_id || idx))
  const icon = getCatIcon(c.category?.name || '')
  const pct  = Math.round(c.progress_pct || 0)

  /* PDF lessons — on attend que le course detail charge les leçons */
  const pdfLessons = (c.lessons || []).filter(l => l.file_url && l.file_url.toLowerCase().endsWith('.pdf'))

  return (
    <div className="course-card-xl" onClick={onClick}>

      {/* ══ IMAGE GRANDE (220px) ══ */}
      <div className="card-img-xl">
        <div className="card-img-zoom" style={{
          background: c.thumbnail
            ? `url(${c.thumbnail})`
            : `linear-gradient(145deg, ${gradient[0]} 0%, ${gradient[1]} 100%)`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        }} />

        {/* Overlay léger pour lisibilité texte */}
        <div style={{
          position: 'absolute', inset: 0,
          background: c.thumbnail
            ? 'linear-gradient(to top, rgba(0,0,0,.65) 0%, rgba(0,0,0,.1) 55%, transparent 100%)'
            : 'radial-gradient(circle at 25% 40%, rgba(255,255,255,.08) 0%, transparent 65%)',
        }} />

        {/* Grande icône catégorie centrée si pas de thumbnail */}
        {!c.thumbnail && (
          <div style={{
            position: 'absolute', inset: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 64, filter: 'drop-shadow(0 4px 12px rgba(0,0,0,.3))',
            userSelect: 'none',
          }}>{icon}</div>
        )}

        {/* Badge catégorie — haut gauche */}
        {c.category?.name && (
          <div style={{
            position: 'absolute', top: 14, left: 14,
            background: 'rgba(0,0,0,.48)', backdropFilter: 'blur(10px)',
            color: '#fff', fontSize: 11, fontWeight: 700,
            padding: '5px 13px', borderRadius: 22,
            border: '1px solid rgba(255,255,255,.18)',
            letterSpacing: .5, textTransform: 'uppercase',
          }}>{getCatIcon(c.category.name)} {c.category.name}</div>
        )}

        {/* Badge publié / brouillon — haut droit */}
        {(isTeacher || isAdmin) && (
          <div style={{
            position: 'absolute', top: 14, right: 14,
            background: c.is_published ? 'rgba(34,197,94,.88)' : 'rgba(245,158,11,.88)',
            color: '#fff', fontSize: 10, fontWeight: 800,
            padding: '5px 13px', borderRadius: 22,
            boxShadow: '0 4px 12px rgba(0,0,0,.2)',
          }}>{c.is_published ? '✓ PUBLIÉ' : '✏ BROUILLON'}</div>
        )}

        {/* Badge inscrit étudiant — haut droit */}
        {isStudent && c.enrolled && (
          <div style={{
            position: 'absolute', top: 14, right: 14,
            background: 'rgba(34,197,94,.9)', color: '#fff',
            fontSize: 10, fontWeight: 800, padding: '5px 13px', borderRadius: 22,
            boxShadow: '0 4px 12px rgba(34,197,94,.4)',
          }}>✓ INSCRIT</div>
        )}

        {/* Titre en bas de l'image (si thumbnail) */}
        {c.thumbnail && (
          <div style={{
            position: 'absolute', bottom: 0, left: 0, right: 0,
            padding: '16px 18px 12px',
          }}>
            <div style={{
              fontFamily: "'Sora', sans-serif", fontSize: 16, fontWeight: 800,
              color: '#fff', lineHeight: 1.3,
              textShadow: '0 2px 8px rgba(0,0,0,.5)',
              display: '-webkit-box', WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical', overflow: 'hidden',
            }}>{c.title}</div>
          </div>
        )}

        {/* Barre de progression en bas image */}
        {isStudent && c.enrolled && pct > 0 && (
          <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 5, background: 'rgba(255,255,255,.2)' }}>
            <div className="progress-bar-fill" style={{
              width: `${pct}%`,
              background: pct === 100 ? '#22c55e' : 'linear-gradient(90deg, #3b82f6, #6366f1)',
            }} />
          </div>
        )}
      </div>

      {/* ══ CONTENU TEXTE ══ */}
      <div style={{ padding: '18px 20px 20px', flex: 1, display: 'flex', flexDirection: 'column', gap: 0 }}>

        {/* Titre (si pas de thumbnail) */}
        {!c.thumbnail && (
          <h3 style={{
            fontFamily: "'Sora', sans-serif", fontSize: 16, fontWeight: 800,
            color: '#0f1f3d', margin: '0 0 8px', lineHeight: 1.35,
            display: '-webkit-box', WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical', overflow: 'hidden',
          }}>{c.title}</h3>
        )}

        {c.description && (
          <p style={{
            fontSize: 12.5, color: '#64748b', margin: '0 0 14px', lineHeight: 1.65,
            display: '-webkit-box', WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical', overflow: 'hidden',
          }}>{c.description}</p>
        )}

        {/* Méta */}
        <div style={{
          display: 'flex', gap: 14, marginBottom: 14,
          paddingBottom: 14, borderBottom: '1px solid #f1f5f9',
          flexWrap: 'wrap',
        }}>
          <span style={{ fontSize: 12, color: '#64748b', display: 'flex', alignItems: 'center', gap: 4, fontWeight: 600 }}>
            👨‍🏫 {c.teacher_name || 'Non assigné'}
          </span>
          <span style={{ fontSize: 12, color: '#64748b', display: 'flex', alignItems: 'center', gap: 4, fontWeight: 600 }}>
            📖 {c.lesson_count || 0} leçon{(c.lesson_count || 0) > 1 ? 's' : ''}
          </span>
          {c.student_count > 0 && (
            <span style={{ fontSize: 12, color: '#64748b', display: 'flex', alignItems: 'center', gap: 4, fontWeight: 600 }}>
              👥 {c.student_count} étudiant{c.student_count > 1 ? 's' : ''}
            </span>
          )}
        </div>

        {/* PDFs accessibles */}
        {pdfLessons.length > 0 && (
          <div style={{ marginBottom: 14, display: 'flex', gap: 6, flexWrap: 'wrap' }} onClick={e => e.stopPropagation()}>
            {pdfLessons.slice(0, 3).map(l => (
              <button key={l.id} className="pdf-btn" onClick={e => onOpenPdf(e, l.file_url, l.title)}>
                📄 {l.title.slice(0, 20)}{l.title.length > 20 ? '…' : ''}
              </button>
            ))}
            {pdfLessons.length > 3 && (
              <span style={{ fontSize: 11, color: '#94a3b8', alignSelf: 'center' }}>+{pdfLessons.length - 3} PDF</span>
            )}
          </div>
        )}

        {/* CTA / progression */}
        <div style={{ marginTop: 'auto' }}>
          {isStudent && c.enrolled ? (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 7 }}>
                <span style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>Progression</span>
                <span style={{ fontSize: 12, fontWeight: 800, color: pct === 100 ? '#22c55e' : '#3b82f6' }}>{pct}%</span>
              </div>
              <div style={{ height: 7, background: '#f1f5f9', borderRadius: 6, overflow: 'hidden' }}>
                <div className="progress-bar-fill" style={{
                  width: `${pct}%`,
                  background: pct === 100 ? '#22c55e' : 'linear-gradient(90deg, #3b82f6, #6366f1)',
                }} />
              </div>
              {pct === 100 && (
                <div style={{ fontSize: 12, color: '#22c55e', fontWeight: 700, marginTop: 8, textAlign: 'center' }}>🎉 Cours terminé !</div>
              )}
            </div>
          ) : isStudent && !c.enrolled ? (
            <button
              className="enroll-btn"
              style={{ width: '100%', background: 'linear-gradient(135deg, #3b82f6, #6366f1)', color: '#fff', fontSize: 14 }}
              onClick={e => onEnroll(e, c.id)}
              disabled={enrolling === c.id}
            >
              {enrolling === c.id ? '⏳ Inscription...' : "S'inscrire →"}
            </button>
          ) : (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 12, color: '#94a3b8', fontWeight: 600 }}>
                {isAdmin ? '⚙️ Admin' : isTeacher ? '✏️ Gestion' : ''}
              </span>
              <span className="card-cta-arrow" style={{ fontSize: 14, color: '#3b82f6', fontWeight: 800 }}>Voir →</span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

/* ══════════════════════════════════════════════
   VUE LISTE
══════════════════════════════════════════════ */
function CourseListRow({ course: c, idx, isStudent, isTeacher, isAdmin, enrolling, onEnroll, onOpenPdf, onClick }) {
  const [gradient] = useState(() => catGradient(c.category?.name, c.category_id || idx))
  const icon = getCatIcon(c.category?.name || '')
  const pct  = Math.round(c.progress_pct || 0)
  const pdfLessons = (c.lessons || []).filter(l => l.file_url && l.file_url.toLowerCase().endsWith('.pdf'))

  return (
    <div className="course-list-row" onClick={onClick}>
      {/* Thumbnail */}
      <div style={{
        width: 72, height: 72, borderRadius: 16, flexShrink: 0,
        background: c.thumbnail
          ? `url(${c.thumbnail}) center/cover no-repeat`
          : `linear-gradient(135deg, ${gradient[0]}, ${gradient[1]})`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 28, boxShadow: '0 4px 12px rgba(0,0,0,.08)',
        overflow: 'hidden',
      }}>
        {!c.thumbnail && icon}
      </div>

      {/* Infos */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: "'Sora', sans-serif", fontWeight: 700, fontSize: 15, color: '#0f1f3d', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {c.title}
        </div>
        <div style={{ fontSize: 12, color: '#64748b', marginTop: 4, fontWeight: 500 }}>
          {c.teacher_name}
          {c.lesson_count > 0 && <> · {c.lesson_count} leçon(s)</>}
          {c.category?.name && <> · {c.category.name}</>}
        </div>
        {isStudent && c.enrolled && pct > 0 && (
          <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ flex: 1, height: 6, background: '#f1f5f9', borderRadius: 4, overflow: 'hidden' }}>
              <div style={{ width: `${pct}%`, height: '100%', background: pct === 100 ? '#22c55e' : 'linear-gradient(90deg,#3b82f6,#6366f1)', borderRadius: 4 }} />
            </div>
            <span style={{ fontSize: 11, fontWeight: 800, color: pct === 100 ? '#22c55e' : '#3b82f6' }}>{pct}%</span>
          </div>
        )}
        {/* Boutons PDF inline */}
        {pdfLessons.length > 0 && (
          <div style={{ marginTop: 6, display: 'flex', gap: 5, flexWrap: 'wrap' }} onClick={e => e.stopPropagation()}>
            {pdfLessons.slice(0, 2).map(l => (
              <button key={l.id} className="pdf-btn" onClick={e => onOpenPdf(e, l.file_url, l.title)}>
                📄 {l.title.slice(0, 18)}{l.title.length > 18 ? '…' : ''}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Action */}
      <div style={{ flexShrink: 0 }}>
        {isStudent && c.enrolled
          ? <span style={{ fontSize: 12, background: '#d1fae5', color: '#16a34a', padding: '7px 16px', borderRadius: 22, fontWeight: 800 }}>Inscrit ✓</span>
          : isStudent && !c.enrolled
          ? <button className="enroll-btn" style={{ background: '#3b82f6', color: '#fff' }}
              onClick={e => onEnroll(e, c.id)} disabled={enrolling === c.id}>
              {enrolling === c.id ? '...' : "S'inscrire"}
            </button>
          : <div style={{ width: 38, height: 38, borderRadius: '50%', background: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#3b82f6', fontWeight: 800, fontSize: 16 }}>→</div>
        }
      </div>
    </div>
  )
}
