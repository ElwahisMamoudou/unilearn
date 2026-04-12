import { useEffect, useState } from 'react'
import api from '../api/client'

export default function AcademicPage() {
  const [years, setYears]       = useState([])
  const [loading, setLoading]   = useState(true)
  const [msg, setMsg]           = useState({ text: '', type: '' })
  const [showYearModal, setShowYearModal] = useState(false)
  const [showSemModal, setShowSemModal]   = useState(null) // year_id
  const [editYear, setEditYear] = useState(null)

  const [yearForm, setYearForm] = useState({ name: '', start_date: '', end_date: '', is_current: false })
  const [semForm,  setSemForm]  = useState({ name: '', start_date: '', end_date: '', is_current: false })

  const flash = (text, type = 'success') => { setMsg({ text, type }); setTimeout(() => setMsg({ text: '', type: '' }), 3500) }

  const load = () => {
    api.get('/academic/years')
      .then(r => { setYears(r.data); setLoading(false) })
      .catch(() => setLoading(false))
  }
  useEffect(load, [])

  const saveYear = async (e) => {
    e.preventDefault()
    try {
      const payload = {
        ...yearForm,
        start_date: new Date(yearForm.start_date).toISOString(),
        end_date:   new Date(yearForm.end_date).toISOString(),
        semesters:  [],
      }
      if (editYear) {
        await api.put(`/academic/years/${editYear.id}`, payload)
        flash('Année modifiée')
      } else {
        await api.post('/academic/years', payload)
        flash('Année créée')
      }
      setShowYearModal(false); setEditYear(null)
      setYearForm({ name: '', start_date: '', end_date: '', is_current: false })
      load()
    } catch (err) { flash(err.response?.data?.detail || 'Erreur', 'error') }
  }

  const deleteYear = async (id) => {
    if (!confirm('Supprimer cette année académique ?')) return
    await api.delete(`/academic/years/${id}`)
    flash('Année supprimée'); load()
  }

  const saveSemester = async (e) => {
    e.preventDefault()
    try {
      await api.post(`/academic/years/${showSemModal}/semesters`, {
        ...semForm,
        start_date: new Date(semForm.start_date).toISOString(),
        end_date:   new Date(semForm.end_date).toISOString(),
      })
      flash('Semestre ajouté')
      setShowSemModal(null)
      setSemForm({ name: '', start_date: '', end_date: '', is_current: false })
      load()
    } catch (err) { flash(err.response?.data?.detail || 'Erreur', 'error') }
  }

  const deleteSemester = async (id) => {
    if (!confirm('Supprimer ce semestre ?')) return
    await api.delete(`/academic/semesters/${id}`)
    flash('Semestre supprimé'); load()
  }

  const setCurrentYear = async (year) => {
    await api.put(`/academic/years/${year.id}`, {
      name: year.name,
      start_date: year.start_date,
      end_date:   year.end_date,
      is_current: true,
      semesters:  [],
    })
    flash(`${year.name} définie comme année courante`); load()
  }

  if (loading) return <div className="loading-overlay"><div className="spinner" /></div>

  return (
    <>
      {msg.text && <div className={`alert alert-${msg.type === 'error' ? 'error' : 'success'}`}>{msg.text}</div>}

      <div className="section-header">
        <span className="section-title">Années académiques</span>
        <button className="btn btn-primary" onClick={() => { setEditYear(null); setYearForm({ name: '', start_date: '', end_date: '', is_current: false }); setShowYearModal(true) }}>
          + Nouvelle année
        </button>
      </div>

      {years.length === 0 ? (
        <div className="empty-state">
          <h3>Aucune année académique</h3>
          <p>Créez la première année académique.</p>
        </div>
      ) : years.map(y => (
        <div key={y.id} className="card" style={{ marginBottom: 16 }}>
          <div className="card-body">
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 12 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: 16, color: 'var(--navy)', display: 'flex', alignItems: 'center', gap: 10 }}>
                  {y.name}
                  {y.is_current && (
                    <span style={{ fontSize: 11, background: '#d1fae5', color: '#065f46', padding: '2px 10px', borderRadius: 20, fontWeight: 700 }}>
                      En cours
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                  {new Date(y.start_date).toLocaleDateString('fr-FR')} → {new Date(y.end_date).toLocaleDateString('fr-FR')}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                {!y.is_current && (
                  <button className="btn btn-outline btn-sm" onClick={() => setCurrentYear(y)}>
                    Définir courante
                  </button>
                )}
                <button className="btn btn-outline btn-sm" onClick={() => {
                  setEditYear(y)
                  setYearForm({ name: y.name, start_date: y.start_date?.slice(0,16), end_date: y.end_date?.slice(0,16), is_current: y.is_current })
                  setShowYearModal(true)
                }}>Modifier</button>
                <button className="btn btn-outline btn-sm" onClick={() => setShowSemModal(y.id)}>
                  + Semestre
                </button>
                <button className="btn btn-danger btn-sm" onClick={() => deleteYear(y.id)}>🗑️</button>
              </div>
            </div>

            {/* Semestres */}
            {y.semesters?.length > 0 && (
              <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: .5 }}>
                  Semestres
                </div>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  {y.semesters.map(s => (
                    <div key={s.id} style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      background: s.is_current ? '#eff6ff' : 'var(--bg-light)',
                      border: s.is_current ? '1.5px solid var(--blue)' : '1px solid var(--border)',
                      borderRadius: 8, padding: '8px 12px',
                    }}>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--navy)' }}>
                          {s.name}
                          {s.is_current && <span style={{ marginLeft: 6, fontSize: 10, color: 'var(--blue)' }}>● Actif</span>}
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                          {new Date(s.start_date).toLocaleDateString('fr-FR')} → {new Date(s.end_date).toLocaleDateString('fr-FR')}
                        </div>
                      </div>
                      <button className="btn btn-danger btn-sm" style={{ fontSize: 11 }} onClick={() => deleteSemester(s.id)}>✕</button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      ))}

      {/* Modal Année */}
      {showYearModal && (
        <div className="modal-overlay" onClick={() => setShowYearModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">{editYear ? 'Modifier l\'année' : 'Nouvelle année académique'}</span>
              <button className="modal-close" onClick={() => setShowYearModal(false)}>✕</button>
            </div>
            <form onSubmit={saveYear}>
              <div className="modal-body">
                <div className="form-group">
                  <label className="form-label">Nom * (ex: 2024-2025)</label>
                  <input className="form-input" required value={yearForm.name}
                    onChange={e => setYearForm({ ...yearForm, name: e.target.value })}
                    placeholder="2024-2025" />
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Début *</label>
                    <input className="form-input" type="datetime-local" required
                      value={yearForm.start_date}
                      onChange={e => setYearForm({ ...yearForm, start_date: e.target.value })} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Fin *</label>
                    <input className="form-input" type="datetime-local" required
                      value={yearForm.end_date}
                      onChange={e => setYearForm({ ...yearForm, end_date: e.target.value })} />
                  </div>
                </div>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, cursor: 'pointer' }}>
                  <input type="checkbox" checked={yearForm.is_current}
                    onChange={e => setYearForm({ ...yearForm, is_current: e.target.checked })} />
                  Définir comme année courante
                </label>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-outline" onClick={() => setShowYearModal(false)}>Annuler</button>
                <button type="submit" className="btn btn-primary">Enregistrer</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Semestre */}
      {showSemModal && (
        <div className="modal-overlay" onClick={() => setShowSemModal(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">Nouveau semestre</span>
              <button className="modal-close" onClick={() => setShowSemModal(null)}>✕</button>
            </div>
            <form onSubmit={saveSemester}>
              <div className="modal-body">
                <div className="form-group">
                  <label className="form-label">Nom * (ex: Semestre 1)</label>
                  <input className="form-input" required value={semForm.name}
                    onChange={e => setSemForm({ ...semForm, name: e.target.value })}
                    placeholder="Semestre 1" />
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Début *</label>
                    <input className="form-input" type="datetime-local" required
                      value={semForm.start_date}
                      onChange={e => setSemForm({ ...semForm, start_date: e.target.value })} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Fin *</label>
                    <input className="form-input" type="datetime-local" required
                      value={semForm.end_date}
                      onChange={e => setSemForm({ ...semForm, end_date: e.target.value })} />
                  </div>
                </div>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, cursor: 'pointer' }}>
                  <input type="checkbox" checked={semForm.is_current}
                    onChange={e => setSemForm({ ...semForm, is_current: e.target.checked })} />
                  Semestre actif
                </label>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-outline" onClick={() => setShowSemModal(null)}>Annuler</button>
                <button type="submit" className="btn btn-primary">Ajouter</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
