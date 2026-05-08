import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../api/client'

const BACKEND = (import.meta.env.VITE_API_URL || '').replace(/\/api\/?$/, '')
const thumbUrl = path => {
  if (!path) return null
  if (path.startsWith('http')) return path
  return BACKEND
    ? `${BACKEND}/${path.replace(/\\/g, '/').replace(/^\/+/, '')}`
    : `/${path.replace(/\\/g, '/').replace(/^\/+/, '')}`
}

const LEVEL_COLORS = {
  'Licence 1': '#3b82f6', 'Licence 2': '#06b6d4', 'Licence 3': '#10b981',
  'Master 1':  '#f59e0b', 'Master 2':  '#ef4444', 'Doctorat':  '#8b5cf6',
}
const lvlColor = l => LEVEL_COLORS[l] || '#6366f1'

function useFlash() {
  const [msg, setMsg] = useState({ text: '', type: '' })
  const flash = useCallback((text, type = 'success') => {
    setMsg({ text, type })
    setTimeout(() => setMsg({ text: '', type: '' }), 3500)
  }, [])
  return [msg, flash]
}

function Alert({ msg }) {
  if (!msg?.text) return null
  return (
    <div className={`alert alert-${msg.type === 'error' ? 'error' : 'success'}`} style={{ marginBottom: 16 }}>
      {msg.text}
    </div>
  )
}

