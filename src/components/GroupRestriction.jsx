import { useState } from 'react'
import { Link } from 'react-router-dom'
import api from '../api/client'

/**
 * Bouton « Limiter à des groupes » pour un devoir ou une discussion du forum (enseignant / admin).
 * Sans groupe coché : visible par tous les étudiants du cours.
 * Avec des groupes cochés : visible seulement par les membres de ces groupes.
 */
export default function GroupRestriction({ courseId, targetType, targetId, groups = [], onSaved }) {
  const [open, setOpen] = useState(false)
  const [all, setAll] = useState(null)               // groupes du cours
  const [checked, setChecked] = useState([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const openModal = async () => {
    setOpen(true); setError(''); setAll(null)
    setChecked(groups.map(g => g.id))
    try {
      const r = await api.get(`/courses/${courseId}/groups`)
      setAll(r.data.groups || [])
    } catch (err) { setError(err.response?.data?.detail || 'Impossible de charger les groupes'); setAll([]) }
  }

  const toggle = id => setChecked(c => (c.includes(id) ? c.filter(x => x !== id) : [...c, id]))

  const save = async () => {
    setSaving(true); setError('')
    try {
      await api.put(`/courses/${courseId}/groups/restrictions/${targetType}/${targetId}`, { group_ids: checked })
      setOpen(false)
      onSaved?.()
    } catch (err) { setError(err.response?.data?.detail || 'Enregistrement impossible') } finally { setSaving(false) }
  }

  const label = groups.length ? `🔒 ${groups.map(g => g.name).join(', ')}` : '👥 Tous les étudiants'
  const what = targetType === 'homework' ? 'ce devoir' : 'cette discussion'

  return (
    <>
      <button className="btn btn-outline btn-sm" onClick={openModal} title="Limiter à des groupes"
              style={groups.length ? { borderColor: 'var(--blue)', color: 'var(--blue-dark)' } : undefined}>
        {label}
      </button>
      {open && (
        <div className="modal-overlay" onClick={() => setOpen(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} role="dialog" aria-label="Limiter à des groupes">
            <div className="modal-header">
              <span className="modal-title">Qui peut voir {what} ?</span>
              <button className="modal-close" onClick={() => setOpen(false)} aria-label="Fermer">×</button>
            </div>
            <div className="modal-body">
              {error && <div className="alert alert-error">{error}</div>}
              {all === null && <div className="spinner" />}
              {all && all.length === 0 && (
                <p style={{ fontSize: 14 }}>
                  Ce cours n'a pas encore de groupe.{' '}
                  <Link to={`/courses/${courseId}/groups`} style={{ color: 'var(--blue)' }}>Créer des groupes</Link>
                </p>
              )}
              {all && all.length > 0 && (
                <>
                  <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 12 }}>
                    Ne cochez rien : tous les étudiants inscrits au cours le voient. Cochez des groupes : seuls leurs membres le voient.
                    Les enseignants voient toujours tout.
                  </p>
                  {all.map(g => (
                    <label key={g.id} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '6px 0', fontSize: 15 }}>
                      <input type="checkbox" checked={checked.includes(g.id)} onChange={() => toggle(g.id)} />
                      {g.name} <span className="pill">{g.count}</span>
                    </label>
                  ))}
                </>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn btn-outline" onClick={() => setOpen(false)}>Annuler</button>
              <button className="btn btn-primary" onClick={save} disabled={saving || all === null}>{saving ? 'Enregistrement…' : 'Enregistrer'}</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
