import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../api/client'
import useAuthStore from '../store/authStore'
import { LiveReplayPlayer, openLiveRoom } from '../utils/videoSessions.jsx'

export default function SessionsPanel({ courseId }) {
  const { user }    = useAuthStore()
  const navigate    = useNavigate()
  const [sessions, setSessions] = useState([])
  const [loading, setLoading]   = useState(true)
  const [creating, setCreating] = useState(false)
  const [form, setForm]         = useState({ title: '', scheduled_at: '' })
  const [msg, setMsg]           = useState({ text: '', type: '' })
  const [busyId, setBusyId]     = useState(null)
  const isTeacher = user?.role === 'teacher' || user?.role === 'admin'

  const flash = (text, type = 'success') => { setMsg({ text, type }); setTimeout(() => setMsg({ text: '', type: '' }), 3000) }

  const load = () => {
    api.get(`/sessions/course/${courseId}`)
      .then(r => setSessions(r.data))
      .catch(() => setSessions([]))
      .finally(() => setLoading(false))
  }

    useEffect(() => {
    load()
    const timer = setInterval(load, 30000)
    return () => clearInterval(timer)
    }, [courseId])

  const createSession = async (e) => {
    e.preventDefault()
    try {
      await api.post('/sessions', {
        course_id: courseId,
        title: form.title,
        scheduled_at: form.scheduled_at || null,
      })
      flash('Session créée !')
      setCreating(false)
      setForm({ title: '', scheduled_at: '' })
      load()
    } catch (err) { flash(err.response?.data?.detail || 'Erreur', 'error') }
  }

  const startSession = async (s) => {
    try {
      setBusyId(s.id)
      const res = await api.post(`/sessions/${s.id}/start`)
      flash('Live en cours...')
      load()
      openLiveRoom(navigate, res.data)
   } catch (err) {
      flash(err.response?.data?.detail || 'Erreur lors du démarrage du live', 'error')
    } finally {
      setBusyId(null)
    }
  }

  const joinSession = (s) => openLiveRoom(navigate, s)

  const endSession = async (s) => {
    try {
      setBusyId(s.id)
      const res = await api.post(`/sessions/${s.id}/end`)
      flash(res.data?.recording_url ? 'Rediffusion disponible dans quelques minutes' : 'Session terminée')
      load()
    } catch (err) {
      flash(err.response?.data?.detail || 'Erreur lors de la fin du live', 'error')
    } finally {
      setBusyId(null)
    }
  }

  const deleteSession = async (s) => {
    if (!confirm('Supprimer cette session ?')) return
    await api.delete(`/sessions/${s.id}`)
    flash('Session supprimée'); load()
  }

  if (loading) return <div className="spinner" style={{ margin: '20px auto' }} />

  return (
    <div>
      {msg.text && <div className={`alert alert-${msg.type === 'error' ? 'error' : 'success'}`} style={{ marginBottom: 12 }}>{msg.text}</div>}

      <div className="section-header" style={{ marginBottom: 16 }}>
        <span style={{ fontWeight: 600, color: 'var(--navy)', fontSize: 15 }}>Cours en ligne</span>
        {isTeacher && (
          <button className="btn btn-outline btn-sm" onClick={() => setCreating(true)}>+ Planifier</button>
        )}
      </div>

      {sessions.length === 0 ? (
        <div style={{ color: 'var(--text-muted)', fontSize: 13, textAlign: 'center', padding: '24px 0' }}>
          {isTeacher ? 'Planifiez votre premier cours en ligne.' : 'Aucune session planifiée.'}
        </div>
      ) : sessions.map(s => (
        <div key={s.id} className="card" style={{ marginBottom: 10 }}>
          <div className="card-body" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--navy)' }}>{s.title}</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                {s.scheduled_at ? `Prévu le ${new Date(s.scheduled_at).toLocaleString()}` : 'Sans date prévue'}
              </div>
            </div>
            <span style={{ fontSize: 11, padding: '2px 10px', borderRadius: 20, fontWeight: 600,
              background: s.is_active ? '#d1fae5' : s.ended_at ? '#f1f5f9' : '#fef9c3',
              color:      s.is_active ? '#065f46' : s.ended_at ? '#64748b'  : '#854d0e' }}>
              {s.is_active ? '🔴 En direct' : s.ended_at ? 'Terminé' : 'Planifié'}
            </span>
            <div style={{ display: 'flex', gap: 6 }}>
              {isTeacher && !s.is_active && !s.ended_at && (
                <button className="btn btn-primary btn-sm" disabled={busyId === s.id} onClick={() => startSession(s)}>🔴 Démarrer le live</button>
              )}
              {isTeacher && s.is_active && (
                <>
                  <button className="btn btn-primary btn-sm" onClick={() => joinSession(s)}>Rejoindre</button>
                  <button className="btn btn-outline btn-sm" disabled={busyId === s.id} onClick={() => endSession(s)}>⏹ Terminer et sauvegarder</button>
                </>
              )}
              {!isTeacher && s.is_active && (
                <button className="btn btn-primary btn-sm" onClick={() => joinSession(s)}>🎥 Rejoindre</button>
              )}
              {isTeacher && (
                <button className="btn btn-danger btn-sm" onClick={() => deleteSession(s)}>🗑️</button>
              )}
            </div>
          </div>
            {(!isTeacher && (s.is_active || s.recording_url)) && (
            <div className="card-body" style={{ paddingTop: 0 }}>
              <LiveReplayPlayer session={s} />
            </div>
          )}
          {isTeacher && s.recording_url && !s.is_active && (
            <div className="card-body" style={{ paddingTop: 0, fontSize: 13, color: 'var(--text-muted)' }}>
              Rediffusion : <a href={s.recording_url} target="_blank" rel="noreferrer">ouvrir sur YouTube</a>
            </div>
          )}
        </div>
      ))}

      {/* Modal créer session */}
      {creating && (
        <div className="modal-overlay" onClick={() => setCreating(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">Planifier un cours en ligne</span>
              <button className="modal-close" onClick={() => setCreating(false)}>✕</button>
            </div>
            <form onSubmit={createSession}>
              <div className="modal-body">
                <div className="form-group">
                  <label className="form-label">Titre de la session *</label>
                  <input className="form-input" required value={form.title}
                    onChange={e => setForm({ ...form, title: e.target.value })}
                    placeholder="Ex : Cours du 15 mars — Chapitre 3" />
                </div>
                <div className="form-group">
                  <label className="form-label">Date et heure prévues</label>
                  <input className="form-input" type="datetime-local" value={form.scheduled_at}
                    onChange={e => setForm({ ...form, scheduled_at: e.target.value })} />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-outline" onClick={() => setCreating(false)}>Annuler</button>
                <button type="submit" className="btn btn-primary">Créer</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
