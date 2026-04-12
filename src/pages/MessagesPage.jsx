import { useEffect, useState } from 'react'
import api from '../api/client'

export default function MessagesPage() {
  const [tab, setTab]            = useState('inbox')
  const [messages, setMessages]  = useState([])
  const [contacts, setContacts]  = useState([])
  const [selected, setSelected]  = useState(null)
  const [showCompose, setCompose]= useState(false)
  const [loading, setLoading]    = useState(true)
  const [form, setForm]          = useState({ receiver_id: '', subject: '', body: '' })
  const [sending, setSending]    = useState(false)
  const [flash, setFlash]        = useState('')

  const load = () => {
    setLoading(true)
    api.get(tab === 'inbox' ? '/messages/inbox' : '/messages/sent')
      .then(r => { setMessages(r.data); setLoading(false) })
  }
  useEffect(() => { load() }, [tab])
  useEffect(() => { api.get('/messages/contacts').then(r => setContacts(r.data)) }, [])

  const openMsg = async m => {
    setSelected(m)
    if (!m.is_read && tab === 'inbox') {
      await api.put(`/messages/${m.id}/read`)
      setMessages(prev => prev.map(x => x.id === m.id ? { ...x, is_read: true } : x))
    }
  }

  const deleteMsg = async id => {
    await api.delete(`/messages/${id}`)
    setMessages(prev => prev.filter(x => x.id !== id))
    if (selected?.id === id) setSelected(null)
  }

  const send = async e => {
    e.preventDefault()
    setSending(true)
    try {
      await api.post('/messages', { ...form, receiver_id: parseInt(form.receiver_id) })
      setFlash('Message envoye')
      setCompose(false)
      setForm({ receiver_id: '', subject: '', body: '' })
      if (tab === 'sent') load()
      setTimeout(() => setFlash(''), 3000)
    } catch (err) {
      setFlash(err.response?.data?.detail || 'Erreur')
    } finally { setSending(false) }
  }

  const unread = messages.filter(m => !m.is_read && tab === 'inbox').length

  return (
    <div style={{ display: 'flex', gap: 20, height: 'calc(100dvh - 120px)', minHeight: 500 }}>

      {/* Colonne gauche */}
      <div style={{ width: 300, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <button className="btn btn-primary" style={{ justifyContent: 'center' }}
          onClick={() => setCompose(true)}>
          Nouveau message
        </button>

        <div style={{ display: 'flex', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', overflow: 'hidden' }}>
          {[['inbox', 'Recus'], ['sent', 'Envoyes']].map(([t, label]) => (
            <button key={t} onClick={() => { setTab(t); setSelected(null) }}
              style={{
                flex: 1, padding: '9px 0', border: 'none', fontSize: 13,
                fontWeight: 500, cursor: 'pointer',
                background: tab === t ? 'var(--navy)' : 'var(--white)',
                color: tab === t ? '#fff' : 'var(--text-muted)',
              }}>
              {label}{t === 'inbox' && unread > 0 && ` (${unread})`}
            </button>
          ))}
        </div>

        <div className="card" style={{ flex: 1, overflow: 'hidden' }}>
          <div style={{ overflowY: 'auto', height: '100%' }}>
            {loading ? (
              <div className="loading-overlay"><div className="spinner" style={{ margin: '30px auto' }} /></div>
            ) : messages.length === 0 ? (
              <div className="empty-state" style={{ padding: '40px 20px' }}>
                <p style={{ fontSize: 13 }}>Aucun message</p>
              </div>
            ) : messages.map(m => (
              <div key={m.id} onClick={() => openMsg(m)}
                style={{
                  padding: '14px 16px', cursor: 'pointer',
                  borderBottom: '1px solid var(--border)',
                  background: selected?.id === m.id ? '#eff6ff' : 'transparent',
                  borderLeft: selected?.id === m.id ? '3px solid var(--blue)' : '3px solid transparent',
                }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ fontSize: 13, fontWeight: m.is_read ? 400 : 700, color: 'var(--navy)' }}>
                    {tab === 'inbox' ? m.sender_name : m.receiver_name}
                  </span>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                    {new Date(m.created_at).toLocaleDateString('fr-FR')}
                  </span>
                </div>
                <div style={{ fontSize: 13, fontWeight: m.is_read ? 400 : 600, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {!m.is_read && tab === 'inbox' && (
                    <span style={{ display: 'inline-block', width: 7, height: 7, borderRadius: '50%', background: 'var(--blue)', marginRight: 6 }} />
                  )}
                  {m.subject}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {m.body.slice(0, 60)}...
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Panneau de lecture */}
      <div className="card" style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {!selected ? (
          <div className="empty-state" style={{ margin: 'auto' }}>
            <h3>Selectionnez un message</h3>
            <p>Cliquez sur un message a gauche pour le lire</p>
          </div>
        ) : (
          <>
            <div className="card-header">
              <div>
                <div style={{ fontFamily: 'Playfair Display, serif', fontSize: 17, color: 'var(--navy)' }}>{selected.subject}</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 3 }}>
                  De : <strong>{selected.sender_name}</strong> — A : <strong>{selected.receiver_name}</strong>
                  {' · '}{new Date(selected.created_at).toLocaleString('fr-FR')}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-outline btn-sm"
                  onClick={() => { setForm({ receiver_id: selected.sender_id, subject: `Re: ${selected.subject}`, body: '' }); setCompose(true) }}>
                  Repondre
                </button>
                <button className="btn btn-danger btn-sm" onClick={() => deleteMsg(selected.id)}>
                  Supprimer
                </button>
              </div>
            </div>
            <div className="card-body" style={{ flex: 1, overflowY: 'auto' }}>
              <p style={{ fontSize: 14, lineHeight: 1.8, color: 'var(--text)', whiteSpace: 'pre-wrap' }}>{selected.body}</p>
            </div>
          </>
        )}
      </div>

      {flash && (
        <div style={{ position: 'fixed', bottom: 24, right: 24, background: 'var(--navy)', color: '#fff', padding: '12px 20px', borderRadius: 10, fontSize: 14, zIndex: 999 }}>
          {flash}
        </div>
      )}

      {/* Modal composer */}
      {showCompose && (
        <div className="modal-overlay" onClick={() => setCompose(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">Nouveau message</span>
              <button className="modal-close" onClick={() => setCompose(false)}>Fermer</button>
            </div>
            <form onSubmit={send}>
              <div className="modal-body">
                <div className="form-group">
                  <label className="form-label">Destinataire</label>
                  <select className="form-select" value={form.receiver_id}
                    onChange={e => setForm({ ...form, receiver_id: e.target.value })} required>
                    <option value="">Choisir un destinataire...</option>
                    {contacts.map(c => (
                      <option key={c.id} value={c.id}>
                        {c.role === 'teacher' ? 'Enseignant' : c.role === 'admin' ? 'Admin' : 'Etudiant'} — {c.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Sujet</label>
                  <input className="form-input" value={form.subject}
                    onChange={e => setForm({ ...form, subject: e.target.value })}
                    placeholder="Objet du message" required />
                </div>
                <div className="form-group">
                  <label className="form-label">Message</label>
                  <textarea className="form-input" rows={6} value={form.body}
                    onChange={e => setForm({ ...form, body: e.target.value })}
                    placeholder="Ecrivez votre message..." required style={{ resize: 'vertical' }} />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-outline" onClick={() => setCompose(false)}>Annuler</button>
                <button type="submit" className="btn btn-primary" disabled={sending}>
                  {sending ? 'Envoi en cours...' : 'Envoyer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
