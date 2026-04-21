/**
 * AdminDashboard.jsx
 * Flux : Classes -> detail classe -> [Cours | Etudiants | Enseignants | Inscriptions | Resultats]
 */
import { useEffect, useState, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../api/client'

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

export default function AdminDashboard() {
  const navigate = useNavigate()
  const [msg, flash] = useFlash()

  const [stats,      setStats]      = useState(null)
  const [classes,    setClasses]    = useState([])
  const [allUsers,   setAllUsers]   = useState([])
  const [categories, setCategories] = useState([])
  const [years,      setYears]      = useState([])   // ✅ années académiques
  const [loading,    setLoading]    = useState(true)

  const [view,        setView]        = useState('classes')
  const [selClass,    setSelClass]    = useState(null)
  const [classDetail, setClassDetail] = useState(null)
  const [detailTab,   setDetailTab]   = useState('courses')
  const [detailLoad,  setDetailLoad]  = useState(false)

  const [classModal,  setClassModal]  = useState(false)
  const [userModal,   setUserModal]   = useState(false)
  const [courseModal, setCourseModal] = useState(false)
  const [editClass,   setEditClass]   = useState(null)
  const [editUser,    setEditUser]    = useState(null)
  const [editCourse,  setEditCourse]  = useState(null)

  /* ✅ classForm avec academic_year_id (sélection) ET academic_year_name (création) */
  const [classForm, setClassForm] = useState({
    name: '', code: '', description: '', level: '',
    academic_year_id: '',   // ID de l'année existante choisie
    teacher_id: '', max_students: 50, is_active: true,
  })

  /* ✅ State pour créer une nouvelle année depuis le modal */
  const [showNewYear,  setShowNewYear]  = useState(false)
  const [newYearForm,  setNewYearForm]  = useState({
    name: '', start_date: '', end_date: '', is_current: false,
  })
  const [savingYear,   setSavingYear]   = useState(false)

  const [userForm,   setUserForm]   = useState({ name: '', email: '', password: '', role: 'student' })
  const [courseForm, setCourseForm] = useState({
    title: '', description: '', category_id: '', teacher_id: '', is_published: true,
  })

  const [enrolled,       setEnrolled]       = useState([])
  const [enrollCourseId, setEnrollCourseId] = useState(null)
  const [studModal,      setStudModal]      = useState(false)
  const [studSearch,     setStudSearch]     = useState('')
  const [selectedStuds,  setSelectedStuds]  = useState([])
  const [search,         setSearch]         = useState('')

  const teachers = useMemo(() => allUsers.filter(u => u.role === 'teacher'), [allUsers])
  const students = useMemo(() => allUsers.filter(u => u.role === 'student'),  [allUsers])

  /* ── Chargement initial ── */
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
      setStats(s.data)
      setClasses(cl.data)
      setAllUsers(u.data)
      setCategories(cat.data)
      setYears(yr.data)
    } catch {
      flash('Erreur de chargement', 'error')
    } finally {
      setLoading(false)
    }
  }, [flash])

  useEffect(() => { loadAll() }, [loadAll])

  /* ── Ouverture detail classe ── */
  const openClass = useCallback(async cls => {
    setSelClass(cls)
    setDetailTab('courses')
    setView('classDetail')
    setDetailLoad(true)
    setClassDetail(null)
    try {
      const { data } = await api.get(`/classes/${cls.id}`)
      setClassDetail(data)
    } catch (err) {
      flash(err.response?.data?.detail || 'Erreur de chargement de la classe', 'error')
    } finally {
      setDetailLoad(false)
    }
  }, [flash])

  const backToClasses = () => { setView('classes'); setSelClass(null); setClassDetail(null) }

  /* ── Classes CRUD ── */
  const openCreateClass = () => {
    setEditClass(null)
    // Pré-sélectionner l'année courante si elle existe
    const currentYear = years.find(y => y.is_current)
    setClassForm({
      name: '', code: '', description: '', level: '',
      academic_year_id: currentYear ? String(currentYear.id) : '',
      teacher_id: '', max_students: 50, is_active: true,
    })
    setShowNewYear(false)
    setNewYearForm({ name: '', start_date: '', end_date: '', is_current: false })
    setClassModal(true)
  }

  const openEditClass = (cls, e) => {
    e?.stopPropagation()
    setEditClass(cls)
    setClassForm({
      name:             cls.name,
      code:             cls.code          || '',
      description:      cls.description   || '',
      level:            cls.level         || '',
      academic_year_id: cls.academic_year_id ? String(cls.academic_year_id) : '',
      teacher_id:       cls.teacher_id    || '',
      max_students:     cls.max_students,
      is_active:        cls.is_active,
    })
    setShowNewYear(false)
    setNewYearForm({ name: '', start_date: '', end_date: '', is_current: false })
    setClassModal(true)
  }

  /* ✅ Créer une nouvelle année académique depuis le modal classe */
  const createYearInline = async () => {
    if (!newYearForm.name.trim()) return flash('Le nom de l\'année est requis', 'error')
    if (!newYearForm.start_date)  return flash('La date de début est requise', 'error')
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
      // Mettre à jour la liste des années et sélectionner la nouvelle
      const newYears = [...years, data].sort((a, b) =>
        new Date(b.start_date) - new Date(a.start_date)
      )
      setYears(newYears)
      setClassForm(f => ({ ...f, academic_year_id: String(data.id) }))
      setShowNewYear(false)
      setNewYearForm({ name: '', start_date: '', end_date: '', is_current: false })
      flash(`Année ${data.name} créée et sélectionnée !`)
    } catch (err) {
      flash(err.response?.data?.detail || 'Erreur création année', 'error')
    } finally {
      setSavingYear(false)
    }
  }

  const saveClass = async () => {
    if (!classForm.name.trim()) return flash('Le nom est requis', 'error')
    const payload = {
      name:             classForm.name,
      code:             classForm.code          || null,
      description:      classForm.description   || null,
      level:            classForm.level         || null,
      academic_year_id: classForm.academic_year_id ? parseInt(classForm.academic_year_id) : null,
      teacher_id:       classForm.teacher_id    ? parseInt(classForm.teacher_id)          : null,
      max_students:     parseInt(classForm.max_students),
      is_active:        classForm.is_active,
    }
    try {
      if (editClass) {
        await api.put(`/classes/${editClass.id}`, payload)
        flash('Classe mise à jour')
        if (classDetail?.id === editClass.id) openClass({ ...editClass, ...payload })
      } else {
        await api.post('/classes', payload)
        flash('Classe créée')
      }
      setClassModal(false)
      loadAll()
    } catch (err) {
      flash(err.response?.data?.detail || 'Erreur', 'error')
    }
  }

  const deleteClass = async (id, e) => {
    e?.stopPropagation()
    if (!confirm('Supprimer cette classe et tout son contenu ?')) return
    try {
      await api.delete(`/classes/${id}`)
      flash('Classe supprimée')
      if (selClass?.id === id) backToClasses()
      loadAll()
    } catch { flash('Erreur suppression', 'error') }
  }

  /* ── Utilisateurs CRUD ── */
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
      if (editUser) {
        await api.put(`/admin/users/${editUser.id}`, { name: userForm.name, role: userForm.role, is_active: editUser.is_active })
        flash('Utilisateur modifié')
      } else {
        await api.post('/admin/users', userForm)
        flash('Utilisateur créé')
      }
      setUserModal(false)
      loadAll()
    } catch (err) { flash(err.response?.data?.detail || 'Erreur', 'error') }
  }

  const toggleActive = async u => {
    await api.put(`/admin/users/${u.id}`, { is_active: !u.is_active })
    flash(`Compte ${u.is_active ? 'désactivé' : 'activé'}`)
    loadAll()
  }

  const deleteUser = async id => {
    if (!confirm('Supprimer cet utilisateur définitivement ?')) return
    try {
      await api.delete(`/admin/users/${id}`)
      flash('Utilisateur supprimé')
      loadAll()
    } catch (err) { flash(err.response?.data?.detail || 'Erreur', 'error') }
  }

  /* ── Cours CRUD ── */
  const openCreateCourse = () => {
    setEditCourse(null)
    setCourseForm({
      title: '', description: '', category_id: '',
      teacher_id: classDetail?.teacher_id ? String(classDetail.teacher_id) : '',
      is_published: true,
    })
    setCourseModal(true)
  }

  const openEditCourse = c => {
    setEditCourse(c)
    setCourseForm({
      title:        c.title,
      description:  c.description  || '',
      category_id:  c.category_id  ? String(c.category_id)  : '',
      teacher_id:   c.teacher_id   ? String(c.teacher_id)   : '',
      is_published: c.is_published,
    })
    setCourseModal(true)
  }

  const saveCourse = async e => {
    e.preventDefault()
    const payload = {
      title:        courseForm.title,
      description:  courseForm.description || null,
      teacher_id:   parseInt(courseForm.teacher_id),
      category_id:  courseForm.category_id ? parseInt(courseForm.category_id) : null,
      is_published: courseForm.is_published,
      class_id:     classDetail?.id,
    }
    try {
      if (editCourse) {
        await api.put(`/admin/courses/${editCourse.id}`, payload)
        flash('Cours modifié')
      } else {
        await api.post('/admin/courses', payload)
        flash('Cours créé')
      }
      setCourseModal(false)
      openClass(selClass)
    } catch (err) { flash(err.response?.data?.detail || 'Erreur', 'error') }
  }

  const deleteCourse = async id => {
    if (!confirm('Supprimer ce cours et toutes ses leçons ?')) return
    try {
      await api.delete(`/admin/courses/${id}`)
      flash('Cours supprimé')
      openClass(selClass)
    } catch (err) { flash(err.response?.data?.detail || 'Erreur', 'error') }
  }

  const togglePublish = async c => {
    await api.put(`/admin/courses/${c.id}`, {
      title: c.title, description: c.description,
      teacher_id: c.teacher_id, is_published: !c.is_published,
    })
    flash(c.is_published ? 'Cours dépublié' : 'Cours publié')
    openClass(selClass)
  }

  /* ── Inscriptions ── */
  const loadEnrolled = useCallback(async courseId => {
    const r = await api.get(`/admin/courses/${courseId}/students`)
    setEnrolled(r.data)
    setEnrollCourseId(courseId)
  }, [])

  const enrollStudent = async studentId => {
    try {
      await api.post(`/admin/courses/${enrollCourseId}/enroll`, { student_ids: [studentId] })
      flash('Étudiant inscrit')
      loadEnrolled(enrollCourseId)
    } catch (err) { flash(err.response?.data?.detail || 'Erreur', 'error') }
  }

  const unenrollStudent = async studentId => {
    await api.delete(`/admin/courses/${enrollCourseId}/students/${studentId}`)
    flash('Étudiant retiré')
    loadEnrolled(enrollCourseId)
  }

  /* ── Étudiants dans la classe ── */
  const openAddStudents = () => {
    const ids = new Set((classDetail?.students || []).map(s => s.id))
    setSelectedStuds([])
    setStudSearch('')
    setStudModal({ open: true, available: students.filter(s => !ids.has(s.id)) })
  }

  const confirmAddStudents = async () => {
    if (!selectedStuds.length) return
    try {
      const { data } = await api.post(`/classes/${classDetail.id}/students`, { student_ids: selectedStuds })
      flash(`${data.added} étudiant(s) ajouté(s)`)
      setStudModal(false)
      openClass(selClass)
    } catch { flash('Erreur', 'error') }
  }

  const removeStudentFromClass = async (sid, name) => {
    if (!confirm(`Retirer ${name} de la classe ?`)) return
    try {
      await api.delete(`/classes/${classDetail.id}/students/${sid}`)
      flash(`${name} retiré(e)`)
      openClass(selClass)
    } catch { flash('Erreur', 'error') }
  }

  /* ── Export CSV ── */
  const exportCSV = async () => {
    try {
      const { data } = await api.get(`/classes/${classDetail.id}/results`)
      const e = data.exams || [], h = data.homeworks || []
      const header = ['Etudiant', 'Matricule', ...e.map(x => `Exam:${x.title}`), ...h.map(x => `Devoir:${x.title}`)].join(';')
      const rows = data.students.map(s => [
        s.student_name, s.matricule || '',
        ...e.map(x => { const r = s.exams[x.id]; return r?.submitted ? `${r.score ?? '?'}/${r.max ?? '?'}` : 'NS' }),
        ...h.map(x => { const r = s.homeworks[x.id]; return r?.submitted ? `${r.score ?? '?'}/${r.max}` : 'NS' }),
      ].join(';')).join('\n')
      const a = Object.assign(document.createElement('a'), {
        href: URL.createObjectURL(new Blob(['\uFEFF' + header + '\n' + rows], { type: 'text/csv;charset=utf-8;' })),
        download: `resultats_${classDetail.name}.csv`,
      })
      a.click()
    } catch { flash('Erreur export', 'error') }
  }

  const filteredClasses = classes.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    (c.code || '').toLowerCase().includes(search.toLowerCase())
  )

  const availableForEnroll = useMemo(
    () => students.filter(s => !enrolled.find(e => e.id === s.id)),
    [students, enrolled]
  )

  if (loading) return <div className="loading-overlay"><div className="spinner" /></div>

  return (
    <>
      <Alert msg={msg} />

      {/* ── VUE LISTE CLASSES ── */}
      {view === 'classes' && (
        <>
          <div style={{
            background: 'linear-gradient(135deg, var(--navy), #1a3a6e)',
            borderRadius: 16, padding: '28px 32px', marginBottom: 28,
            color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16,
          }}>
            <div>
              <h2 style={{ fontFamily: 'Playfair Display, serif', fontSize: 22, margin: 0 }}>Administration UniLearn</h2>
              <p style={{ opacity: .6, fontSize: 13, marginTop: 6 }}>Gérez vos classes, enseignants, étudiants et cours depuis ce panneau.</p>
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button className="btn btn-sm" style={{ background: 'rgba(255,255,255,.15)', color: 'white', border: 'none' }}
                onClick={() => setView('users')}>Gérer les utilisateurs</button>
              <button className="btn btn-sm" style={{ background: 'var(--gold)', color: '#fff', border: 'none' }}
                onClick={openCreateClass}>+ Nouvelle classe</button>
            </div>
          </div>

          {stats && (
            <div className="stats-grid" style={{ marginBottom: 24 }}>
              {[
                { label: 'Classes',     value: stats.total_classes  ?? classes.length, cls: 'stat-navy'  },
                { label: 'Etudiants',   value: stats.total_students,                   cls: 'stat-blue'  },
                { label: 'Enseignants', value: stats.total_teachers,                   cls: 'stat-gold'  },
                { label: 'Cours',       value: stats.total_courses,                    cls: 'stat-green' },
              ].map((s, i) => (
                <div key={i} className={`stat-card ${s.cls}`}>
                  <div className="stat-label">{s.label}</div>
                  <div className="stat-value">{s.value ?? '—'}</div>
                </div>
              ))}
            </div>
          )}

          <input className="form-input" placeholder="Rechercher une classe..."
            value={search} onChange={e => setSearch(e.target.value)}
            style={{ maxWidth: 360, marginBottom: 20 }} />

          {filteredClasses.length === 0 ? (
            <div className="empty-state"><h3>Aucune classe</h3><p>Créez la première classe pour commencer.</p></div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
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

      {/* ── VUE DETAIL CLASSE ── */}
      {view === 'classDetail' && selClass && (
        <ClassDetailView
          selClass={selClass}
          classDetail={classDetail}
          detailTab={detailTab}
          setDetailTab={setDetailTab}
          detailLoad={detailLoad}
          teachers={teachers}
          students={students}
          enrolled={enrolled}
          enrollCourseId={enrollCourseId}
          availableForEnroll={availableForEnroll}
          onBack={backToClasses}
          onEdit={e => openEditClass(selClass, e)}
          onExport={exportCSV}
          onCreateCourse={openCreateCourse}
          onEditCourse={openEditCourse}
          onDeleteCourse={deleteCourse}
          onTogglePublish={togglePublish}
          onLoadEnrolled={loadEnrolled}
          onEnroll={enrollStudent}
          onUnenroll={unenrollStudent}
          onAddStudents={openAddStudents}
          onRemoveStudent={removeStudentFromClass}
          navigate={navigate}
        />
      )}

      {/* ── VUE UTILISATEURS ── */}
      {view === 'users' && (
        <UsersView
          allUsers={allUsers}
          onBack={() => setView('classes')}
          onCreateUser={openCreateUser}
          onEditUser={openEditUser}
          onToggleActive={toggleActive}
          onDeleteUser={deleteUser}
        />
      )}

      {/* ════════════ MODAL CLASSE ════════════ */}
      {classModal && (
        <div className="modal-overlay" onClick={() => setClassModal(false)}>
          <div className="modal" style={{ maxWidth: 560, width: '95vw', maxHeight: '92vh', overflowY: 'auto' }}
            onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">{editClass ? 'Modifier la classe' : 'Nouvelle classe'}</span>
              <button className="modal-close" onClick={() => setClassModal(false)}>x</button>
            </div>
            <div className="modal-body">

              {/* Nom */}
              <div className="form-group">
                <label className="form-label">Nom *</label>
                <input className="form-input" value={classForm.name}
                  onChange={e => setClassForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="Ex : L1 Informatique" />
              </div>

              {/* Code + Niveau */}
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
                    <option value="">-- Sélectionner --</option>
                    {['Licence 1', 'Licence 2', 'Licence 3', 'Master 1', 'Master 2', 'Doctorat', 'BTS', 'Autre'].map(l =>
                      <option key={l} value={l}>{l}</option>
                    )}
                  </select>
                </div>
              </div>

              {/* Description */}
              <div className="form-group">
                <label className="form-label">Description</label>
                <textarea className="form-input" rows={2} value={classForm.description}
                  onChange={e => setClassForm(f => ({ ...f, description: e.target.value }))}
                  style={{ resize: 'vertical' }} />
              </div>

              {/* ✅ ANNÉE ACADÉMIQUE — sélection ou création */}
              <div className="form-group">
                <label className="form-label">Année académique</label>

                {/* Sélecteur d'années existantes */}
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <select
                    className="form-select"
                    style={{ flex: 1 }}
                    value={classForm.academic_year_id}
                    onChange={e => setClassForm(f => ({ ...f, academic_year_id: e.target.value }))}
                  >
                    <option value="">-- Choisir une année --</option>
                    {years.map(y => (
                      <option key={y.id} value={y.id}>
                        {y.name}{y.is_current ? ' ✓ (courante)' : ''}
                      </option>
                    ))}
                  </select>
                  {/* Bouton pour créer une nouvelle année */}
                  <button
                    type="button"
                    className="btn btn-outline btn-sm"
                    style={{ whiteSpace: 'nowrap', flexShrink: 0 }}
                    onClick={() => setShowNewYear(v => !v)}
                  >
                    {showNewYear ? '✕ Annuler' : '+ Nouvelle année'}
                  </button>
                </div>

                {/* Afficher l'année sélectionnée */}
                {classForm.academic_year_id && !showNewYear && (
                  <div style={{ marginTop: 6, fontSize: 12, color: 'var(--success)', fontWeight: 600 }}>
                    ✓ {years.find(y => String(y.id) === classForm.academic_year_id)?.name}
                  </div>
                )}

                {/* ✅ Formulaire inline de création d'année */}
                {showNewYear && (
                  <div style={{
                    marginTop: 12, padding: 16, background: '#f0f9ff',
                    borderRadius: 10, border: '1px solid #bae6fd',
                  }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--navy)', marginBottom: 12 }}>
                      📅 Créer une nouvelle année académique
                    </div>

                    {/* Nom de l'année */}
                    <div className="form-group">
                      <label className="form-label">Nom *</label>
                      <input
                        className="form-input"
                        value={newYearForm.name}
                        onChange={e => setNewYearForm(f => ({ ...f, name: e.target.value }))}
                        placeholder="Ex : 2025-2026"
                      />
                    </div>

                    {/* Dates */}
                    <div className="form-row">
                      <div className="form-group">
                        <label className="form-label">Date de début *</label>
                        <input
                          className="form-input"
                          type="date"
                          value={newYearForm.start_date}
                          onChange={e => setNewYearForm(f => ({ ...f, start_date: e.target.value }))}
                        />
                      </div>
                      <div className="form-group">
                        <label className="form-label">Date de fin *</label>
                        <input
                          className="form-input"
                          type="date"
                          value={newYearForm.end_date}
                          onChange={e => setNewYearForm(f => ({ ...f, end_date: e.target.value }))}
                        />
                      </div>
                    </div>

                    {/* Marquer comme courante */}
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, marginBottom: 12 }}>
                      <input
                        type="checkbox"
                        checked={newYearForm.is_current}
                        onChange={e => setNewYearForm(f => ({ ...f, is_current: e.target.checked }))}
                        style={{ width: 15, height: 15 }}
                      />
                      Marquer comme année courante
                    </label>

                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      onClick={createYearInline}
                      disabled={savingYear}
                      style={{ width: '100%' }}
                    >
                      {savingYear ? 'Création...' : '✓ Créer et sélectionner cette année'}
                    </button>
                  </div>
                )}
              </div>

              {/* Enseignant responsable */}
              <div className="form-group">
                <label className="form-label">Enseignant responsable</label>
                <select className="form-select" value={classForm.teacher_id}
                  onChange={e => setClassForm(f => ({ ...f, teacher_id: e.target.value }))}>
                  <option value="">-- Sélectionner --</option>
                  {teachers.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>

              {/* Capacité + Active */}
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Capacité max</label>
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
              <button className="btn btn-primary" onClick={saveClass}>{editClass ? 'Enregistrer' : 'Créer'}</button>
            </div>
          </div>
        </div>
      )}

      {/* ════════════ MODAL UTILISATEUR ════════════ */}
      {userModal && (
        <div className="modal-overlay" onClick={() => setUserModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">{editUser ? 'Modifier' : 'Nouvel utilisateur'}</span>
              <button className="modal-close" onClick={() => setUserModal(false)}>x</button>
            </div>
            <form onSubmit={saveUser}>
              <div className="modal-body">
                <div className="form-group">
                  <label className="form-label">Nom complet *</label>
                  <input className="form-input" required value={userForm.name}
                    onChange={e => setUserForm({ ...userForm, name: e.target.value })} />
                </div>
                {!editUser && (
                  <>
                    <div className="form-group">
                      <label className="form-label">Email *</label>
                      <input className="form-input" type="email" required value={userForm.email}
                        onChange={e => setUserForm({ ...userForm, email: e.target.value })} />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Mot de passe *</label>
                      <input className="form-input" type="password" required value={userForm.password}
                        onChange={e => setUserForm({ ...userForm, password: e.target.value })} />
                    </div>
                  </>
                )}
                <div className="form-group">
                  <label className="form-label">Rôle</label>
                  <select className="form-select" value={userForm.role}
                    onChange={e => setUserForm({ ...userForm, role: e.target.value })}>
                    <option value="student">Étudiant</option>
                    <option value="teacher">Enseignant</option>
                    <option value="admin">Administrateur</option>
                  </select>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-outline" onClick={() => setUserModal(false)}>Annuler</button>
                <button type="submit" className="btn btn-primary">Enregistrer</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ════════════ MODAL COURS ════════════ */}
      {courseModal && (
        <div className="modal-overlay" onClick={() => setCourseModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">{editCourse ? 'Modifier le cours' : 'Nouveau cours'}</span>
              <button className="modal-close" onClick={() => setCourseModal(false)}>x</button>
            </div>
            <form onSubmit={saveCourse}>
              <div className="modal-body">
                <div className="form-group">
                  <label className="form-label">Titre *</label>
                  <input className="form-input" required value={courseForm.title}
                    onChange={e => setCourseForm({ ...courseForm, title: e.target.value })} />
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
                    <label className="form-label">Catégorie</label>
                    <select className="form-select" value={courseForm.category_id}
                      onChange={e => setCourseForm({ ...courseForm, category_id: e.target.value })}>
                      <option value="">Sans catégorie</option>
                      {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">Statut</label>
                  <select className="form-select" value={courseForm.is_published}
                    onChange={e => setCourseForm({ ...courseForm, is_published: e.target.value === 'true' })}>
                    <option value="true">Publié</option>
                    <option value="false">Brouillon</option>
                  </select>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-outline" onClick={() => setCourseModal(false)}>Annuler</button>
                <button type="submit" className="btn btn-primary">Enregistrer</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ════════════ MODAL AJOUTER ÉTUDIANTS ════════════ */}
      {studModal?.open && (
        <div className="modal-overlay" onClick={() => setStudModal(false)}>
          <div className="modal" style={{ maxWidth: 520, width: '95vw', maxHeight: '85vh', overflowY: 'auto' }}
            onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">Ajouter des étudiants</span>
              <button className="modal-close" onClick={() => setStudModal(false)}>x</button>
            </div>
            <div className="modal-body">
              <input className="form-input" placeholder="Rechercher..." value={studSearch}
                onChange={e => setStudSearch(e.target.value)} style={{ marginBottom: 10 }} />
              <div style={{ maxHeight: 300, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 8 }}>
                {(studModal.available || [])
                  .filter(s => s.name.toLowerCase().includes(studSearch.toLowerCase()) || s.email.toLowerCase().includes(studSearch.toLowerCase()))
                  .map(s => (
                    <label key={s.id} style={{
                      display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px',
                      borderBottom: '1px solid #f1f5f9', cursor: 'pointer',
                      background: selectedStuds.includes(s.id) ? '#eff6ff' : 'white',
                    }}>
                      <input type="checkbox" checked={selectedStuds.includes(s.id)}
                        onChange={e => setSelectedStuds(p => e.target.checked ? [...p, s.id] : p.filter(x => x !== s.id))} />
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 13 }}>{s.name}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{s.email}</div>
                      </div>
                    </label>
                  ))}
              </div>
              {selectedStuds.length > 0 && (
                <div style={{ marginTop: 8, fontSize: 13, color: '#3b82f6', fontWeight: 600 }}>
                  {selectedStuds.length} sélectionné(s)
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn btn-outline" onClick={() => setStudModal(false)}>Annuler</button>
              <button className="btn btn-primary" onClick={confirmAddStudents} disabled={!selectedStuds.length}>
                Ajouter ({selectedStuds.length})
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

/* ── Carte classe ── */
function ClassCard({ cls, onClick, onEdit, onDelete }) {
  const c   = lvlColor(cls.level)
  const pct = cls.max_students > 0 ? Math.round(cls.student_count / cls.max_students * 100) : 0
  return (
    <div onClick={onClick} style={{
      background: 'white', borderRadius: 14, overflow: 'hidden',
      border: '1px solid var(--border)', cursor: 'pointer',
      transition: 'transform .18s, box-shadow .18s', borderTop: `4px solid ${c}`,
    }}
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
        {cls.academic_year_name && (
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 4 }}>
            <span>📅</span> {cls.academic_year_name}
          </div>
        )}
        <div style={{ display: 'flex', gap: 16, marginBottom: 10 }}>
          <div>
            <div style={{ fontSize: 20, fontWeight: 800, color: '#3b82f6' }}>{cls.student_count}</div>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: .5 }}>étudiants</div>
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

/* ── Detail classe ── */
function ClassDetailView({
  selClass, classDetail, detailTab, setDetailTab, detailLoad,
  teachers, students, enrolled, enrollCourseId, availableForEnroll,
  onBack, onEdit, onExport,
  onCreateCourse, onEditCourse, onDeleteCourse, onTogglePublish,
  onLoadEnrolled, onEnroll, onUnenroll,
  onAddStudents, onRemoveStudent, navigate,
}) {
  const c = lvlColor(selClass.level)
  const tabs = [
    { id: 'courses',     label: `Cours (${classDetail?.courses?.length ?? '...'})` },
    { id: 'students',    label: `Étudiants (${classDetail?.students?.length ?? '...'})` },
    { id: 'teachers',    label: 'Enseignants' },
    { id: 'enrollments', label: 'Inscriptions aux cours' },
    { id: 'results',     label: 'Résultats' },
  ]

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20, fontSize: 14, color: 'var(--text-muted)' }}>
        <button onClick={onBack} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#3b82f6', fontWeight: 600, padding: 0, fontSize: 14 }}>
          ← Retour aux classes
        </button>
        <span>/</span>
        <span style={{ color: 'var(--navy)', fontWeight: 700 }}>{selClass.name}</span>
      </div>

      <div style={{ background: 'linear-gradient(135deg, var(--navy), #1a3a6e)', borderRadius: 16, padding: '24px 28px', marginBottom: 24, color: 'white', borderLeft: `5px solid ${c}` }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6, flexWrap: 'wrap' }}>
              <h2 style={{ fontFamily: 'Playfair Display, serif', fontSize: 22, margin: 0 }}>{selClass.name}</h2>
              {selClass.code && <span style={{ fontSize: 11, background: 'rgba(255,255,255,.15)', padding: '2px 10px', borderRadius: 20, fontWeight: 600 }}>{selClass.code}</span>}
            </div>
            <div style={{ fontSize: 13, opacity: .75, display: 'flex', gap: 16, flexWrap: 'wrap' }}>
              {selClass.level        && <span>{selClass.level}</span>}
              {selClass.teacher_name && <span>Enseignant : {selClass.teacher_name}</span>}
              {(classDetail?.academic_year_name || selClass.academic_year_name) && (
                <span>📅 {classDetail?.academic_year_name || selClass.academic_year_name}</span>
              )}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="btn btn-sm" style={{ background: 'rgba(255,255,255,.15)', color: 'white', border: 'none' }} onClick={onEdit}>Modifier</button>
            <button className="btn btn-sm" style={{ background: 'rgba(255,255,255,.15)', color: 'white', border: 'none' }} onClick={onExport}>Export CSV</button>
          </div>
        </div>
        {classDetail && (
          <div style={{ display: 'flex', gap: 24, marginTop: 16, flexWrap: 'wrap' }}>
            {[
              { l: 'Étudiants', v: classDetail.stats?.total_students ?? classDetail.students?.length, c: '#60a5fa' },
              { l: 'Cours',     v: classDetail.stats?.total_courses  ?? classDetail.courses?.length,  c: '#34d399' },
              { l: 'Examens',   v: classDetail.stats?.total_exams    ?? classDetail.exams?.length,    c: '#fbbf24' },
              { l: 'Devoirs',   v: classDetail.stats?.total_homeworks ?? classDetail.homeworks?.length, c: '#a78bfa' },
            ].map(s => (
              <div key={s.l}>
                <div style={{ fontSize: 22, fontWeight: 800, color: s.c }}>{s.v ?? 0}</div>
                <div style={{ fontSize: 11, opacity: .6 }}>{s.l}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{ display: 'flex', gap: 0, marginBottom: 24, borderBottom: '1px solid var(--border)', overflowX: 'auto' }}>
        {tabs.map(t => (
          <button key={t.id} onClick={() => setDetailTab(t.id)} style={{
            padding: '10px 18px', border: 'none', cursor: 'pointer', fontSize: 13, whiteSpace: 'nowrap',
            fontWeight: detailTab === t.id ? 700 : 400,
            color: detailTab === t.id ? 'var(--navy)' : 'var(--text-muted)',
            background: 'transparent',
            borderBottom: detailTab === t.id ? '2px solid var(--navy)' : '2px solid transparent',
            marginBottom: -1,
          }}>{t.label}</button>
        ))}
      </div>

      {detailLoad ? (
        <div className="loading-overlay"><div className="spinner" /></div>
      ) : !classDetail ? (
        <div className="empty-state"><h3>Chargement...</h3></div>
      ) : (
        <>
          {detailTab === 'courses' && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <span style={{ fontSize: 14, color: 'var(--text-muted)' }}>{classDetail.courses?.length ?? 0} cours dans cette classe</span>
                <button className="btn btn-primary btn-sm" onClick={onCreateCourse}>+ Nouveau cours</button>
              </div>
              {(classDetail.courses?.length ?? 0) === 0 ? (
                <div className="empty-state"><h3>Aucun cours</h3><p>Créez le premier cours pour cette classe.</p></div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {(classDetail.courses ?? []).map(course => (
                    <div key={course.id} className="card">
                      <div className="card-body" style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--navy)' }}>{course.title}</div>
                          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                            {course.teacher_name} · {course.lesson_count ?? 0} leçon(s) · {course.student_count ?? 0} étudiant(s)
                          </div>
                        </div>
                        <span style={{ fontSize: 11, padding: '2px 10px', borderRadius: 20, background: course.is_published ? '#d1fae5' : '#fef9c3', color: course.is_published ? '#065f46' : '#854d0e' }}>
                          {course.is_published ? 'Publié' : 'Brouillon'}
                        </span>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          <button className="btn btn-outline btn-sm" onClick={() => navigate(`/courses/${course.id}`)}>Voir</button>
                          <button className="btn btn-outline btn-sm" onClick={() => onEditCourse(course)}>Modifier</button>
                          <button className="btn btn-outline btn-sm" onClick={() => onTogglePublish(course)}>{course.is_published ? 'Dépublier' : 'Publier'}</button>
                          <button className="btn btn-outline btn-sm" onClick={() => { onLoadEnrolled(course.id); setDetailTab('enrollments') }}>Inscrire</button>
                          <button className="btn btn-danger btn-sm" onClick={() => onDeleteCourse(course.id)}>Supprimer</button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {detailTab === 'students' && (
            <div>
              <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                <button className="btn btn-primary btn-sm" onClick={onAddStudents}>+ Ajouter des étudiants</button>
              </div>
              {(classDetail.students?.length ?? 0) === 0 ? (
                <div className="empty-state"><h3>Aucun étudiant dans cette classe</h3></div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: 10 }}>
                  {(classDetail.students ?? []).map(s => (
                    <div key={s.id} className="card">
                      <div className="card-body" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <div style={{ width: 38, height: 38, borderRadius: '50%', flexShrink: 0, background: 'var(--navy)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 13 }}>
                          {s.name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--navy)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name}</div>
                          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{s.email}</div>
                          {s.matricule && <div style={{ fontSize: 10, color: '#64748b' }}>#{s.matricule}</div>}
                        </div>
                        <button className="btn btn-danger btn-sm" style={{ padding: '2px 8px', fontSize: 11 }}
                          onClick={() => onRemoveStudent(s.id, s.name)}>Retirer</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {detailTab === 'teachers' && (
            <div>
              <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16 }}>Enseignants assignés à cette classe ou à ses cours.</p>
              {(() => {
                const teacherIds = new Set()
                const list = []
                if (classDetail.teacher_id) {
                  const t = teachers.find(t => t.id === classDetail.teacher_id)
                  if (t) { teacherIds.add(t.id); list.push({ ...t, role_in_class: 'Responsable de classe' }) }
                }
                classDetail.courses?.forEach(c => {
                  if (c.teacher_id && !teacherIds.has(c.teacher_id)) {
                    const t = teachers.find(t => t.id === c.teacher_id)
                    if (t) { teacherIds.add(t.id); list.push({ ...t, role_in_class: `Cours : ${c.title.slice(0, 30)}` }) }
                  }
                })
                if (list.length === 0) return <div className="empty-state"><h3>Aucun enseignant assigné</h3></div>
                return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {list.map(t => (
                      <div key={t.id} className="card">
                        <div className="card-body" style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                          <div style={{ width: 42, height: 42, borderRadius: '50%', flexShrink: 0, background: '#0EA5E922', color: '#0EA5E9', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 14 }}>
                            {t.name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)}
                          </div>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--navy)' }}>{t.name}</div>
                            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{t.email}</div>
                          </div>
                          <span style={{ fontSize: 11, padding: '2px 10px', borderRadius: 20, background: '#e0f2fe', color: '#0369a1', fontWeight: 600 }}>{t.role_in_class}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )
              })()}
            </div>
          )}

          {detailTab === 'enrollments' && (
            <div>
              <div className="form-group" style={{ maxWidth: 420, marginBottom: 24 }}>
                <label className="form-label">Sélectionner un cours de cette classe</label>
                <select className="form-select" value={enrollCourseId || ''}
                  onChange={e => onLoadEnrolled(parseInt(e.target.value))}>
                  <option value="">-- Choisir un cours --</option>
                  {(classDetail.courses ?? []).map(c => (
                    <option key={c.id} value={c.id}>{c.title}</option>
                  ))}
                </select>
              </div>
              {enrollCourseId && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 12, color: 'var(--navy)' }}>Inscrits ({enrolled.length})</div>
                    {enrolled.length === 0 ? (
                      <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>Aucun étudiant inscrit.</div>
                    ) : enrolled.map(s => (
                      <div key={s.id} className="card" style={{ marginBottom: 8 }}>
                        <div className="card-body" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--navy)' }}>{s.name}</div>
                            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{s.email}</div>
                          </div>
                          <button className="btn btn-danger btn-sm" onClick={() => onUnenroll(s.id)}>Retirer</button>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 12, color: 'var(--navy)' }}>À inscrire ({availableForEnroll.length})</div>
                    {availableForEnroll.length === 0 ? (
                      <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>Tous les étudiants sont inscrits.</div>
                    ) : availableForEnroll.map(s => (
                      <div key={s.id} className="card" style={{ marginBottom: 8 }}>
                        <div className="card-body" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--navy)' }}>{s.name}</div>
                            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{s.email}</div>
                          </div>
                          <button className="btn btn-primary btn-sm" onClick={() => onEnroll(s.id)}>+ Inscrire</button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {detailTab === 'results' && <ResultsTab classId={classDetail.id} />}
        </>
      )}
    </div>
  )
}

/* ── Gestion utilisateurs ── */
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
            {t === 'students' ? 'Étudiants' : t === 'teachers' ? 'Enseignants' : 'Admins'}
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
                <button className="btn btn-outline btn-sm" onClick={() => onToggleActive(u)}>{u.is_active ? 'Désactiver' : 'Activer'}</button>
                <button className="btn btn-danger btn-sm" onClick={() => onDeleteUser(u.id)}>Supprimer</button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ── Tableau résultats ── */
function ResultsTab({ classId }) {
  const [data, setData] = useState(null)
  const [load, setLoad] = useState(true)

  useEffect(() => {
    api.get(`/classes/${classId}/results`)
      .then(r => setData(r.data))
      .catch(() => {})
      .finally(() => setLoad(false))
  }, [classId])

  if (load) return <div className="loading-overlay"><div className="spinner" /></div>
  if (!data) return <div className="empty-state"><h3>Impossible de charger les résultats</h3></div>
  if (!data.students?.length) return <div className="empty-state"><h3>Aucun étudiant</h3></div>

  const e = data.exams || [], h = data.homeworks || []

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, minWidth: 500 }}>
        <thead>
          <tr style={{ background: 'var(--navy)', color: 'white' }}>
            <th style={{ padding: '10px 14px', textAlign: 'left', position: 'sticky', left: 0, background: 'var(--navy)', whiteSpace: 'nowrap' }}>Étudiant</th>
            <th style={{ padding: '10px 8px', whiteSpace: 'nowrap' }}>Matricule</th>
            {e.map(x => <th key={`e${x.id}`} style={{ padding: '10px 8px', whiteSpace: 'nowrap', fontSize: 11 }}>Exam : {x.title.slice(0, 16)}{x.title.length > 16 ? '...' : ''}</th>)}
            {h.map(x => <th key={`h${x.id}`} style={{ padding: '10px 8px', whiteSpace: 'nowrap', fontSize: 11 }}>Devoir : {x.title.slice(0, 16)}{x.title.length > 16 ? '...' : ''}</th>)}
          </tr>
        </thead>
        <tbody>
          {data.students.map((s, i) => (
            <tr key={s.student_id} style={{ background: i % 2 === 0 ? 'white' : '#f8fafc' }}>
              <td style={{ padding: '9px 14px', fontWeight: 600, color: 'var(--navy)', position: 'sticky', left: 0, background: i % 2 === 0 ? 'white' : '#f8fafc' }}>{s.student_name}</td>
              <td style={{ padding: '9px 8px', color: 'var(--text-muted)', textAlign: 'center' }}>{s.matricule || '—'}</td>
              {e.map(x => { const r = s.exams[x.id]; return (
                <td key={`e${x.id}`} style={{ padding: '9px 8px', textAlign: 'center' }}>
                  {!r?.submitted ? <span style={{ color: '#94a3b8' }}>NS</span>
                    : !r.graded ? <span style={{ color: '#f59e0b' }}>En cours</span>
                    : <span style={{ fontWeight: 700, color: r.score / r.max >= 0.5 ? '#16a34a' : '#d97706' }}>{r.score}/{r.max}</span>}
                </td>
              )})}
              {h.map(x => { const r = s.homeworks[x.id]; return (
                <td key={`h${x.id}`} style={{ padding: '9px 8px', textAlign: 'center' }}>
                  {!r?.submitted ? <span style={{ color: '#94a3b8' }}>NS</span>
                    : !r.graded ? <span style={{ color: '#f59e0b' }}>En cours</span>
                    : <span style={{ fontWeight: 700, color: r.score / r.max >= 0.5 ? '#16a34a' : '#d97706' }}>{r.score}/{r.max}{r.late ? ' !' : ''}</span>}
                </td>
              )})}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