function ThumbnailField({ courseId, currentUrl, onFile, onUploaded }) {
  const [preview,   setPreview]   = useState(currentUrl || null)
  const [uploading, setUploading] = useState(false)
  const [dragOver,  setDragOver]  = useState(false)
  const inputRef = useRef()

  useEffect(() => { if (currentUrl) setPreview(currentUrl) }, [currentUrl])

  const handle = async (file) => {
    if (!file) return
    if (!file.type.startsWith('image/')) return alert('Seulement les images (JPG, PNG, WEBP)')
    if (file.size > 5 * 1024 * 1024) return alert('Image trop volumineuse (max 5 MB)')
    const reader = new FileReader()
    reader.onload = e => setPreview(e.target.result)
    reader.readAsDataURL(file)
    if (courseId) {
      setUploading(true)
      try {
        const fd = new FormData()
        fd.append('file', file)
        const { data } = await api.post(
          `/admin/courses/${courseId}/thumbnail`, fd,
          { headers: { 'Content-Type': 'multipart/form-data' } }
        )
        onUploaded?.(data.thumbnail || data.url || data)
      } catch (err) {
        alert(err.response?.data?.detail || 'Erreur upload image')
      } finally {
        setUploading(false)
      }
    } else {
      onFile?.(file)
    }
  }

  return (
    <div className="form-group">
      <label className="form-label">
        Image du cours
        <span style={{ marginLeft: 6, fontSize: 11, color: 'var(--text-muted)', fontWeight: 400 }}>
          — JPG · PNG · WEBP · max 5 MB
        </span>
      </label>
      <div
        onClick={() => !uploading && inputRef.current.click()}
        onDragOver={e => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={e => { e.preventDefault(); setDragOver(false); handle(e.dataTransfer.files[0]) }}
        style={{
          border: `2px dashed ${dragOver ? '#3b82f6' : preview ? '#22c55e' : '#e2e8f0'}`,
          borderRadius: 14, cursor: uploading ? 'wait' : 'pointer',
          overflow: 'hidden', transition: 'border-color .2s',
          background: dragOver ? '#eff6ff' : '#fafafa',
          position: 'relative',
          height: preview ? 180 : 110,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
      >
        {preview ? (
          <>
            <img src={preview} alt="apercu" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
            <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0, transition: 'opacity .2s' }}
              onMouseEnter={e => e.currentTarget.style.opacity = 1}
              onMouseLeave={e => e.currentTarget.style.opacity = 0}>
              <span style={{ color: '#fff', fontWeight: 700, fontSize: 13 }}>
                {uploading ? 'Upload...' : 'Changer'}
              </span>
            </div>
          </>
        ) : uploading ? (
          <div style={{ textAlign: 'center' }}>
            <div className="spinner" style={{ margin: '0 auto 8px' }} />
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Upload en cours...</div>
          </div>
        ) : (
          <div style={{ textAlign: 'center', padding: '12px 20px' }}>
            <div style={{ fontSize: 32, marginBottom: 6 }}>🖼️</div>
            <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--navy)' }}>Glisser-deposer ou cliquer</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3 }}>Image affichee en grande icone sur la page des cours</div>
          </div>
        )}
        <input ref={inputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={e => handle(e.target.files[0])} />
      </div>
    </div>
  )
}

export default function AdminDashboard() {
  const navigate = useNavigate()
  const [msg, flash] = useFlash()

  const [stats,      setStats]      = useState(null)
  const [classes,    setClasses]    = useState([])
  const [allUsers,   setAllUsers]   = useState([])
  const [categories, setCategories] = useState([])
  const [years,      setYears]      = useState([])
  const [loading,    setLoading]    = useState(true)

  const [view, setView] = useState('classes')

  const [classModal,  setClassModal]  = useState(false)
  const [userModal,   setUserModal]   = useState(false)
  const [courseModal, setCourseModal] = useState(false)
  const [yearModal,   setYearModal]   = useState(false)

  const [editClass,  setEditClass]  = useState(null)
  const [editUser,   setEditUser]   = useState(null)
  const [editCourse, setEditCourse] = useState(null)

  const [classForm, setClassForm] = useState({
    name: '', code: '', description: '', level: '',
    academic_year_id: '', teacher_id: '', max_students: 50, is_active: true,
  })
  const [showNewYear, setShowNewYear] = useState(false)
  const [newYearForm, setNewYearForm] = useState({ name: '', start_date: '', end_date: '', is_current: false })
  const [savingYear,  setSavingYear]  = useState(false)
  const [editYear,    setEditYear]    = useState(null)

  const [userForm, setUserForm] = useState({ name: '', email: '', password: '', role: 'student' })

  const [courseForm,    setCourseForm]    = useState({ title: '', description: '', category_id: '', teacher_id: '', is_published: true })
  const [savedCourseId, setSavedCourseId] = useState(null)
  const [pendingThumb,  setPendingThumb]  = useState(null)

  const [search, setSearch] = useState('')

  const teachers = useMemo(() => allUsers.filter(u => u.role === 'teacher'), [allUsers])

  const loadAll = useCallback(async () => {
    setLoading(true)
    try {
      const [s, cl, u, cat, yr] = await Promise.all([
        api.get('/admin/stats'),
        api.get('/classes'),
        api.get('/admin/users'),
        api.get('/categories'),
        api.get('/academic/years'),
      ])
      setStats(s.data); setClasses(cl.data); setAllUsers(u.data)
      setCategories(cat.data); setYears(yr.data)
    } catch { flash('Erreur de chargement', 'error') }
    finally { setLoading(false) }
  }, [flash])

  useEffect(() => { loadAll() }, [loadAll])

  // ── Clic sur une classe → navigate vers ClassDetail.jsx ──
  const openClass = useCallback((cls) => {
    navigate(`/classes/${cls.id}`)
  }, [navigate])

  // ── Années académiques ──
  const openYearModal = () => {
    setEditYear(null)
    setNewYearForm({ name: '', start_date: '', end_date: '', is_current: false })
    setYearModal(true)
  }

  const saveYear = async () => {
    if (!newYearForm.name.trim()) return flash('Le nom est requis', 'error')
    if (!newYearForm.start_date)  return flash('La date de debut est requise', 'error')
    if (!newYearForm.end_date)    return flash('La date de fin est requise', 'error')
    setSavingYear(true)
    try {
      const payload = {
        name:       newYearForm.name,
        start_date: new Date(newYearForm.start_date).toISOString(),
        end_date:   new Date(newYearForm.end_date).toISOString(),
        is_current: newYearForm.is_current,
      }
      let data
      if (editYear) {
        const r = await api.put(`/academic/years/${editYear.id}`, payload)
        data = r.data
        setYears(prev => prev.map(y =>
          y.id === editYear.id ? data : (newYearForm.is_current ? { ...y, is_current: false } : y)
        ))
        flash(`Annee "${data.name}" modifiee !`)
      } else {
        const r = await api.post('/academic/years', { ...payload, semesters: [] })
        data = r.data
        setYears(prev => {
          const base = newYearForm.is_current ? prev.map(y => ({ ...y, is_current: false })) : [...prev]
          return [...base, data].sort((a, b) => new Date(b.start_date) - new Date(a.start_date))
        })
        flash(`Annee "${data.name}" creee !`)
      }
      setEditYear(null)
      setNewYearForm({ name: '', start_date: '', end_date: '', is_current: false })
    } catch (err) { flash(err.response?.data?.detail || 'Erreur', 'error') }
    finally { setSavingYear(false) }
  }

  const deleteYear = async yr => {
    if (!confirm(`Supprimer l'annee "${yr.name}" ?`)) return
    try {
      await api.delete(`/academic/years/${yr.id}`)
      setYears(prev => prev.filter(y => y.id !== yr.id))
      flash(`Annee "${yr.name}" supprimee`)
    } catch (err) { flash(err.response?.data?.detail || 'Erreur', 'error') }
  }

  const setCurrentYear = async yr => {
    try { await api.patch(`/academic/years/${yr.id}/set-current`) } catch {}
    setYears(prev => prev.map(y => ({ ...y, is_current: y.id === yr.id })))
    flash(`"${yr.name}" definie comme annee courante`)
  }

  const createYearInline = async () => {
    if (!newYearForm.name.trim()) return flash('Le nom est requis', 'error')
    if (!newYearForm.start_date)  return flash('La date de debut est requise', 'error')
    if (!newYearForm.end_date)    return flash('La date de fin est requise', 'error')
    setSavingYear(true)
    try {
      const { data } = await api.post('/academic/years', {
        name:       newYearForm.name,
        start_date: new Date(newYearForm.start_date).toISOString(),
        end_date:   new Date(newYearForm.end_date).toISOString(),
        is_current: newYearForm.is_current,
        semesters:  [],
      })
      setYears(prev => [...prev, data].sort((a, b) => new Date(b.start_date) - new Date(a.start_date)))
      setClassForm(f => ({ ...f, academic_year_id: String(data.id) }))
      setShowNewYear(false)
      setNewYearForm({ name: '', start_date: '', end_date: '', is_current: false })
      flash(`Annee "${data.name}" creee et selectionnee !`)
    } catch (err) { flash(err.response?.data?.detail || 'Erreur', 'error') }
    finally { setSavingYear(false) }
  }

  // ── Classes CRUD ──
  const openCreateClass = () => {
    setEditClass(null)
    const cur = years.find(y => y.is_current)
    setClassForm({ name: '', code: '', description: '', level: '', academic_year_id: cur ? String(cur.id) : '', teacher_id: '', max_students: 50, is_active: true })
    setShowNewYear(false)
    setNewYearForm({ name: '', start_date: '', end_date: '', is_current: false })
    setClassModal(true)
  }

  const openEditClass = (cls, e) => {
    e?.stopPropagation()
    setEditClass(cls)
    setClassForm({
      name: cls.name, code: cls.code || '', description: cls.description || '',
      level: cls.level || '',
      academic_year_id: cls.academic_year_id ? String(cls.academic_year_id) : '',
      teacher_id: cls.teacher_id || '', max_students: cls.max_students, is_active: cls.is_active,
    })
    setShowNewYear(false)
    setNewYearForm({ name: '', start_date: '', end_date: '', is_current: false })
    setClassModal(true)
  }

  const saveClass = async () => {
    if (!classForm.name.trim()) return flash('Le nom est requis', 'error')
    const payload = {
      name: classForm.name, code: classForm.code || null,
      description: classForm.description || null, level: classForm.level || null,
      academic_year_id: classForm.academic_year_id ? parseInt(classForm.academic_year_id) : null,
      teacher_id: classForm.teacher_id ? parseInt(classForm.teacher_id) : null,
      max_students: parseInt(classForm.max_students), is_active: classForm.is_active,
    }
    try {
      if (editClass) {
        await api.put(`/classes/${editClass.id}`, payload)
        flash('Classe mise a jour')
      } else {
        await api.post('/classes', payload)
        flash('Classe creee')
      }
      setClassModal(false); loadAll()
    } catch (err) { flash(err.response?.data?.detail || 'Erreur', 'error') }
  }

  const deleteClass = async (id, e) => {
    e?.stopPropagation()
    if (!confirm('Supprimer cette classe et tout son contenu ?')) return
    try {
      await api.delete(`/classes/${id}`)
      flash('Classe supprimee'); loadAll()
    } catch { flash('Erreur suppression', 'error') }
  }

  // ── Utilisateurs CRUD ──
  const openCreateUser = role => {
    setEditUser(null)
    setUserForm({ name: '', email: '', password: '', role: role || 'student' })
    setUserModal(true)
  }
  const openEditUser = u => {
    setEditUser(u)
    setUserForm({ name: u.name, email: u.email, password: '', role: u.role })
    setUserModal(true)
  }
  const saveUser = async e => {
    e.preventDefault()
    try {
      if (editUser) await api.put(`/admin/users/${editUser.id}`, { name: userForm.name, role: userForm.role, is_active: editUser.is_active })
      else await api.post('/admin/users', userForm)
      flash(editUser ? 'Utilisateur modifie' : 'Utilisateur cree')
      setUserModal(false); loadAll()
    } catch (err) { flash(err.response?.data?.detail || 'Erreur', 'error') }
  }
  const toggleActive = async u => {
    await api.put(`/admin/users/${u.id}`, { is_active: !u.is_active })
    flash(`Compte ${u.is_active ? 'desactive' : 'active'}`); loadAll()
  }
  const deleteUser = async id => {
    if (!confirm('Supprimer cet utilisateur ?')) return
    try { await api.delete(`/admin/users/${id}`); flash('Utilisateur supprime'); loadAll() }
    catch (err) { flash(err.response?.data?.detail || 'Erreur', 'error') }
  }

  // ── Cours CRUD (depuis le modal, sans lien à une classe) ──
  const openCreateCourse = () => {
    setEditCourse(null); setSavedCourseId(null); setPendingThumb(null)
    setCourseForm({ title: '', description: '', category_id: '', teacher_id: '', is_published: true })
    setCourseModal(true)
  }
  const openEditCourse = c => {
    setEditCourse(c); setSavedCourseId(c.id); setPendingThumb(null)
    setCourseForm({ title: c.title, description: c.description || '', category_id: c.category_id ? String(c.category_id) : '', teacher_id: c.teacher_id ? String(c.teacher_id) : '', is_published: c.is_published })
    setCourseModal(true)
  }
  const saveCourse = async e => {
    e.preventDefault()
    if (!courseForm.title.trim()) return flash('Le titre est requis', 'error')
    if (!courseForm.teacher_id)   return flash('Selectionnez un enseignant', 'error')
    const payload = {
      title: courseForm.title, description: courseForm.description || null,
      teacher_id: parseInt(courseForm.teacher_id),
      category_id: courseForm.category_id ? parseInt(courseForm.category_id) : null,
      is_published: courseForm.is_published,
    }
    try {
      if (editCourse) {
        await api.put(`/admin/courses/${editCourse.id}`, payload)
        flash('Cours modifie !'); setCourseModal(false)
      } else {
        const { data: newCourse } = await api.post('/admin/courses', payload)
        setSavedCourseId(newCourse.id)
        setEditCourse(newCourse)
        if (pendingThumb instanceof File) {
          try {
            const fd = new FormData()
            fd.append('file', pendingThumb)
            const { data: td } = await api.post(
              `/admin/courses/${newCourse.id}/thumbnail`, fd,
              { headers: { 'Content-Type': 'multipart/form-data' } }
            )
            setEditCourse(c => ({ ...c, thumbnail: td.thumbnail || td.url || td }))
            setPendingThumb(null)
            flash('Cours cree avec image !', 'success')
          } catch { flash('Cours cree — image non uploadee', 'success') }
        } else {
          flash('Cours cree ! Ajoutez une image puis fermez.', 'success')
        }
      }
    } catch (err) { flash(err.response?.data?.detail || 'Erreur', 'error') }
  }
  const closeCourseModal = () => {
    setCourseModal(false); setSavedCourseId(null); setEditCourse(null); setPendingThumb(null)
  }

  const filteredClasses = classes.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    (c.code || '').toLowerCase().includes(search.toLowerCase())
  )

  if (loading) return <div className="loading-overlay"><div className="spinner" /></div>

  return (
    <>
      <Alert msg={msg} />

      {/* ── VUE CLASSES ── */}
      {view === 'classes' && (
        <>
          <div style={{ background: 'linear-gradient(135deg,var(--navy),#1a3a6e)', borderRadius: 16, padding: '28px 32px', marginBottom: 28, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
            <div>
              <h2 style={{ fontFamily: 'Playfair Display,serif', fontSize: 22, margin: 0 }}>Administration UniLearn</h2>
              <p style={{ opacity: .6, fontSize: 13, marginTop: 6 }}>Gerez vos classes, enseignants, etudiants et cours depuis ce panneau.</p>
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button className="btn btn-sm" style={{ background: 'rgba(255,255,255,.15)', color: 'white', border: 'none' }} onClick={openYearModal}>
                📅 Annees academiques
              </button>
              <button className="btn btn-sm" style={{ background: 'rgba(255,255,255,.15)', color: 'white', border: 'none' }} onClick={() => setView('users')}>
                Gerer les utilisateurs
              </button>
              <button className="btn btn-sm" style={{ background: 'var(--gold)', color: '#fff', border: 'none' }} onClick={openCreateClass}>
                + Nouvelle classe
              </button>
            </div>
          </div>

          {stats && (
            <div className="stats-grid" style={{ marginBottom: 24 }}>
              {[
                { label: 'Classes',     value: stats.total_classes ?? classes.length, cls: 'stat-navy'  },
                { label: 'Etudiants',   value: stats.total_students,                  cls: 'stat-blue'  },
                { label: 'Enseignants', value: stats.total_teachers,                  cls: 'stat-gold'  },
                { label: 'Cours',       value: stats.total_courses,                   cls: 'stat-green' },
              ].map((s, i) => (
                <div key={i} className={`stat-card ${s.cls}`}>
                  <div className="stat-label">{s.label}</div>
                  <div className="stat-value">{s.value ?? '—'}</div>
                </div>
              ))}
            </div>
          )}

          <input className="form-input" placeholder="Rechercher une classe..." value={search}
            onChange={e => setSearch(e.target.value)} style={{ maxWidth: 360, marginBottom: 20 }} />

          {filteredClasses.length === 0 ? (
            <div className="empty-state"><h3>Aucune classe</h3><p>Creez la premiere classe pour commencer.</p></div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(280px,1fr))', gap: 16 }}>
              {filteredClasses.map(cls => (
                <ClassCard key={cls.id} cls={cls}
                  onClick={() => openClass(cls)}
                  onEdit={e => openEditClass(cls, e)}
                  onDelete={e => deleteClass(cls.id, e)} />
              ))}
            </div>
          )}
        </>
      )}

      {/* ── VUE UTILISATEURS ── */}
      {view === 'users' && (
        <UsersView allUsers={allUsers} onBack={() => setView('classes')}
          onCreateUser={openCreateUser} onEditUser={openEditUser}
          onToggleActive={toggleActive} onDeleteUser={deleteUser} />
      )}

      {/* MODAL ANNEES */}
      {yearModal && (
        <div className="modal-overlay" onClick={() => setYearModal(false)}>
          <div className="modal" style={{ maxWidth: 620, width: '95vw', maxHeight: '90vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">📅 Annees academiques</span>
              <button className="modal-close" onClick={() => setYearModal(false)}>×</button>
            </div>
            <div className="modal-body">
              <div style={{ marginBottom: 24 }}>
                <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--navy)', marginBottom: 12 }}>
                  Annees existantes ({years.length})
                </div>
                {years.length === 0 ? (
                  <div style={{ color: 'var(--text-muted)', fontSize: 13, padding: 16, background: '#f8fafc', borderRadius: 10 }}>
                    Aucune annee. Creez-en une ci-dessous.
                  </div>
                ) : years.map(yr => (
                  <div key={yr.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderRadius: 10, marginBottom: 8, border: `1.5px solid ${yr.is_current ? '#22c55e' : 'var(--border)'}`, background: yr.is_current ? '#f0fdf4' : 'white' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--navy)' }}>
                        {yr.name}
                        {yr.is_current && <span style={{ marginLeft: 8, fontSize: 10, background: '#22c55e', color: '#fff', padding: '2px 8px', borderRadius: 20, fontWeight: 800 }}>COURANTE</span>}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                        {yr.start_date ? new Date(yr.start_date).toLocaleDateString('fr-FR') : '?'}
                        {' → '}
                        {yr.end_date ? new Date(yr.end_date).toLocaleDateString('fr-FR') : '?'}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      {!yr.is_current && (
                        <button className="btn btn-outline btn-sm" style={{ fontSize: 11 }} onClick={() => setCurrentYear(yr)}>
                          Definir courante
                        </button>
                      )}
                      <button className="btn btn-outline btn-sm" style={{ fontSize: 11 }}
                        onClick={() => {
                          setEditYear(yr)
                          setNewYearForm({ name: yr.name, start_date: yr.start_date?.slice(0, 10) || '', end_date: yr.end_date?.slice(0, 10) || '', is_current: yr.is_current })
                        }}>
                        Modifier
                      </button>
                      <button className="btn btn-danger btn-sm" style={{ fontSize: 11 }} onClick={() => deleteYear(yr)}>
                        Supprimer
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              <div style={{ padding: 16, background: '#f0f9ff', borderRadius: 12, border: '1px solid #bae6fd' }}>
                <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--navy)', marginBottom: 14 }}>
                  {editYear ? `Modifier "${editYear.name}"` : 'Nouvelle annee'}
                </div>
                <div className="form-group">
                  <label className="form-label">Nom *</label>
                  <input className="form-input" value={newYearForm.name}
                    onChange={e => setNewYearForm(f => ({ ...f, name: e.target.value }))}
                    placeholder="Ex : 2025-2026" />
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Date de debut *</label>
                    <input className="form-input" type="date" value={newYearForm.start_date}
                      onChange={e => setNewYearForm(f => ({ ...f, start_date: e.target.value }))} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Date de fin *</label>
                    <input className="form-input" type="date" value={newYearForm.end_date}
                      onChange={e => setNewYearForm(f => ({ ...f, end_date: e.target.value }))} />
                  </div>
                </div>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, marginBottom: 14 }}>
                  <input type="checkbox" checked={newYearForm.is_current}
                    onChange={e => setNewYearForm(f => ({ ...f, is_current: e.target.checked }))}
                    style={{ width: 15, height: 15 }} />
                  Definir comme annee courante
                </label>
                <div style={{ display: 'flex', gap: 8 }}>
                  {editYear && (
                    <button className="btn btn-outline btn-sm"
                      onClick={() => { setEditYear(null); setNewYearForm({ name: '', start_date: '', end_date: '', is_current: false }) }}>
                      Annuler
                    </button>
                  )}
                  <button className="btn btn-primary" onClick={saveYear} disabled={savingYear} style={{ flex: 1 }}>
                    {savingYear ? 'Enregistrement...' : editYear ? 'Enregistrer les modifications' : "Creer l'annee"}
                  </button>
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-primary" onClick={() => setYearModal(false)}>Fermer</button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL CLASSE */}
      {classModal && (
        <div className="modal-overlay" onClick={() => setClassModal(false)}>
          <div className="modal" style={{ maxWidth: 560, width: '95vw', maxHeight: '92vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">{editClass ? 'Modifier la classe' : 'Nouvelle classe'}</span>
              <button className="modal-close" onClick={() => setClassModal(false)}>×</button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">Nom *</label>
                <input className="form-input" value={classForm.name}
                  onChange={e => setClassForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="Ex : L1 Informatique" />
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Code</label>
                  <input className="form-input" value={classForm.code}
                    onChange={e => setClassForm(f => ({ ...f, code: e.target.value }))}
                    placeholder="Ex : L1-INFO" />
                </div>
                <div className="form-group">
                  <label className="form-label">Niveau</label>
                  <select className="form-select" value={classForm.level}
                    onChange={e => setClassForm(f => ({ ...f, level: e.target.value }))}>
                    <option value="">-- Selectionner --</option>
                    {['Licence 1', 'Licence 2', 'Licence 3', 'Master 1', 'Master 2', 'Doctorat', 'BTS', 'Autre'].map(l =>
                      <option key={l} value={l}>{l}</option>
                    )}
                  </select>
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Description</label>
                <textarea className="form-input" rows={2} value={classForm.description}
                  onChange={e => setClassForm(f => ({ ...f, description: e.target.value }))}
                  style={{ resize: 'vertical' }} />
              </div>

              {/* Année académique */}
              <div className="form-group">
                <label className="form-label">Annee academique</label>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <select className="form-select" style={{ flex: 1 }} value={classForm.academic_year_id}
                    onChange={e => setClassForm(f => ({ ...f, academic_year_id: e.target.value }))}>
                    <option value="">-- Choisir --</option>
                    {years.map(y => (
                      <option key={y.id} value={y.id}>{y.name}{y.is_current ? ' (courante)' : ''}</option>
                    ))}
                  </select>
                  <button type="button" className="btn btn-outline btn-sm"
                    style={{ whiteSpace: 'nowrap', flexShrink: 0 }}
                    onClick={() => setShowNewYear(v => !v)}>
                    {showNewYear ? 'Annuler' : '+ Nouvelle'}
                  </button>
                </div>
                {classForm.academic_year_id && !showNewYear && (
                  <div style={{ marginTop: 6, fontSize: 12, color: 'var(--success)', fontWeight: 600 }}>
                    {years.find(y => String(y.id) === classForm.academic_year_id)?.name}
                  </div>
                )}
                {showNewYear && (
                  <div style={{ marginTop: 12, padding: 16, background: '#f0f9ff', borderRadius: 10, border: '1px solid #bae6fd' }}>
                    <div className="form-group">
                      <label className="form-label">Nom *</label>
                      <input className="form-input" value={newYearForm.name}
                        onChange={e => setNewYearForm(f => ({ ...f, name: e.target.value }))}
                        placeholder="Ex : 2025-2026" />
                    </div>
                    <div className="form-row">
                      <div className="form-group">
                        <label className="form-label">Debut *</label>
                        <input className="form-input" type="date" value={newYearForm.start_date}
                          onChange={e => setNewYearForm(f => ({ ...f, start_date: e.target.value }))} />
                      </div>
                      <div className="form-group">
                        <label className="form-label">Fin *</label>
                        <input className="form-input" type="date" value={newYearForm.end_date}
                          onChange={e => setNewYearForm(f => ({ ...f, end_date: e.target.value }))} />
                      </div>
                    </div>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, marginBottom: 12 }}>
                      <input type="checkbox" checked={newYearForm.is_current}
                        onChange={e => setNewYearForm(f => ({ ...f, is_current: e.target.checked }))}
                        style={{ width: 15, height: 15 }} />
                      Marquer comme courante
                    </label>
                    <button type="button" className="btn btn-primary btn-sm"
                      onClick={createYearInline} disabled={savingYear} style={{ width: '100%' }}>
                      {savingYear ? 'Creation...' : 'Creer et selectionner'}
                    </button>
                  </div>
                )}
              </div>

              <div className="form-group">
                <label className="form-label">Enseignant responsable</label>
                <select className="form-select" value={classForm.teacher_id}
                  onChange={e => setClassForm(f => ({ ...f, teacher_id: e.target.value }))}>
                  <option value="">-- Selectionner --</option>
                  {teachers.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Capacite max</label>
                  <input className="form-input" type="number" min={1} value={classForm.max_students}
                    onChange={e => setClassForm(f => ({ ...f, max_students: parseInt(e.target.value) }))} />
                </div>
                <div className="form-group" style={{ display: 'flex', alignItems: 'flex-end', paddingBottom: 4 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                    <input type="checkbox" checked={classForm.is_active}
                      onChange={e => setClassForm(f => ({ ...f, is_active: e.target.checked }))}
                      style={{ width: 16, height: 16 }} />
                    <span className="form-label" style={{ margin: 0 }}>Classe active</span>
                  </label>
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-outline" onClick={() => setClassModal(false)}>Annuler</button>
              <button className="btn btn-primary" onClick={saveClass}>{editClass ? 'Enregistrer' : 'Creer'}</button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL UTILISATEUR — PREMIUM */}
      {userModal && (
        <div className="modal-overlay" onClick={() => setUserModal(false)}>
          <div className="modal" style={{ maxWidth: 520, width: '95vw', maxHeight: '95vh', overflowY: 'auto', borderRadius: 24, padding: 0 }} onClick={e => e.stopPropagation()}>

            {/* En-tête coloré */}
            <div style={{
              background: 'linear-gradient(135deg, #0f1f3d 0%, #1a3a6e 100%)',
              borderRadius: '24px 24px 0 0',
              padding: '28px 32px 24px',
              color: '#fff',
              position: 'relative',
              overflow: 'hidden',
            }}>
              <div style={{ position: 'absolute', top: -30, right: -30, width: 140, height: 140, borderRadius: '50%', background: 'rgba(99,102,241,.15)', pointerEvents: 'none' }} />
              <div style={{ position: 'absolute', bottom: -20, left: '40%', width: 100, height: 100, borderRadius: '50%', background: 'rgba(14,165,233,.1)', pointerEvents: 'none' }} />
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'relative' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  <div style={{ width: 48, height: 48, borderRadius: 14, background: 'rgba(255,255,255,.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, backdropFilter: 'blur(8px)' }}>
                    {editUser ? '✏️' : '👤'}
                  </div>
                  <div>
                    <div style={{ fontFamily: 'Playfair Display, serif', fontSize: 20, fontWeight: 800 }}>
                      {editUser ? 'Modifier l\'utilisateur' : 'Nouvel utilisateur'}
                    </div>
                    <div style={{ fontSize: 12, opacity: .6, marginTop: 2 }}>
                      {editUser ? `Modification de ${editUser.name}` : 'Créer un compte sur UniLearn'}
                    </div>
                  </div>
                </div>
                <button onClick={() => setUserModal(false)} style={{ background: 'rgba(255,255,255,.12)', border: 'none', color: '#fff', width: 34, height: 34, borderRadius: 10, cursor: 'pointer', fontSize: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(8px)' }}>×</button>
              </div>
            </div>

            <form onSubmit={saveUser}>
              <div style={{ padding: '28px 32px', display: 'flex', flexDirection: 'column', gap: 20 }}>

                {/* Sélection du rôle par cartes */}
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 1 }}>
                    Rôle *
                  </label>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
                    {[
                      { value: 'student',  label: 'Étudiant',     icon: '🎓', color: '#22c55e', desc: 'Accès aux cours' },
                      { value: 'teacher',  label: 'Enseignant',   icon: '👨‍🏫', color: '#0ea5e9', desc: 'Gère ses cours' },
                      { value: 'admin',    label: 'Admin',        icon: '⚙️', color: '#8b5cf6', desc: 'Accès total' },
                    ].map(r => (
                      <div key={r.value}
                        onClick={() => setUserForm(f => ({ ...f, role: r.value }))}
                        style={{
                          padding: '14px 12px',
                          borderRadius: 14,
                          border: `2px solid ${userForm.role === r.value ? r.color : '#e2e8f0'}`,
                          background: userForm.role === r.value ? `${r.color}10` : '#fafafa',
                          cursor: 'pointer',
                          textAlign: 'center',
                          transition: 'all .18s ease',
                          transform: userForm.role === r.value ? 'translateY(-2px)' : 'none',
                          boxShadow: userForm.role === r.value ? `0 6px 20px ${r.color}25` : 'none',
                        }}
                      >
                        <div style={{ fontSize: 26, marginBottom: 6 }}>{r.icon}</div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: userForm.role === r.value ? r.color : '#374151' }}>{r.label}</div>
                        <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 2 }}>{r.desc}</div>
                        {userForm.role === r.value && (
                          <div style={{ width: 6, height: 6, borderRadius: '50%', background: r.color, margin: '6px auto 0' }} />
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Nom complet */}
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 }}>
                    Nom complet *
                  </label>
                  <div style={{ position: 'relative' }}>
                    <span style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', fontSize: 16, pointerEvents: 'none' }}>👤</span>
                    <input
                      style={{ width: '100%', padding: '13px 14px 13px 44px', borderRadius: 12, border: '2px solid #e2e8f0', fontSize: 14, fontFamily: 'inherit', outline: 'none', transition: 'border-color .2s', boxSizing: 'border-box' }}
                      required value={userForm.name}
                      onChange={e => setUserForm(f => ({ ...f, name: e.target.value }))}
                      placeholder="Ex : Amadou Diallo"
                      onFocus={e => e.target.style.borderColor = '#6366f1'}
                      onBlur={e => e.target.style.borderColor = '#e2e8f0'}
                    />
                  </div>
                </div>

                {/* Email + Mot de passe (création uniquement) */}
                {!editUser && (
                  <>
                    <div>
                      <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 }}>
                        Adresse email *
                      </label>
                      <div style={{ position: 'relative' }}>
                        <span style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', fontSize: 16, pointerEvents: 'none' }}>✉️</span>
                        <input
                          style={{ width: '100%', padding: '13px 14px 13px 44px', borderRadius: 12, border: '2px solid #e2e8f0', fontSize: 14, fontFamily: 'inherit', outline: 'none', transition: 'border-color .2s', boxSizing: 'border-box' }}
                          type="email" required value={userForm.email}
                          onChange={e => setUserForm(f => ({ ...f, email: e.target.value }))}
                          placeholder="prenom.nom@univ-ndere.cm"
                          onFocus={e => e.target.style.borderColor = '#6366f1'}
                          onBlur={e => e.target.style.borderColor = '#e2e8f0'}
                        />
                      </div>
                    </div>

                    <div>
                      <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 }}>
                        Mot de passe *
                      </label>
                      <div style={{ position: 'relative' }}>
                        <span style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', fontSize: 16, pointerEvents: 'none' }}>🔒</span>
                        <input
                          style={{ width: '100%', padding: '13px 14px 13px 44px', borderRadius: 12, border: '2px solid #e2e8f0', fontSize: 14, fontFamily: 'inherit', outline: 'none', transition: 'border-color .2s', boxSizing: 'border-box' }}
                          type="password" required minLength={6} value={userForm.password}
                          onChange={e => setUserForm(f => ({ ...f, password: e.target.value }))}
                          placeholder="Minimum 6 caractères"
                          onFocus={e => e.target.style.borderColor = '#6366f1'}
                          onBlur={e => e.target.style.borderColor = '#e2e8f0'}
                        />
                      </div>
                      {/* Indicateur force mot de passe */}
                      {userForm.password && (
                        <div style={{ marginTop: 8 }}>
                          <div style={{ display: 'flex', gap: 4, marginBottom: 4 }}>
                            {[1,2,3,4].map(i => {
                              const strength = userForm.password.length < 6 ? 0 : userForm.password.length < 8 ? 1 : userForm.password.length < 10 && /[A-Z]/.test(userForm.password) ? 2 : /[A-Z]/.test(userForm.password) && /[0-9]/.test(userForm.password) ? 3 : 2
                              const colors = ['#ef4444','#f59e0b','#0ea5e9','#22c55e']
                              const labels = ['Faible','Moyen','Fort','Très fort']
                              return (
                                <div key={i} style={{ flex: 1, height: 4, borderRadius: 2, background: i <= strength ? colors[strength] : '#e2e8f0', transition: 'background .2s' }} />
                              )
                            })}
                          </div>
                          <div style={{ fontSize: 11, color: '#64748b' }}>
                            Force : <strong style={{ color: userForm.password.length < 6 ? '#ef4444' : userForm.password.length < 8 ? '#f59e0b' : '#22c55e' }}>
                              {userForm.password.length < 6 ? 'Trop court' : userForm.password.length < 8 ? 'Moyen' : /[A-Z]/.test(userForm.password) && /[0-9]/.test(userForm.password) ? 'Très fort' : 'Fort'}
                            </strong>
                          </div>
                        </div>
                      )}
                    </div>
                  </>
                )}

                {/* Résumé du compte */}
                {(userForm.name || userForm.email) && (
                  <div style={{ background: '#f8fafc', borderRadius: 14, padding: '14px 16px', border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: 14 }}>
                    <div style={{
                      width: 44, height: 44, borderRadius: '50%', flexShrink: 0,
                      background: userForm.role === 'admin' ? '#8b5cf620' : userForm.role === 'teacher' ? '#0ea5e920' : '#22c55e20',
                      color: userForm.role === 'admin' ? '#8b5cf6' : userForm.role === 'teacher' ? '#0ea5e9' : '#22c55e',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontWeight: 700, fontSize: 15,
                    }}>
                      {userForm.name?.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2) || '??'}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: 14, color: '#0f1f3d', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {userForm.name || 'Nom non saisi'}
                      </div>
                      <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {userForm.email || 'Email non saisi'} · {userForm.role === 'admin' ? 'Administrateur' : userForm.role === 'teacher' ? 'Enseignant' : 'Étudiant'}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Footer */}
              <div style={{ padding: '0 32px 28px', display: 'flex', gap: 10 }}>
                <button type="button"
                  onClick={() => setUserModal(false)}
                  style={{ flex: 1, padding: '13px', borderRadius: 12, border: '1.5px solid #e2e8f0', background: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer', color: '#374151', fontFamily: 'inherit', transition: 'all .15s' }}
                  onMouseEnter={e => e.currentTarget.style.background = '#f1f5f9'}
                  onMouseLeave={e => e.currentTarget.style.background = '#fff'}
                >
                  Annuler
                </button>
                <button type="submit"
                  style={{ flex: 2, padding: '13px', borderRadius: 12, border: 'none', background: 'linear-gradient(135deg, #6366f1, #0ea5e9)', color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', boxShadow: '0 6px 20px rgba(99,102,241,.3)', transition: 'all .2s', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
                  onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 10px 28px rgba(99,102,241,.4)' }}
                  onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = '0 6px 20px rgba(99,102,241,.3)' }}
                >
                  {editUser ? '💾 Enregistrer' : '✨ Créer le compte'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL COURS */}
      {courseModal && (
        <div className="modal-overlay" onClick={() => setCourseModal(false)}>
          <div className="modal" style={{ maxWidth: 580, width: '95vw', maxHeight: '92vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">{editCourse ? 'Modifier le cours' : 'Nouveau cours'}</span>
              <button className="modal-close" onClick={closeCourseModal}>×</button>
            </div>
            <form onSubmit={saveCourse}>
              <div className="modal-body">
                <ThumbnailField
                  courseId={savedCourseId}
                  currentUrl={thumbUrl(editCourse?.thumbnail)}
                  onFile={file => setPendingThumb(file)}
                  onUploaded={url => setEditCourse(c => ({ ...(c || {}), thumbnail: url }))}
                />
                <div className="form-group">
                  <label className="form-label">Titre *</label>
                  <input className="form-input" required value={courseForm.title}
                    onChange={e => setCourseForm({ ...courseForm, title: e.target.value })}
                    placeholder="Ex : Introduction aux reseaux" />
                </div>
                <div className="form-group">
                  <label className="form-label">Description</label>
                  <textarea className="form-input" rows={3} value={courseForm.description}
                    onChange={e => setCourseForm({ ...courseForm, description: e.target.value })}
                    style={{ resize: 'vertical' }} />
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Enseignant *</label>
                    <select className="form-select" required value={courseForm.teacher_id}
                      onChange={e => setCourseForm({ ...courseForm, teacher_id: e.target.value })}>
                      <option value="">-- Choisir --</option>
                      {teachers.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Categorie</label>
                    <select className="form-select" value={courseForm.category_id}
                      onChange={e => setCourseForm({ ...courseForm, category_id: e.target.value })}>
                      <option value="">Sans categorie</option>
                      {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">Statut</label>
                  <select className="form-select" value={courseForm.is_published}
                    onChange={e => setCourseForm({ ...courseForm, is_published: e.target.value === 'true' })}>
                    <option value="true">Publie</option>
                    <option value="false">Brouillon</option>
                  </select>
                </div>
                {savedCourseId && (
                  <div style={{ padding: '10px 14px', borderRadius: 10, background: '#f0fdf4', border: '1px solid #bbf7d0', color: '#16a34a', fontSize: 13, fontWeight: 600 }}>
                    Cours cree ! Modifiez l'image si besoin puis fermez.
                  </div>
                )}
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-outline" onClick={closeCourseModal}>
                  {savedCourseId ? 'Fermer' : 'Annuler'}
                </button>
                {!savedCourseId ? (
                  <button type="submit" className="btn btn-primary">Creer le cours</button>
                ) : (
                  <button type="submit" className="btn btn-primary">Enregistrer les modifications</button>
                )}
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}

function ClassCard({ cls, onClick, onEdit, onDelete }) {
  const c   = lvlColor(cls.level)
  const pct = cls.max_students > 0 ? Math.round(cls.student_count / cls.max_students * 100) : 0
  return (
    <div onClick={onClick} style={{ background: 'white', borderRadius: 14, overflow: 'hidden', border: '1px solid var(--border)', cursor: 'pointer', transition: 'transform .18s,box-shadow .18s', borderTop: `4px solid ${c}` }}
      onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-3px)'; e.currentTarget.style.boxShadow = '0 8px 24px rgba(0,0,0,.10)' }}
      onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = 'none' }}>
      <div style={{ padding: '18px 20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 16, color: 'var(--navy)', marginBottom: 3 }}>{cls.name}</div>
            {cls.code && <span style={{ fontSize: 11, background: '#f1f5f9', color: '#64748b', padding: '2px 8px', borderRadius: 20, fontWeight: 600 }}>{cls.code}</span>}
          </div>
          <span style={{ fontSize: 11, padding: '3px 10px', borderRadius: 20, fontWeight: 700, background: cls.is_active ? '#dcfce7' : '#f1f5f9', color: cls.is_active ? '#166534' : '#64748b' }}>
            {cls.is_active ? 'Active' : 'Inactive'}
          </span>
        </div>
        {cls.level && <div style={{ fontSize: 12, color: c, fontWeight: 600, marginBottom: 6 }}>{cls.level}</div>}
        {cls.teacher_name && <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>Enseignant : {cls.teacher_name}</div>}
        {cls.academic_year_name && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8 }}>📅 {cls.academic_year_name}</div>}
        <div style={{ display: 'flex', gap: 16, marginBottom: 10 }}>
          <div>
            <div style={{ fontSize: 20, fontWeight: 800, color: '#3b82f6' }}>{cls.student_count}</div>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: .5 }}>etudiants</div>
          </div>
          <div>
            <div style={{ fontSize: 20, fontWeight: 800, color: '#10b981' }}>{cls.course_count}</div>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: .5 }}>cours</div>
          </div>
        </div>
        <div style={{ height: 4, background: '#f1f5f9', borderRadius: 4, overflow: 'hidden', marginBottom: 4 }}>
          <div style={{ height: '100%', width: `${pct}%`, background: c, borderRadius: 4, transition: 'width .4s' }} />
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 12 }}>{cls.student_count}/{cls.max_students} places</div>
        <div style={{ display: 'flex', gap: 6 }} onClick={e => e.stopPropagation()}>
          <button className="btn btn-outline btn-sm" onClick={onEdit} style={{ fontSize: 11, padding: '3px 10px' }}>Modifier</button>
          <button className="btn btn-danger btn-sm" onClick={onDelete} style={{ fontSize: 11, padding: '3px 10px' }}>Supprimer</button>
        </div>
      </div>
    </div>
  )
}

function UsersView({ allUsers, onBack, onCreateUser, onEditUser, onToggleActive, onDeleteUser }) {
  const [tab,    setTab]    = useState('students')
  const [search, setSearch] = useState('')
  const roleColor = { admin: '#8B5CF6', teacher: '#0EA5E9', student: '#10B981' }
  const filtered = allUsers
    .filter(u => u.role === (tab === 'teachers' ? 'teacher' : tab === 'admins' ? 'admin' : 'student'))
    .filter(u => u.name.toLowerCase().includes(search.toLowerCase()) || u.email.toLowerCase().includes(search.toLowerCase()))
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20, fontSize: 14 }}>
        <button onClick={onBack} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#3b82f6', fontWeight: 600, padding: 0, fontSize: 14 }}>
          ← Retour aux classes
        </button>
        <span style={{ color: 'var(--text-muted)' }}>/</span>
        <span style={{ color: 'var(--navy)', fontWeight: 700 }}>Gestion des utilisateurs</span>
      </div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
        {['students', 'teachers', 'admins'].map(t => (
          <button key={t} onClick={() => setTab(t)} className={`btn btn-sm ${tab === t ? 'btn-primary' : 'btn-outline'}`}>
            {t === 'students' ? 'Etudiants' : t === 'teachers' ? 'Enseignants' : 'Admins'}
            <span style={{ marginLeft: 6, opacity: .7, fontSize: 11 }}>
              ({allUsers.filter(u => u.role === (t === 'teachers' ? 'teacher' : t === 'admins' ? 'admin' : 'student')).length})
            </span>
          </button>
        ))}
        <button className="btn btn-primary btn-sm" style={{ marginLeft: 'auto' }}
          onClick={() => onCreateUser(tab === 'teachers' ? 'teacher' : tab === 'admins' ? 'admin' : 'student')}>
          + Nouvel utilisateur
        </button>
      </div>
      <input className="form-input" placeholder="Rechercher..." value={search}
        onChange={e => setSearch(e.target.value)} style={{ maxWidth: 360, marginBottom: 16 }} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {filtered.length === 0 ? (
          <div className="empty-state"><h3>Aucun utilisateur</h3></div>
        ) : filtered.map(u => (
          <div key={u.id} className="card">
            <div className="card-body" style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{ width: 38, height: 38, borderRadius: '50%', flexShrink: 0, background: `${roleColor[u.role]}22`, color: roleColor[u.role], display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 13 }}>
                {u.name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--navy)' }}>{u.name}</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{u.email}</div>
              </div>
              <span style={{ fontSize: 11, padding: '2px 10px', borderRadius: 20, background: u.is_active ? '#d1fae5' : '#fee2e2', color: u.is_active ? '#065f46' : '#991b1b' }}>
                {u.is_active ? 'Actif' : 'Inactif'}
              </span>
              <div style={{ display: 'flex', gap: 6 }}>
                <button className="btn btn-outline btn-sm" onClick={() => onEditUser(u)}>Modifier</button>
                <button className="btn btn-outline btn-sm" onClick={() => onToggleActive(u)}>
                  {u.is_active ? 'Desactiver' : 'Activer'}
                </button>
                <button className="btn btn-danger btn-sm" onClick={() => onDeleteUser(u.id)}>Supprimer</button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
