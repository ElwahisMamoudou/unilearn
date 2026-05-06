import { useEffect, useState, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../api/client'
import useAuthStore from '../store/authStore'

/* ─────────────────────────────────────────────────────────────
   URL thumbnail
──────────────────────────────────────────────────────────────*/
const BACKEND = (import.meta.env.VITE_API_URL || '').replace(/\/api\/?$/, '')
function thumbUrl(path) {
  if (!path) return null
  if (path.startsWith('http')) return path
  const clean = path.replace(/\\/g, '/').replace(/^\/+/, '')
  return BACKEND ? `${BACKEND}/${clean}` : `/${clean}`
}

/* ─────────────────────────────────────────────────────────────
   Palettes & icônes catégories
──────────────────────────────────────────────────────────────*/
const CAT_GRADIENTS = [
  ['#0f2460', '#3b82f6'], ['#0a2e1a', '#22c55e'],
  ['#2e0a0a', '#ef4444'], ['#2e240a', '#f59e0b'],
  ['#160a2e', '#8b5cf6'], ['#0a2e2e', '#14b8a6'],
  ['#2e0a24', '#ec4899'], ['#1a1a1a', '#f97316'],
]
const catGradient = (id = 0) => CAT_GRADIENTS[id % CAT_GRADIENTS.length]

const CAT_ICONS = {
  'mathématiques':'📐','maths':'📐','math':'📐',
  'informatique':'💻','info':'💻','programmation':'💻','code':'💻',
  'physique':'⚛️','chimie':'🧪','biologie':'🧬','sciences':'🔬',
  'histoire':'📜','géographie':'🌍','littérature':'📖','français':'✍️',
  'anglais':'🇬🇧','langue':'💬','communication':'🗣️',
  'technique':'⚙️','maintenance':'🔧','électronique':'⚡','automatique':'🤖',
  'économie':'📊','gestion':'💼','comptabilité':'🧾',
  'droit':'⚖️','médecine':'🩺','pharmacie':'💊',
  'architecture':'🏛️','design':'🎨','art':'🎭',
}
const getCatIcon = (name = '') => {
  const lower = name.toLowerCase()
  for (const [key, icon] of Object.entries(CAT_ICONS)) {
    if (lower.includes(key)) return icon
  }
  return '📚'
}

/* ─────────────────────────────────────────────────────────────
   Visionneuse PDF
──────────────────────────────────────────────────────────────*/
function PdfViewer({ url, title, onClose }) {
  return (
    <div style={{ position:'fixed', inset:0, zIndex:9999, background:'rgba(0,0,0,0.88)', backdropFilter:'blur(8px)', display:'flex', flexDirection:'column' }} onClick={onClose}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'14px 22px', background:'#0a1628', flexShrink:0 }} onClick={e=>e.stopPropagation()}>
        <span style={{ color:'#fff', fontWeight:800, fontSize:15, fontFamily:"'Sora',sans-serif" }}>📄 {title}</span>
        <div style={{ display:'flex', gap:10 }}>
          <a href={url} target="_blank" rel="noopener noreferrer" style={{ background:'#3b82f6', color:'#fff', borderRadius:9, padding:'8px 18px', fontWeight:700, fontSize:13, textDecoration:'none' }}>⬇ Télécharger</a>
          <button onClick={onClose} style={{ background:'rgba(255,255,255,.15)', color:'#fff', border:'none', borderRadius:9, padding:'8px 16px', fontWeight:700, cursor:'pointer', fontSize:18 }}>✕</button>
        </div>
      </div>
      <div style={{ flex:1, overflow:'hidden' }} onClick={e=>e.stopPropagation()}>
        <iframe src={url} title={title} style={{ width:'100%', height:'100%', border:'none' }} />
      </div>
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────
   Composant upload thumbnail inline (dans le modal de création)
──────────────────────────────────────────────────────────────*/
function ImageUploadZone({ value, onChange }) {
  const [preview, setPreview] = useState(null)
  const [dragOver, setDragOver] = useState(false)
  const inputRef = useRef()

  const handle = (file) => {
    if (!file) return
    if (!file.type.startsWith('image/')) { alert('Seulement les images (JPG, PNG, WEBP)'); return }
    if (file.size > 5 * 1024 * 1024) { alert('Image trop volumineuse (max 5 MB)'); return }
    const reader = new FileReader()
    reader.onload = e => setPreview(e.target.result)
    reader.readAsDataURL(file)
    onChange(file)
  }

  return (
    <div
      onClick={() => !preview && inputRef.current.click()}
      onDragOver={e => { e.preventDefault(); setDragOver(true) }}
      onDragLeave={() => setDragOver(false)}
      onDrop={e => { e.preventDefault(); setDragOver(false); handle(e.dataTransfer.files[0]) }}
      style={{
        position: 'relative',
        height: 200,
        borderRadius: 16,
        border: `2.5px dashed ${dragOver ? '#3b82f6' : preview ? '#22c55e' : '#cbd5e1'}`,
        background: dragOver ? '#eff6ff' : preview ? 'transparent' : '#f8fafc',
        cursor: preview ? 'default' : 'pointer',
        overflow: 'hidden',
        transition: 'all .2s',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {preview ? (
        <>
          <img src={preview} alt="aperçu" style={{ position:'absolute', inset:0, width:'100%', height:'100%', objectFit:'cover' }} />
          {/* Overlay actions */}
          <div style={{ position:'absolute', inset:0, background:'rgba(0,0,0,.5)', display:'flex', alignItems:'center', justifyContent:'center', gap:10, opacity:0, transition:'opacity .2s' }}
            onMouseEnter={e => e.currentTarget.style.opacity = 1}
            onMouseLeave={e => e.currentTarget.style.opacity = 0}
          >
            <button type="button"
              onClick={e => { e.stopPropagation(); inputRef.current.click() }}
              style={{ background:'#3b82f6', border:'none', color:'#fff', borderRadius:10, padding:'8px 18px', fontWeight:700, cursor:'pointer', fontSize:13 }}>
              🔄 Changer
            </button>
            <button type="button"
              onClick={e => { e.stopPropagation(); setPreview(null); onChange(null) }}
              style={{ background:'#ef4444', border:'none', color:'#fff', borderRadius:10, padding:'8px 18px', fontWeight:700, cursor:'pointer', fontSize:13 }}>
              🗑 Supprimer
            </button>
          </div>
        </>
      ) : (
        <div style={{ textAlign:'center', padding:'20px 30px', pointerEvents:'none' }}>
          <div style={{ fontSize:52, marginBottom:10 }}>🖼️</div>
          <div style={{ fontWeight:700, fontSize:14, color:'#1e3a5f', marginBottom:4 }}>
            {dragOver ? 'Déposez ici !' : 'Image de couverture du cours'}
          </div>
          <div style={{ fontSize:12, color:'#94a3b8' }}>Glisser-déposer ou cliquer · JPG, PNG, WEBP · max 5 MB</div>
          <div style={{ marginTop:14, display:'inline-block', background:'#1e3a5f', color:'#fff', borderRadius:10, padding:'8px 22px', fontSize:13, fontWeight:700 }}>
            Parcourir…
          </div>
        </div>
      )}
      <input ref={inputRef} type="file" accept="image/*" style={{ display:'none' }} onChange={e => handle(e.target.files[0])} />
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════
   PAGE PRINCIPALE
══════════════════════════════════════════════════════════════*/
export default function CoursesPage({ myOnly }) {
  const navigate    = useNavigate()
  const { user }    = useAuthStore()
  const [courses,   setCourses]   = useState([])
  const [search,    setSearch]    = useState('')
  const [loading,   setLoading]   = useState(true)
  const [enrolling, setEnrolling] = useState(null)
  const [msg,       setMsg]       = useState({ text:'', type:'' })
  const [filterCat, setFilterCat] = useState('')
  const [pdfViewer, setPdfViewer] = useState(null)

  // ── Création de cours ──
  const [createModal,   setCreateModal]   = useState(false)
  const [categories,    setCategories]    = useState([])
  const [allTeachers,   setAllTeachers]   = useState([])
  const [createForm,    setCreateForm]    = useState({ title:'', description:'', teacher_id:'', category_id:'', is_published:true })
  const [createThumb,   setCreateThumb]   = useState(null)   // File objet
  const [creating,      setCreating]      = useState(false)

  const isStudent = user?.role === 'student'
  const isTeacher = user?.role === 'teacher'
  const isAdmin   = user?.role === 'admin'

  // ── Flash avec timer annulable ──
  const flashTimerRef = useRef(null)
  useEffect(() => () => { if (flashTimerRef.current) clearTimeout(flashTimerRef.current) }, [])
  const flash = useCallback((text, type = 'success') => {
    if (flashTimerRef.current) clearTimeout(flashTimerRef.current)
    setMsg({ text, type })
    flashTimerRef.current = setTimeout(() => setMsg({ text:'', type:'' }), 3500)
  }, [])

  // ── Chargement cours ──
  const load = useCallback(() => {
    setLoading(true)
    api.get(myOnly ? '/courses/my' : '/courses')
      .then(r => setCourses(r.data))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [myOnly])

  useEffect(() => { load() }, [load])

  // ── Chargement catégories + enseignants pour le modal ──
  const loadCreateData = useCallback(async () => {
    if (!isAdmin && !isTeacher) return
    try {
      const [catR, usrR] = await Promise.all([
        api.get('/categories').catch(() => ({ data:[] })),
        isAdmin ? api.get('/admin/users').catch(() => ({ data:[] })) : Promise.resolve({ data:[] }),
      ])
      setCategories(catR.data)
      setAllTeachers(usrR.data.filter(u => u.role === 'teacher'))
    } catch {}
  }, [isAdmin, isTeacher])

  useEffect(() => { loadCreateData() }, [loadCreateData])

  // ── Inscription étudiant ──
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

  // ── Création cours avec upload thumbnail ──
  const handleCreateCourse = async e => {
    e.preventDefault()
    if (!createForm.title.trim()) return flash('Le titre est requis', 'error')
    if (isAdmin && !createForm.teacher_id) return flash('Sélectionnez un enseignant', 'error')
    setCreating(true)
    try {
      // 1. Créer le cours
      const payload = {
        title:        createForm.title,
        description:  createForm.description || null,
        teacher_id:   createForm.teacher_id ? parseInt(createForm.teacher_id) : (isTeacher ? user.id : null),
        category_id:  createForm.category_id ? parseInt(createForm.category_id) : null,
        is_published: createForm.is_published,
      }
      const { data: newCourse } = await api.post(
        isAdmin ? '/admin/courses' : '/courses',
        payload
      )
      // 2. Upload thumbnail si sélectionné
      if (createThumb instanceof File) {
        try {
          const fd = new FormData()
          fd.append('file', createThumb)
          await api.post(
            `/admin/courses/${newCourse.id}/thumbnail`, fd,
            { headers: { 'Content-Type': 'multipart/form-data' } }
          )
        } catch { /* pas bloquant */ }
      }
      flash('Cours créé avec succès !')
      setCreateModal(false)
      setCreateForm({ title:'', description:'', teacher_id:'', category_id:'', is_published:true })
      setCreateThumb(null)
      load()
    } catch (err) {
      flash(err.response?.data?.detail || 'Erreur création', 'error')
    } finally {
      setCreating(false)
    }
  }

  const openPdf = (e, url, title) => { e.stopPropagation(); setPdfViewer({ url, title }) }

  const categories = [...new Set(courses.map(c => c.category?.name).filter(Boolean))]

  const filtered = courses.filter(c => {
    const matchSearch = c.title.toLowerCase().includes(search.toLowerCase()) ||
      c.teacher_name?.toLowerCase().includes(search.toLowerCase())
    const matchCat = !filterCat || c.category?.name === filterCat
    return matchSearch && matchCat
  })

  return (
    <div style={{ fontFamily:"'Sora','DM Sans',sans-serif" }}>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Sora:wght@300;400;500;600;700;800&family=Fraunces:ital,wght@0,400;0,700;1,400&display=swap');

        /* ── Carte cours principale ── */
        .course-mega-card {
          position: relative;
          border-radius: 24px;
          overflow: hidden;
          cursor: pointer;
          transition: transform 0.42s cubic-bezier(0.34,1.28,0.64,1), box-shadow 0.42s ease;
          box-shadow: 0 4px 20px rgba(10,22,50,.10);
          background: #fff;
          border: 1px solid rgba(220,228,240,.7);
          display: flex;
          flex-direction: column;
        }
        .course-mega-card:hover {
          transform: translateY(-12px) scale(1.015);
          box-shadow: 0 28px 56px rgba(30,58,95,.18), 0 0 0 1px rgba(59,130,246,.12);
        }
        .course-mega-card:hover .mega-img-inner {
          transform: scale(1.07);
        }
        .course-mega-card:hover .mega-cta {
          opacity: 1;
          transform: translateY(0);
        }

        /* ── Zone image ── */
        .mega-img-wrap {
          height: 260px;
          position: relative;
          overflow: hidden;
          flex-shrink: 0;
        }
        .mega-img-inner {
          position: absolute;
          inset: 0;
          transition: transform 0.55s ease;
        }
        .mega-icon-center {
          position: absolute;
          inset: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 100px;
          filter: drop-shadow(0 6px 18px rgba(0,0,0,.35));
          user-select: none;
          transition: transform 0.42s cubic-bezier(0.34,1.28,0.64,1);
        }
        .course-mega-card:hover .mega-icon-center {
          transform: scale(1.18) rotate(-3deg);
        }

        /* ── CTA ── */
        .mega-cta {
          opacity: 0;
          transform: translateY(8px);
          transition: opacity .3s, transform .3s;
        }

        /* ── Barre de progression animée ── */
        .prog-fill {
          height: 100%;
          border-radius: 6px;
          transition: width .8s cubic-bezier(.34,1.56,.64,1);
        }

        /* ── Pill filtre ── */
        .cat-pill {
          padding: 7px 18px;
          border-radius: 100px;
          font-size: 12px;
          font-weight: 700;
          cursor: pointer;
          border: 1.5px solid;
          transition: all .18s ease;
          white-space: nowrap;
          font-family: 'Sora', sans-serif;
          letter-spacing: .3px;
        }
        .cat-pill:hover { transform: scale(1.06); }

        /* ── Badge ── */
        .badge-glass {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          backdrop-filter: blur(10px);
          -webkit-backdrop-filter: blur(10px);
          border: 1px solid rgba(255,255,255,.22);
          border-radius: 100px;
          font-size: 10px;
          font-weight: 800;
          letter-spacing: .8px;
          text-transform: uppercase;
          padding: 5px 12px;
          color: #fff;
        }

        /* ── Enroll btn ── */
        .enroll-btn-mega {
          width: 100%;
          padding: 13px 20px;
          border-radius: 14px;
          border: none;
          font-weight: 800;
          font-size: 14px;
          cursor: pointer;
          font-family: 'Sora', sans-serif;
          letter-spacing: .3px;
          transition: transform .2s, box-shadow .2s;
        }
        .enroll-btn-mega:hover:not(:disabled) {
          transform: scale(1.03);
          box-shadow: 0 8px 22px rgba(59,130,246,.38);
        }

        /* ── Input focus ── */
        .search-input:focus { outline: none; border-color: #3b82f6 !important; box-shadow: 0 0 0 3px rgba(59,130,246,.12); }

        /* ── Modal ── */
        .create-modal-overlay {
          position: fixed; inset: 0; z-index: 8000;
          background: rgba(8,18,40,.7);
          backdrop-filter: blur(8px);
          display: flex; align-items: center; justify-content: center;
          padding: 20px;
        }
        .create-modal {
          background: #fff;
          border-radius: 22px;
          width: 100%;
          max-width: 560px;
          max-height: 90vh;
          overflow-y: auto;
          box-shadow: 0 32px 80px rgba(8,18,40,.28);
        }
        .form-field label {
          display: block;
          font-size: 12px;
          font-weight: 700;
          color: #475569;
          text-transform: uppercase;
          letter-spacing: .8px;
          margin-bottom: 7px;
        }
        .form-field input,
        .form-field select,
        .form-field textarea {
          width: 100%;
          border: 1.5px solid #e2e8f0;
          border-radius: 11px;
          padding: 11px 14px;
          font-size: 14px;
          font-family: 'Sora', sans-serif;
          background: #f8fafc;
          color: #0f172a;
          transition: border-color .15s, box-shadow .15s;
          box-sizing: border-box;
        }
        .form-field input:focus,
        .form-field select:focus,
        .form-field textarea:focus {
          outline: none;
          border-color: #3b82f6;
          background: #fff;
          box-shadow: 0 0 0 3px rgba(59,130,246,.12);
        }
      `}</style>

      {pdfViewer && <PdfViewer url={pdfViewer.url} title={pdfViewer.title} onClose={() => setPdfViewer(null)} />}

      {/* ══ HERO ══ */}
      <div style={{
        background:'linear-gradient(135deg,#0a1628 0%,#1e3a6e 50%,#0c2340 100%)',
        borderRadius:22, padding:'32px 36px', marginBottom:32, color:'#fff',
        position:'relative', overflow:'hidden',
        boxShadow:'0 20px 48px rgba(10,22,50,.3)',
      }}>
        {/* Cercles décoratifs */}
        <div style={{ position:'absolute', right:-40, top:-40, width:260, height:260, borderRadius:'50%', background:'rgba(59,130,246,.07)', pointerEvents:'none' }}/>
        <div style={{ position:'absolute', right:80, bottom:-60, width:180, height:180, borderRadius:'50%', background:'rgba(99,102,241,.06)', pointerEvents:'none' }}/>
        <div style={{ position:'absolute', left:-20, bottom:-30, width:140, height:140, borderRadius:'50%', background:'rgba(16,185,129,.05)', pointerEvents:'none' }}/>

        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', flexWrap:'wrap', gap:16, position:'relative' }}>
          <div>
            <div style={{ fontSize:10, fontWeight:800, color:'#60a5fa', letterSpacing:2.5, textTransform:'uppercase', marginBottom:10 }}>
              UniLearn · Université de Ngaoundéré
            </div>
            <h1 style={{ fontFamily:"'Fraunces',serif", fontSize:30, fontWeight:700, margin:'0 0 10px', letterSpacing:-.5, lineHeight:1.1 }}>
              {myOnly ? (isTeacher ? '📖 Mes cours' : '🎓 Mon parcours') : '🌟 Catalogue des cours'}
            </h1>
            <p style={{ opacity:.55, fontSize:13, margin:0, fontFamily:"'Sora',sans-serif" }}>
              {filtered.length} cours disponible{filtered.length !== 1 ? 's' : ''}{filterCat && ` · ${filterCat}`}
            </p>
          </div>
          {(isTeacher || isAdmin) && (
            <button onClick={() => setCreateModal(true)} style={{
              background:'linear-gradient(135deg,#3b82f6,#6366f1)',
              border:'none', borderRadius:14, padding:'12px 26px',
              color:'#fff', fontWeight:800, cursor:'pointer', fontSize:14,
              fontFamily:"'Sora',sans-serif",
              boxShadow:'0 6px 20px rgba(59,130,246,.45)',
              transition:'transform .2s, box-shadow .2s',
            }}
              onMouseEnter={e => { e.currentTarget.style.transform='scale(1.04)'; e.currentTarget.style.boxShadow='0 10px 28px rgba(59,130,246,.5)' }}
              onMouseLeave={e => { e.currentTarget.style.transform='scale(1)'; e.currentTarget.style.boxShadow='0 6px 20px rgba(59,130,246,.45)' }}
            >
              + Créer un cours
            </button>
          )}
        </div>

        {/* Stats */}
        <div style={{ display:'flex', gap:32, marginTop:24, flexWrap:'wrap' }}>
          {[
            { v: courses.length,                                   l: 'Cours total' },
            { v: courses.filter(c => c.enrolled).length,          l: 'Inscrits'    },
            { v: courses.filter(c => (c.progress_pct||0) === 100).length, l: 'Terminés'   },
            { v: [...new Set(courses.map(c => c.category?.name).filter(Boolean))].length, l: 'Catégories' },
          ].map((s, i) => (
            <div key={i}>
              <div style={{ fontSize:26, fontWeight:800, fontFamily:"'Fraunces',serif" }}>{s.v}</div>
              <div style={{ fontSize:11, opacity:.5, marginTop:1, fontFamily:"'Sora',sans-serif", letterSpacing:.5 }}>{s.l}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Flash ── */}
      {msg.text && (
        <div style={{
          padding:'13px 20px', borderRadius:13, marginBottom:22,
          background: msg.type==='error' ? '#fef2f2' : '#f0fdf4',
          border: `1px solid ${msg.type==='error' ? '#fecaca' : '#bbf7d0'}`,
          color: msg.type==='error' ? '#dc2626' : '#16a34a',
          fontWeight:700, fontSize:14, fontFamily:"'Sora',sans-serif",
        }}>{msg.text}</div>
      )}

      {/* ── Recherche + filtres ── */}
      <div style={{ display:'flex', flexWrap:'wrap', gap:12, marginBottom:32, alignItems:'center' }}>
        <div style={{ flex:'1 1 260px', position:'relative' }}>
          <span style={{ position:'absolute', left:14, top:'50%', transform:'translateY(-50%)', fontSize:16 }}>🔍</span>
          <input
            className="search-input"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Rechercher un cours, enseignant..."
            style={{
              width:'100%', padding:'12px 14px 12px 44px', borderRadius:13,
              border:'1.5px solid #e2e8f0', fontSize:13, background:'white',
              boxSizing:'border-box', fontFamily:"'Sora',sans-serif", transition:'border-color .15s',
            }}
          />
          {search && (
            <button onClick={() => setSearch('')} style={{ position:'absolute', right:12, top:'50%', transform:'translateY(-50%)', background:'none', border:'none', cursor:'pointer', fontSize:18, color:'#94a3b8' }}>×</button>
          )}
        </div>

        <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
          <button className="cat-pill" onClick={() => setFilterCat('')} style={{
            background: !filterCat ? '#1e3a6e' : 'white',
            color:      !filterCat ? 'white'   : '#64748b',
            borderColor:!filterCat ? '#1e3a6e' : '#e2e8f0',
          }}>Tous</button>
          {categories.map(cat => (
            <button key={cat} className="cat-pill"
              onClick={() => setFilterCat(cat === filterCat ? '' : cat)}
              style={{
                background:  filterCat === cat ? '#3b82f6' : 'white',
                color:       filterCat === cat ? 'white'   : '#64748b',
                borderColor: filterCat === cat ? '#3b82f6' : '#e2e8f0',
              }}>
              {getCatIcon(cat)} {cat}
            </button>
          ))}
        </div>
      </div>

      {/* ── Grille de cours ── */}
      {loading ? (
        <div className="loading-overlay"><div className="spinner" /></div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign:'center', padding:'70px 20px' }}>
          <div style={{ fontSize:60, marginBottom:16 }}>🔎</div>
          <h3 style={{ color:'#1e3a6e', fontFamily:"'Fraunces',serif", fontSize:22, marginBottom:8 }}>
            {search ? 'Aucun cours trouvé' : 'Aucun cours disponible'}
          </h3>
          <p style={{ color:'#94a3b8', fontSize:14, fontFamily:"'Sora',sans-serif" }}>
            {search ? 'Essayez un autre terme.' : 'Revenez plus tard.'}
          </p>
        </div>
      ) : (
        <div style={{
          display:'grid',
          gridTemplateColumns:'repeat(auto-fill, minmax(320px, 1fr))',
          gap:28,
        }}>
          {filtered.map((c, idx) => (
            <CourseMegaCard
              key={c.id}
              course={c}
              idx={idx}
              isStudent={isStudent}
              isTeacher={isTeacher}
              isAdmin={isAdmin}
              enrolling={enrolling}
              onEnroll={enroll}
              onOpenPdf={openPdf}
              onClick={() => navigate(`/courses/${c.id}`)}
            />
          ))}
        </div>
      )}

      {/* ══ MODAL CRÉATION COURS ══ */}
      {createModal && (
        <div className="create-modal-overlay" onClick={() => setCreateModal(false)}>
          <div className="create-modal" onClick={e => e.stopPropagation()}>

            {/* Header */}
            <div style={{ padding:'24px 28px 0', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
              <div>
                <h2 style={{ margin:0, fontFamily:"'Fraunces',serif", fontSize:22, color:'#0f1f3d' }}>
                  Nouveau cours
                </h2>
                <p style={{ margin:'4px 0 0', fontSize:12, color:'#94a3b8', fontFamily:"'Sora',sans-serif" }}>
                  L'image s'affichera en grande icône sur la page des cours
                </p>
              </div>
              <button onClick={() => setCreateModal(false)} style={{ background:'#f1f5f9', border:'none', borderRadius:10, width:36, height:36, cursor:'pointer', fontSize:18, color:'#64748b', display:'flex', alignItems:'center', justifyContent:'center' }}>✕</button>
            </div>

            <form onSubmit={handleCreateCourse}>
              <div style={{ padding:'20px 28px', display:'flex', flexDirection:'column', gap:18 }}>

                {/* ── UPLOAD IMAGE ── */}
                <div>
                  <div style={{ fontSize:12, fontWeight:700, color:'#475569', textTransform:'uppercase', letterSpacing:.8, marginBottom:8, fontFamily:"'Sora',sans-serif" }}>
                    Image de couverture
                  </div>
                  <ImageUploadZone
                    value={createThumb}
                    onChange={file => setCreateThumb(file)}
                  />
                </div>

                {/* Titre */}
                <div className="form-field">
                  <label>Titre *</label>
                  <input
                    required
                    value={createForm.title}
                    onChange={e => setCreateForm(f => ({ ...f, title: e.target.value }))}
                    placeholder="Ex : Introduction aux réseaux informatiques"
                  />
                </div>

                {/* Description */}
                <div className="form-field">
                  <label>Description</label>
                  <textarea
                    rows={3}
                    value={createForm.description}
                    onChange={e => setCreateForm(f => ({ ...f, description: e.target.value }))}
                    placeholder="Décrivez brièvement le contenu du cours..."
                    style={{ resize:'vertical' }}
                  />
                </div>

                {/* Enseignant (admin seulement) */}
                {isAdmin && (
                  <div className="form-field">
                    <label>Enseignant *</label>
                    <select
                      required
                      value={createForm.teacher_id}
                      onChange={e => setCreateForm(f => ({ ...f, teacher_id: e.target.value }))}
                    >
                      <option value="">— Sélectionner un enseignant —</option>
                      {allTeachers.map(t => (
                        <option key={t.id} value={t.id}>{t.name}</option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Catégorie + Statut côte à côte */}
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
                  <div className="form-field">
                    <label>Catégorie</label>
                    <select
                      value={createForm.category_id}
                      onChange={e => setCreateForm(f => ({ ...f, category_id: e.target.value }))}
                    >
                      <option value="">Sans catégorie</option>
                      {categories.map(c => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="form-field">
                    <label>Statut</label>
                    <select
                      value={String(createForm.is_published)}
                      onChange={e => setCreateForm(f => ({ ...f, is_published: e.target.value === 'true' }))}
                    >
                      <option value="true">✅ Publié</option>
                      <option value="false">✏️ Brouillon</option>
                    </select>
                  </div>
                </div>

              </div>

              {/* Footer */}
              <div style={{ padding:'0 28px 24px', display:'flex', gap:10, justifyContent:'flex-end' }}>
                <button
                  type="button"
                  onClick={() => setCreateModal(false)}
                  style={{ padding:'11px 24px', borderRadius:12, border:'1.5px solid #e2e8f0', background:'#fff', color:'#64748b', fontWeight:700, cursor:'pointer', fontSize:14, fontFamily:"'Sora',sans-serif" }}
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  style={{
                    padding:'11px 28px', borderRadius:12, border:'none',
                    background: creating ? '#94a3b8' : 'linear-gradient(135deg,#1e3a6e,#3b82f6)',
                    color:'#fff', fontWeight:800, cursor: creating ? 'not-allowed' : 'pointer',
                    fontSize:14, fontFamily:"'Sora',sans-serif",
                    boxShadow: creating ? 'none' : '0 4px 16px rgba(59,130,246,.38)',
                    transition:'all .2s',
                  }}
                >
                  {creating ? '⏳ Création...' : '🚀 Créer le cours'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════
   GRANDE CARTE COURS (mega card)
══════════════════════════════════════════════════════════════*/
function CourseMegaCard({ course: c, idx, isStudent, isTeacher, isAdmin, enrolling, onEnroll, onOpenPdf, onClick }) {
  const [grad]  = useState(() => catGradient(c.category_id || idx))
  const icon    = getCatIcon(c.category?.name || '')
  const pct     = Math.round(c.progress_pct || 0)
  const thumb   = thumbUrl(c.thumbnail)
  const pdfLessons = (c.lessons || []).filter(l => l.file_url && l.file_url.toLowerCase().endsWith('.pdf'))
  const isFull  = pct >= 100

  return (
    <div className="course-mega-card" onClick={onClick}>

      {/* ══ ZONE IMAGE 260px ══ */}
      <div className="mega-img-wrap">

        {/* Fond : image ou dégradé */}
        <div className="mega-img-inner" style={{
          background: thumb
            ? `url(${thumb}) center/cover no-repeat`
            : `linear-gradient(145deg, ${grad[0]} 0%, ${grad[1]} 100%)`,
        }} />

        {/* Overlay sombre sur image */}
        {thumb && (
          <div style={{ position:'absolute', inset:0, background:'linear-gradient(to top,rgba(0,0,0,.72) 0%,rgba(0,0,0,.18) 55%,rgba(0,0,0,.04) 100%)' }} />
        )}

        {/* Motif géo si pas de thumbnail */}
        {!thumb && (
          <div style={{ position:'absolute', inset:0, backgroundImage:`radial-gradient(circle at 20% 35%, rgba(255,255,255,.12) 0%, transparent 55%), radial-gradient(circle at 80% 70%, rgba(255,255,255,.06) 0%, transparent 45%)` }} />
        )}

        {/* Grande icône centrale — seulement sans thumbnail */}
        {!thumb && (
          <div className="mega-icon-center">{icon}</div>
        )}

        {/* Badge catégorie */}
        {c.category?.name && (
          <div style={{ position:'absolute', top:14, left:14 }}>
            <span className="badge-glass" style={{ background:'rgba(0,0,0,.42)' }}>
              {getCatIcon(c.category.name)} {c.category.name}
            </span>
          </div>
        )}

        {/* Badge statut (admin/teacher) */}
        {(isTeacher || isAdmin) && (
          <div style={{ position:'absolute', top:14, right:14 }}>
            <span className="badge-glass" style={{ background: c.is_published ? 'rgba(34,197,94,.8)' : 'rgba(245,158,11,.8)' }}>
              {c.is_published ? '✓ PUBLIÉ' : '✏ BROUILLON'}
            </span>
          </div>
        )}

        {/* Badge inscrit (étudiant) */}
        {isStudent && c.enrolled && (
          <div style={{ position:'absolute', top:14, right:14 }}>
            <span className="badge-glass" style={{ background:'rgba(34,197,94,.85)' }}>✓ INSCRIT</span>
          </div>
        )}

        {/* Titre sur image (quand thumbnail) */}
        {thumb && (
          <div style={{ position:'absolute', bottom:0, left:0, right:0, padding:'18px 20px 14px' }}>
            <div style={{ fontFamily:"'Fraunces',serif", fontSize:18, fontWeight:700, color:'#fff', lineHeight:1.3, textShadow:'0 2px 10px rgba(0,0,0,.6)', display:'-webkit-box', WebkitLineClamp:2, WebkitBoxOrient:'vertical', overflow:'hidden' }}>
              {c.title}
            </div>
          </div>
        )}

        {/* Barre de progression (étudiant inscrit) */}
        {isStudent && c.enrolled && pct > 0 && (
          <div style={{ position:'absolute', bottom:0, left:0, right:0, height:6, background:'rgba(255,255,255,.2)' }}>
            <div className="prog-fill" style={{
              width:`${pct}%`,
              background: isFull ? '#22c55e' : 'linear-gradient(90deg,#3b82f6,#6366f1)',
            }} />
          </div>
        )}

        {/* PDFs accessibles */}
        {pdfLessons.length > 0 && (
          <div style={{ position:'absolute', bottom: (isStudent && c.enrolled && pct > 0) ? 12 : 6, right:14, display:'flex', gap:5 }} onClick={e => e.stopPropagation()}>
            {pdfLessons.slice(0,2).map(l => (
              <button key={l.id} onClick={e => onOpenPdf(e, l.file_url, l.title)}
                style={{ background:'rgba(255,255,255,.92)', border:'none', borderRadius:8, padding:'4px 10px', fontSize:11, fontWeight:700, color:'#ef4444', cursor:'pointer', display:'flex', alignItems:'center', gap:4, backdropFilter:'blur(6px)' }}>
                📄 PDF
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ══ CORPS TEXTE ══ */}
      <div style={{ padding:'18px 20px 20px', flex:1, display:'flex', flexDirection:'column', gap:10 }}>

        {/* Titre si pas de thumbnail */}
        {!thumb && (
          <h3 style={{ fontFamily:"'Fraunces',serif", fontSize:17, fontWeight:700, color:'#0f1f3d', margin:0, lineHeight:1.35, display:'-webkit-box', WebkitLineClamp:2, WebkitBoxOrient:'vertical', overflow:'hidden' }}>
            {c.title}
          </h3>
        )}

        {c.description && (
          <p style={{ fontSize:13, color:'#64748b', margin:0, lineHeight:1.6, display:'-webkit-box', WebkitLineClamp:2, WebkitBoxOrient:'vertical', overflow:'hidden', fontFamily:"'Sora',sans-serif" }}>
            {c.description}
          </p>
        )}

        {/* Méta */}
        <div style={{ display:'flex', gap:12, paddingBottom:12, borderBottom:'1px solid #f1f5f9', flexWrap:'wrap' }}>
          <span style={{ fontSize:12, color:'#64748b', display:'flex', alignItems:'center', gap:4, fontWeight:600, fontFamily:"'Sora',sans-serif" }}>
            👨‍🏫 {c.teacher_name || 'Non assigné'}
          </span>
          <span style={{ fontSize:12, color:'#64748b', display:'flex', alignItems:'center', gap:4, fontWeight:600, fontFamily:"'Sora',sans-serif" }}>
            📖 {c.lesson_count || 0} leçon{(c.lesson_count || 0) > 1 ? 's' : ''}
          </span>
          {c.student_count > 0 && (
            <span style={{ fontSize:12, color:'#64748b', display:'flex', alignItems:'center', gap:4, fontWeight:600, fontFamily:"'Sora',sans-serif" }}>
              👥 {c.student_count}
            </span>
          )}
        </div>

        {/* CTA */}
        <div style={{ marginTop:'auto' }}>
          {isStudent && c.enrolled ? (
            <div>
              <div style={{ display:'flex', justifyContent:'space-between', marginBottom:8 }}>
                <span style={{ fontSize:11, color:'#64748b', fontWeight:700, fontFamily:"'Sora',sans-serif" }}>Progression</span>
                <span style={{ fontSize:12, fontWeight:800, color: isFull ? '#22c55e' : '#3b82f6', fontFamily:"'Sora',sans-serif" }}>{pct}%</span>
              </div>
              <div style={{ height:8, background:'#f1f5f9', borderRadius:6, overflow:'hidden' }}>
                <div className="prog-fill" style={{
                  width:`${pct}%`,
                  background: isFull ? '#22c55e' : 'linear-gradient(90deg,#3b82f6,#6366f1)',
                }} />
              </div>
              {isFull && (
                <div style={{ fontSize:12, color:'#22c55e', fontWeight:800, marginTop:10, textAlign:'center', fontFamily:"'Sora',sans-serif" }}>
                  🎉 Cours terminé !
                </div>
              )}
            </div>

          ) : isStudent && !c.enrolled ? (
            <button
              className="enroll-btn-mega"
              style={{ background:'linear-gradient(135deg,#1e3a6e,#3b82f6)', color:'#fff', fontFamily:"'Sora',sans-serif" }}
              onClick={e => onEnroll(e, c.id)}
              disabled={enrolling === c.id}
            >
              {enrolling === c.id ? '⏳ Inscription...' : "S'inscrire au cours →"}
            </button>

          ) : (
            <div className="mega-cta" style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
              <span style={{ fontSize:12, color:'#94a3b8', fontWeight:600, fontFamily:"'Sora',sans-serif" }}>
                {isAdmin ? '⚙️ Administration' : '✏️ Gestion enseignant'}
              </span>
              <span style={{ fontSize:15, color:'#3b82f6', fontWeight:800 }}>Voir →</span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
