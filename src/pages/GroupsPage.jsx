import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import api from '../api/client'
import useAuthStore from '../store/authStore'

/** Groupes à l'intérieur d'un cours : gestion (enseignant/admin) ou consultation (étudiant). */
export default function GroupsPage() {
  const { courseId } = useParams()
  const { user } = useAuthStore()
  const isStaff = user?.role === 'admin' || user?.role === 'teacher'

  const [course, setCourse] = useState(null)
  const [data, setData] = useState({ groups: [], ungrouped: [], students: [] })
  const [loading, setLoading] = useState(true)
  const [msg, setMsg] = useState(null)               // { type, text }
  const [newName, setNewName] = useState('')
  const [auto, setAuto] = useState({ by: 'count', value: 3, prefix: 'Groupe', order: 'random', only_ungrouped: true })
  const [pick, setPick] = useState({})               // { [groupId]: studentId }

  const flash = (type, text) => { setMsg({ type, text }); setTimeout(() => setMsg(null), 4000) }
  const fail = err => flash('error', err.response?.data?.detail || 'Une erreur est survenue')

  const load = useCallback(async () => {
    try {
      const [c, g] = await Promise.all([api.get(`/courses/${courseId}`), api.get(`/courses/${courseId}/groups`)])
      setCourse(c.data)
      setData({ students: [], ...g.data })
    } catch (err) { fail(err) } finally { setLoading(false) }
  }, [courseId])

  useEffect(() => { load() }, [load])

  const run = async (fn, ok) => { try { await fn(); if (ok) flash('success', ok); await load() } catch (err) { fail(err) } }

  const createGroup = e => {
    e.preventDefault()
    if (!newName.trim()) return
    run(() => api.post(`/courses/${courseId}/groups`, { name: newName }), 'Groupe créé').then(() => setNewName(''))
  }
  const createAuto = e => {
    e.preventDefault()
    run(() => api.post(`/courses/${courseId}/groups/auto`, { ...auto, value: Number(auto.value) }), 'Groupes créés et étudiants répartis')
  }
  const rename = g => {
    const name = window.prompt('Nouveau nom du groupe', g.name)
    if (name && name.trim() && name !== g.name) run(() => api.put(`/courses/${courseId}/groups/${g.id}`, { name, description: g.description }), 'Groupe renommé')
  }
  const remove = g => {
    if (window.confirm(`Supprimer le groupe « ${g.name} » ? Les étudiants restent inscrits au cours.`))
      run(() => api.delete(`/courses/${courseId}/groups/${g.id}`), 'Groupe supprimé')
  }
  const addMember = g => {
    const sid = Number(pick[g.id])
    if (sid) run(() => api.post(`/courses/${courseId}/groups/${g.id}/members`, { student_ids: [sid] })).then(() => setPick(p => ({ ...p, [g.id]: '' })))
  }

  if (loading) return <div className="spinner" />

  return (
    <div style={{ maxWidth: 1000 }}>
      <p style={{ marginBottom: 16 }}>
        <Link to={`/courses/${courseId}`} style={{ color: 'var(--blue)' }}>← {course?.title || 'Retour au cours'}</Link>
      </p>
      {msg && <div className={`alert alert-${msg.type === 'error' ? 'error' : 'success'}`} role="status">{msg.text}</div>}

      {isStaff && (
        <div className="card" style={{ marginBottom: 20 }}>
          <div className="card-header"><span className="card-title">Ajouter des groupes</span></div>
          <div className="card-body" style={{ display: 'grid', gap: 20, gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))' }}>
            <form onSubmit={createGroup}>
              <label className="form-label" htmlFor="g-name">Nouveau groupe</label>
              <div style={{ display: 'flex', gap: 8 }}>
                <input id="g-name" className="form-input" value={newName} onChange={e => setNewName(e.target.value)} placeholder="Ex. : Groupe TP 1" maxLength={120} />
                <button className="btn btn-primary" type="submit">Créer</button>
              </div>
            </form>
            <form onSubmit={createAuto}>
              <label className="form-label">Création automatique</label>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                <select className="form-select" style={{ width: 'auto' }} value={auto.by} onChange={e => setAuto({ ...auto, by: e.target.value })} aria-label="Mode">
                  <option value="count">Nombre de groupes</option>
                  <option value="size">Étudiants par groupe</option>
                </select>
                <input className="form-input" type="number" min="1" max="200" style={{ width: 80 }} value={auto.value} onChange={e => setAuto({ ...auto, value: e.target.value })} aria-label="Valeur" />
                <input className="form-input" style={{ width: 120 }} value={auto.prefix} onChange={e => setAuto({ ...auto, prefix: e.target.value })} aria-label="Préfixe du nom" />
                <select className="form-select" style={{ width: 'auto' }} value={auto.order} onChange={e => setAuto({ ...auto, order: e.target.value })} aria-label="Répartition">
                  <option value="random">Au hasard</option>
                  <option value="alpha">Ordre alphabétique</option>
                </select>
              </div>
              <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13, margin: '8px 0' }}>
                <input type="checkbox" checked={auto.only_ungrouped} onChange={e => setAuto({ ...auto, only_ungrouped: e.target.checked })} />
                Seulement les étudiants qui n'ont pas encore de groupe
              </label>
              <button className="btn btn-outline" type="submit">Créer et répartir</button>
            </form>
          </div>
        </div>
      )}

      {data.groups.length === 0 && (
        <div className="empty-state">
          <div className="icon">👥</div>
          <h3>{isStaff ? 'Aucun groupe dans ce cours' : 'Vous n\'êtes dans aucun groupe'}</h3>
          {isStaff && <p>Créez un groupe ou utilisez la création automatique ci-dessus.</p>}
        </div>
      )}

      <div className="course-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))' }}>
        {data.groups.map(g => {
          const inGroup = new Set(g.members.map(m => m.id))
          const candidates = (data.students || []).filter(s => !inGroup.has(s.id))
          return (
            <div className="card" key={g.id}>
              <div className="card-header">
                <span className="card-title">{g.name} <span className="pill">{g.count}</span></span>
                {isStaff && (
                  <span style={{ display: 'flex', gap: 6 }}>
                    <button className="btn btn-outline btn-sm" onClick={() => rename(g)}>Renommer</button>
                    <button className="btn btn-danger btn-sm" onClick={() => remove(g)}>Supprimer</button>
                  </span>
                )}
              </div>
              <div className="card-body">
                {g.members.length === 0 && <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>Aucun membre.</p>}
                {g.members.map(m => (
                  <div key={m.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: 14 }}>
                    <span>{m.name}</span>
                    {isStaff && (
                      <button className="btn btn-sm" aria-label={`Retirer ${m.name}`} style={{ background: 'none', color: 'var(--error)', padding: '0 6px' }}
                              onClick={() => run(() => api.delete(`/courses/${courseId}/groups/${g.id}/members/${m.id}`))}>✕</button>
                    )}
                  </div>
                ))}
                {isStaff && candidates.length > 0 && (
                  <div style={{ display: 'flex', gap: 6, marginTop: 12 }}>
                    <select className="form-select" value={pick[g.id] || ''} onChange={e => setPick({ ...pick, [g.id]: e.target.value })} aria-label="Ajouter un étudiant">
                      <option value="">Ajouter un étudiant…</option>
                      {candidates.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                    <button className="btn btn-primary btn-sm" onClick={() => addMember(g)} disabled={!pick[g.id]}>Ajouter</button>
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {isStaff && data.ungrouped.length > 0 && (
        <div className="card" style={{ marginTop: 20 }}>
          <div className="card-header"><span className="card-title">Sans groupe <span className="pill">{data.ungrouped.length}</span></span></div>
          <div className="card-body">{data.ungrouped.map(s => <span key={s.id} className="pill">{s.name}</span>)}</div>
        </div>
      )}
    </div>
  )
}
