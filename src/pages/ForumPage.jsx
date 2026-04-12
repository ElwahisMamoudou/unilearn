import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import api from '../api/client'
import useAuthStore from '../store/authStore'

export default function ForumPage() {
  const { courseId } = useParams()
  const navigate     = useNavigate()
  const { user }     = useAuthStore()

  const [posts, setPosts]       = useState([])
  const [course, setCourse]     = useState(null)
  const [selected, setSelected] = useState(null)
  const [loading, setLoading]   = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm]         = useState({ title: '', body: '' })
  const [replyBody, setReply]   = useState('')
  const [posting, setPosting]   = useState(false)
  const [msg, setMsg]           = useState('')

  const flash = t => { setMsg(t); setTimeout(() => setMsg(''), 3000) }

  const loadPosts = () =>
    api.get(`/forum/course/${courseId}`)
      .then(r => { setPosts(r.data); setLoading(false) })
      .catch(() => setLoading(false))

  const loadPost = id =>
    api.get(`/forum/post/${id}`)
      .then(r => setSelected(r.data))

  useEffect(() => {
    api.get(`/courses/${courseId}`).then(r => setCourse(r.data))
    loadPosts()
  }, [courseId])

  const submitPost = async e => {
    e.preventDefault()
    setPosting(true)
    try {
      await api.post(`/forum/course/${courseId}`, form)
      flash('Question publiee')
      setShowForm(false)
      setForm({ title: '', body: '' })
      loadPosts()
    } catch (err) {
      flash(err.response?.data?.detail || 'Erreur')
    } finally { setPosting(false) }
  }

  const submitReply = async e => {
    e.preventDefault()
    if (!replyBody.trim()) return
    setPosting(true)
    try {
      await api.post(`/forum/post/${selected.id}/reply`, { body: replyBody })
      setReply('')
      loadPost(selected.id)
      loadPosts()
      flash('Reponse ajoutee')
    } catch (err) {
      flash(err.response?.data?.detail || 'Erreur')
    } finally { setPosting(false) }
  }

  const deletePost = async id => {
    if (!confirm('Supprimer cette question et toutes ses reponses ?')) return
    await api.delete(`/forum/post/${id}`)
    if (selected?.id === id) setSelected(null)
    loadPosts()
    flash('Question supprimee')
  }

  const deleteReply = async id => {
    await api.delete(`/forum/reply/${id}`)
    loadPost(selected.id)
    flash('Reponse supprimee')
  }

  const canDelete = (authorId) =>
    user?.id === authorId || user?.role === 'admin' ||
    (user?.role === 'teacher' && course?.teacher_id === user?.id)

  const roleLabel = role =>
    role === 'teacher' ? 'Enseignant' : role === 'admin' ? 'Admin' : 'Etudiant'

  return (
    <div style={{ display: 'flex', gap: 24, height: 'calc(100dvh - 120px)', minHeight: 500 }}>

      {/* Colonne gauche — liste des questions */}
      <div style={{ width: 340, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <button className="btn btn-outline btn-sm"
              onClick={() => navigate(`/courses/${courseId}`)}>
              Retour au cours
            </button>
          </div>
          <button className="btn btn-primary btn-sm" onClick={() => setShowForm(true)}>
            Poser une question
          </button>
        </div>

        <div style={{ fontWeight: 600, fontSize: 15, color: 'var(--navy)' }}>
          Forum — {course?.title || '...'}
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
          {posts.length} question{posts.length > 1 ? 's' : ''} posee{posts.length > 1 ? 's' : ''}
        </div>

        {/* Liste questions */}
        <div className="card" style={{ flex: 1, overflow: 'hidden' }}>
          <div style={{ overflowY: 'auto', height: '100%' }}>
            {loading ? (
              <div className="loading-overlay"><div className="spinner" style={{ margin: '30px auto' }} /></div>
            ) : posts.length === 0 ? (
              <div className="empty-state" style={{ padding: '40px 20px' }}>
                <h3 style={{ fontSize: 15 }}>Aucune question</h3>
                <p style={{ fontSize: 13 }}>Soyez le premier a poser une question.</p>
              </div>
            ) : posts.map(p => (
              <div key={p.id}
                onClick={() => loadPost(p.id)}
                style={{
                  padding: '14px 16px', cursor: 'pointer',
                  borderBottom: '1px solid var(--border)',
                  background: selected?.id === p.id ? '#eff6ff' : 'transparent',
                  borderLeft: selected?.id === p.id ? '3px solid var(--blue)' : '3px solid transparent',
                }}>
                <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--navy)', marginBottom: 4, lineHeight: 1.3 }}>
                  {p.title}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6,
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {p.body}
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-muted)' }}>
                  <span>
                    <strong>{p.author_name}</strong>
                    {' · '}<span style={{
                      background: p.author_role === 'teacher' ? '#dbeafe' : '#f1f5f9',
                      color: p.author_role === 'teacher' ? 'var(--blue)' : 'var(--text-muted)',
                      padding: '1px 6px', borderRadius: 10, fontSize: 10, fontWeight: 600,
                    }}>{roleLabel(p.author_role)}</span>
                  </span>
                  <span>{p.reply_count} rep.</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Colonne droite — detail + reponses */}
      <div className="card" style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {!selected ? (
          <div className="empty-state" style={{ margin: 'auto' }}>
            <h3>Selectionnez une question</h3>
            <p>Cliquez sur une question pour voir les reponses</p>
          </div>
        ) : (
          <>
            {/* Question principale */}
            <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                <h3 style={{ fontFamily: 'Playfair Display, serif', fontSize: 18, color: 'var(--navy)', flex: 1 }}>
                  {selected.title}
                </h3>
                {canDelete(selected.author_id) && (
                  <button className="btn btn-danger btn-sm"
                    style={{ marginLeft: 12, flexShrink: 0 }}
                    onClick={() => deletePost(selected.id)}>
                    Supprimer
                  </button>
                )}
              </div>
              <p style={{ fontSize: 14, color: 'var(--text)', lineHeight: 1.7, marginBottom: 12, whiteSpace: 'pre-wrap' }}>
                {selected.body}
              </p>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', display: 'flex', gap: 12 }}>
                <span>Par <strong>{selected.author_name}</strong></span>
                <span style={{
                  background: selected.author_role === 'teacher' ? '#dbeafe' : '#f1f5f9',
                  color: selected.author_role === 'teacher' ? 'var(--blue)' : 'var(--text-muted)',
                  padding: '1px 8px', borderRadius: 10, fontSize: 11, fontWeight: 600,
                }}>{roleLabel(selected.author_role)}</span>
                <span>{new Date(selected.created_at).toLocaleDateString('fr-FR')}</span>
              </div>
            </div>

            {/* Reponses */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '0 24px' }}>
              {selected.replies?.length === 0 ? (
                <p style={{ color: 'var(--text-muted)', fontSize: 13, padding: '20px 0' }}>
                  Aucune reponse pour l'instant. Soyez le premier a repondre.
                </p>
              ) : selected.replies.map(r => (
                <div key={r.id} style={{
                  padding: '16px 0', borderBottom: '1px solid var(--border)',
                  display: 'flex', gap: 14,
                }}>
                  {/* Avatar initiales */}
                  <div style={{
                    width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
                    background: r.author_role === 'teacher' ? '#dbeafe' : '#f1f5f9',
                    color: r.author_role === 'teacher' ? 'var(--blue)' : 'var(--text-muted)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontWeight: 700, fontSize: 13,
                  }}>
                    {r.author_name?.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                      <div style={{ fontSize: 13 }}>
                        <strong>{r.author_name}</strong>
                        {' '}
                        <span style={{
                          background: r.author_role === 'teacher' ? '#dbeafe' : '#f1f5f9',
                          color: r.author_role === 'teacher' ? 'var(--blue)' : 'var(--text-muted)',
                          padding: '1px 8px', borderRadius: 10, fontSize: 11, fontWeight: 600,
                        }}>{roleLabel(r.author_role)}</span>
                        {' · '}
                        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                          {new Date(r.created_at).toLocaleDateString('fr-FR')}
                        </span>
                      </div>
                      {canDelete(r.author_id) && (
                        <button
                          onClick={() => deleteReply(r.id)}
                          style={{ background: 'none', border: 'none', color: 'var(--error)', fontSize: 12, cursor: 'pointer' }}>
                          Supprimer
                        </button>
                      )}
                    </div>
                    <p style={{ fontSize: 14, color: 'var(--text)', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
                      {r.body}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            {/* Zone de reponse */}
            <div style={{ padding: '16px 24px', borderTop: '1px solid var(--border)' }}>
              <form onSubmit={submitReply} style={{ display: 'flex', gap: 10 }}>
                <textarea
                  className="form-input"
                  rows={2}
                  placeholder="Ecrire une reponse..."
                  value={replyBody}
                  onChange={e => setReply(e.target.value)}
                  style={{ flex: 1, resize: 'none' }}
                  required
                />
                <button type="submit" className="btn btn-primary" disabled={posting}
                  style={{ alignSelf: 'flex-end', whiteSpace: 'nowrap' }}>
                  {posting ? 'Envoi...' : 'Repondre'}
                </button>
              </form>
            </div>
          </>
        )}
      </div>

      {/* Notification flash */}
      {msg && (
        <div style={{
          position: 'fixed', bottom: 24, right: 24,
          background: 'var(--navy)', color: '#fff',
          padding: '12px 20px', borderRadius: 10, fontSize: 14, zIndex: 999,
        }}>{msg}</div>
      )}

      {/* Modal nouvelle question */}
      {showForm && (
        <div className="modal-overlay" onClick={() => setShowForm(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">Poser une question</span>
              <button className="modal-close" onClick={() => setShowForm(false)}>Fermer</button>
            </div>
            <form onSubmit={submitPost}>
              <div className="modal-body">
                <div className="form-group">
                  <label className="form-label">Titre de la question</label>
                  <input className="form-input"
                    value={form.title}
                    onChange={e => setForm({ ...form, title: e.target.value })}
                    placeholder="Ex : Comment fonctionne la mitose ?"
                    required />
                </div>
                <div className="form-group">
                  <label className="form-label">Details</label>
                  <textarea className="form-input" rows={5}
                    value={form.body}
                    onChange={e => setForm({ ...form, body: e.target.value })}
                    placeholder="Expliquez votre question en detail..."
                    style={{ resize: 'vertical' }}
                    required />
                </div>
                <div className="alert alert-info" style={{ fontSize: 12 }}>
                  Votre question sera visible par tous les etudiants inscrits a ce cours et par l'enseignant.
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-outline" onClick={() => setShowForm(false)}>Annuler</button>
                <button type="submit" className="btn btn-primary" disabled={posting}>
                  {posting ? 'Publication...' : 'Publier la question'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
