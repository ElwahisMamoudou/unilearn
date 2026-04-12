/**
 * ClassesPage.jsx
 * - Admin   : voit TOUTES les classes, peut créer / modifier / supprimer
 * - Enseignant : voit uniquement ses classes assignées
 * - Étudiant : voit uniquement les classes où l'admin l'a inscrit
 * Cliquer sur une classe → /classes/:id (ClassDetail)
 */
import { useEffect, useState } from 'react'
import { useNavigate }         from 'react-router-dom'
import api                     from '../api/client'
import useAuthStore            from '../store/authStore'

/* ── Couleurs par niveau ──────────────────────── */
const LEVEL_COLORS = {
  'Licence 1': '#3b82f6', 'Licence 2': '#06b6d4', 'Licence 3': '#10b981',
  'Master 1':  '#f59e0b', 'Master 2':  '#ef4444', 'Doctorat':  '#8b5cf6',
}
const lvlColor = l => LEVEL_COLORS[l] || '#6366f1'

/* ── Carte classe ─────────────────────────────── */
function ClassCard({ cls: c, onEdit, onDelete, isAdmin, onClick }) {
  const pct   = c.max_students > 0
    ? Math.min(100, Math.round(c.student_count / c.max_students * 100))
    : 0
  const color = lvlColor(c.level)
  const full  = pct >= 90

  return (
    <div
      onClick={onClick}
      style={{
        background: 'white', borderRadius: 14, overflow: 'hidden',
        border: '1px solid var(--border)', cursor: 'pointer',
        transition: 'transform .18s, box-shadow .18s',
      }}
      onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-3px)'; e.currentTarget.style.boxShadow = '0 8px 24px rgba(0,0,0,.10)' }}
      onMouseLeave={e => { e.currentTarget.style.transform = 'none';             e.currentTarget.style.boxShadow = 'none' }}
    >
      {/* Barre couleur niveau */}
      <div style={{ height: 5, background: color }} />

      <div style={{ padding: '18px 20px' }}>
        {/* En-tête */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--navy)', marginBottom: 4,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {c.name}
            </div>
            {c.code && (
              <span style={{ fontSize: 11, background: '#f1f5f9', color: '#64748b',
                padding: '2px 8px', borderRadius: 20, fontWeight: 600 }}>
                {c.code}
              </span>
            )}
          </div>
          <span style={{
            fontSize: 11, padding: '3px 10px', borderRadius: 20, fontWeight: 700,
            background: c.is_active ? '#dcfce7' : '#f1f5f9',
            color:      c.is_active ? '#166534' : '#64748b',
            flexShrink: 0, marginLeft: 8,
          }}>
            {c.is_active ? 'Active' : 'Inactive'}
          </span>
        </div>

        {/* Infos */}
        <div style={{ fontSize: 12, color: 'var(--text-muted)', display: 'flex', flexDirection: 'column', gap: 3, marginBottom: 14 }}>
          {c.level              && <span style={{ color, fontWeight: 600 }}>🎓 {c.level}</span>}
          {c.teacher_name       && <span>👨‍🏫 {c.teacher_name}</span>}
          {c.academic_year_name && <span>📅 {c.academic_year_name}</span>}
        </div>

        {/* Stats */}
        <div style={{ display: 'flex', gap: 20, marginBottom: 12 }}>
          <div>
            <div style={{ fontSize: 22, fontWeight: 800, color: '#3b82f6' }}>{c.student_count}</div>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: .5 }}>étudiants</div>
          </div>
          <div>
            <div style={{ fontSize: 22, fontWeight: 800, color: '#10b981' }}>{c.course_count ?? '—'}</div>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: .5 }}>cours</div>
          </div>
        </div>

        {/* Barre capacité */}
        <div style={{ marginBottom: isAdmin ? 12 : 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>
            <span>{c.student_count}/{c.max_students} places</span>
            <span style={{ color: full ? '#ef4444' : 'var(--text-muted)', fontWeight: full ? 700 : 400 }}>{pct}%</span>
          </div>
          <div style={{ height: 5, background: '#f1f5f9', borderRadius: 4, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${pct}%`, borderRadius: 4,
              background: full ? '#ef4444' : color, transition: 'width .4s' }} />
          </div>
        </div>

        {/* Actions admin */}
        {isAdmin && (
          <div style={{ display: 'flex', gap: 6 }} onClick={e => e.stopPropagation()}>
            <button className="btn btn-outline btn-sm"
              style={{ fontSize: 11, padding: '3px 10px' }}
              onClick={onEdit}>✏️ Modifier</button>
            <button className="btn btn-danger btn-sm"
              style={{ fontSize: 11, padding: '3px 10px' }}
              onClick={onDelete}>🗑️</button>
          </div>
        )}
      </div>
    </div>
  )
}

/* ══════════════════════════════════════════════
   PAGE PRINCIPALE
══════════════════════════════════════════════ */
export default function ClassesPage() {
  const { user }  = useAuthStore()
  const navigate  = useNavigate()

  const [classes,  setClasses]  = useState([])
  const [years,    setYears]    = useState([])
  const [teachers, setTeachers] = useState([])
  const [loading,  setLoading]  = useState(true)
  const [search,   setSearch]   = useState('')
  const [msg,      setMsg]      = useState({ text: '', type: '' })

  /* Modal créer / modifier */
  const [modal,   setModal]   = useState(false)
  const [editing, setEditing] = useState(null)
  const EMPTY = { name: '', code: '', description: '', level: '', academic_year_id: '', teacher_id: '', max_students: 50, is_active: true }
  const [form, setForm] = useState(EMPTY)

  const isAdmin   = user?.role === 'admin'
  const isTeacher = user?.role === 'teacher'
  const isStudent = user?.role === 'student'

  const flash = (text, type = 'success') => {
    setMsg({ text, type })
    setTimeout(() => setMsg({ text: '', type: '' }), 4000)
  }

  /* ── Chargement ── */
  const load = async () => {
    setLoading(true)
    try {
      const cr = await api.get('/classes')
      setClasses(cr.data)

      if (isAdmin) {
        const [yr, ur] = await Promise.all([
          api.get('/academic/years').catch(() => ({ data: [] })),
          api.get('/admin/users').catch(() => ({ data: [] })),
        ])
        setYears(yr.data)
        setTeachers(ur.data.filter(u => u.role === 'teacher'))
      }
    } catch {
      flash('Erreur de chargement', 'error')
    }
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  /* ── Ouvrir modal ── */
  const openCreate = () => {
    setEditing(null); setForm(EMPTY); setModal(true)
  }

  const openEdit = (cls, e) => {
    e?.stopPropagation()
    setEditing(cls)
    setForm({
      name:             cls.name,
      code:             cls.code             || '',
      description:      cls.description      || '',
      level:            cls.level            || '',
      academic_year_id: cls.academic_year_id || '',
      teacher_id:       cls.teacher_id       || '',
      max_students:     cls.max_students,
      is_active:        cls.is_active,
    })
    setModal(true)
  }

  /* ── Sauvegarder ── */
  const saveClass = async e => {
    e.preventDefault()
    if (!form.name.trim()) return flash('Le nom est requis', 'error')
    try {
      const payload = {
        ...form,
        academic_year_id: form.academic_year_id ? parseInt(form.academic_year_id) : null,
        teacher_id:       form.teacher_id       ? parseInt(form.teacher_id)       : null,
        max_students:     parseInt(form.max_students),
      }
      if (editing) {
        await api.put(`/classes/${editing.id}`, payload)
        flash('Classe modifiée !')
      } else {
        await api.post('/classes', payload)
        flash('Classe créée !')
      }
      setModal(false); load()
    } catch (err) {
      flash(err.response?.data?.detail || 'Erreur', 'error')
    }
  }

  /* ── Supprimer ── */
  const deleteClass = async (id, e) => {
    e?.stopPropagation()
    if (!confirm('Supprimer cette classe ? Action irréversible.')) return
    try {
      await api.delete(`/classes/${id}`)
      flash('Classe supprimée')
      setClasses(prev => prev.filter(c => c.id !== id))
    } catch {
      flash('Erreur suppression', 'error')
    }
  }

  /* ── Filtrage ── */
  const filtered = classes.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    (c.code || '').toLowerCase().includes(search.toLowerCase()) ||
    (c.level || '').toLowerCase().includes(search.toLowerCase())
  )

  /* ── Titre selon rôle ── */
  const pageTitle = isStudent ? 'Mes classes' : isTeacher ? 'Mes classes assignées' : 'Classes & Promotions'

  return (
    <>
      {msg.text && (
        <div className={`alert alert-${msg.type === 'error' ? 'error' : 'success'}`} style={{ marginBottom: 16 }}>
          {msg.text}
        </div>
      )}

      {/* En-tête */}
      <div className="section-header">
        <span className="section-title">{pageTitle} ({classes.length})</span>
        {isAdmin && (
          <button className="btn btn-primary" onClick={openCreate}>
            + Nouvelle classe
          </button>
        )}
      </div>

      {/* Message contextuel étudiant */}
      {isStudent && classes.length > 0 && (
        <div style={{
          background: 'linear-gradient(135deg, var(--navy), #1a3a6e)',
          borderRadius: 12, padding: '16px 20px', marginBottom: 20, color: 'white',
        }}>
          <div style={{ fontSize: 13, opacity: .7, marginBottom: 4 }}>Vous êtes inscrit dans</div>
          <div style={{ fontSize: 24, fontWeight: 800 }}>
            {classes.length} classe{classes.length > 1 ? 's' : ''}
          </div>
          <div style={{ fontSize: 12, opacity: .6, marginTop: 2 }}>
            Cliquez sur une classe pour accéder à vos cours
          </div>
        </div>
      )}

      {/* Barre de recherche */}
      {classes.length > 3 && (
        <input
          className="form-input"
          placeholder="Rechercher une classe…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ maxWidth: 360, marginBottom: 20 }}
        />
      )}

      {/* Contenu */}
      {loading ? (
        <div className="loading-overlay"><div className="spinner" /></div>
      ) : filtered.length === 0 ? (
        <div className="empty-state">
          <div style={{ fontSize: 48, marginBottom: 12 }}>🎓</div>
          <h3>
            {search
              ? 'Aucun résultat'
              : isStudent
              ? 'Aucune classe assignée'
              : isTeacher
              ? 'Aucune classe assignée'
              : 'Aucune classe'}
          </h3>
          <p>
            {search
              ? `Aucune classe pour "${search}".`
              : isAdmin
              ? 'Créez la première classe.'
              : 'Contactez votre administrateur.'}
          </p>
          {isAdmin && !search && (
            <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={openCreate}>
              Créer la première classe
            </button>
          )}
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(290px, 1fr))', gap: 16 }}>
          {filtered.map(cls => (
            <ClassCard
              key={cls.id}
              cls={cls}
              isAdmin={isAdmin}
              onClick={() => navigate(`/classes/${cls.id}`)}
              onEdit={e => openEdit(cls, e)}
              onDelete={e => deleteClass(cls.id, e)}
            />
          ))}
        </div>
      )}

      {/* ── Modal créer / modifier ── */}
      {modal && (
        <div className="modal-overlay" onClick={() => setModal(false)}>
          <div className="modal" style={{ maxWidth: 560, width: '95vw', maxHeight: '90vh', overflowY: 'auto' }}
            onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">{editing ? 'Modifier la classe' : 'Nouvelle classe'}</span>
              <button className="modal-close" onClick={() => setModal(false)}>✕</button>
            </div>
            <form onSubmit={saveClass}>
              <div className="modal-body">

                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Nom * <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>ex : L1 Informatique</span></label>
                    <input className="form-input" required value={form.name}
                      onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Code <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>ex : L1-INFO</span></label>
                    <input className="form-input" value={form.code}
                      onChange={e => setForm(f => ({ ...f, code: e.target.value }))} placeholder="L1-INFO" />
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Niveau</label>
                    <select className="form-select" value={form.level}
                      onChange={e => setForm(f => ({ ...f, level: e.target.value }))}>
                      <option value="">-- Sélectionner --</option>
                      {['Licence 1', 'Licence 2', 'Licence 3', 'Master 1', 'Master 2', 'Doctorat', 'BTS', 'Autre'].map(l => (
                        <option key={l} value={l}>{l}</option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Capacité max</label>
                    <input className="form-input" type="number" min={1} value={form.max_students}
                      onChange={e => setForm(f => ({ ...f, max_students: e.target.value }))} />
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Année académique</label>
                    <select className="form-select" value={form.academic_year_id}
                      onChange={e => setForm(f => ({ ...f, academic_year_id: e.target.value }))}>
                      <option value="">-- Aucune --</option>
                      {years.map(y => (
                        <option key={y.id} value={y.id}>{y.name}{y.is_current ? ' ✓' : ''}</option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Enseignant responsable</label>
                    <select className="form-select" value={form.teacher_id}
                      onChange={e => setForm(f => ({ ...f, teacher_id: e.target.value }))}>
                      <option value="">-- Aucun --</option>
                      {teachers.map(t => (
                        <option key={t.id} value={t.id}>{t.name}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">Description</label>
                  <textarea className="form-input" rows={2} value={form.description}
                    onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                    style={{ resize: 'vertical' }} placeholder="Description optionnelle…" />
                </div>

                <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', userSelect: 'none' }}>
                  <input type="checkbox" checked={form.is_active}
                    onChange={e => setForm(f => ({ ...f, is_active: e.target.checked }))}
                    style={{ width: 16, height: 16 }} />
                  <span className="form-label" style={{ margin: 0 }}>Classe active</span>
                </label>

              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-outline" onClick={() => setModal(false)}>Annuler</button>
                <button type="submit" className="btn btn-primary">
                  {editing ? 'Enregistrer' : 'Créer la classe'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}