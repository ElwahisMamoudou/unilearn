import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import api from '../api/client'
import Logo from '../components/Logo'

/** Page ouverte depuis le lien reçu par e-mail : choix d'un nouveau mot de passe. */
export default function ResetPasswordPage() {
  const [params] = useSearchParams()
  const token = params.get('token') || ''
  const [valid, setValid] = useState(null)       // null = vérification en cours
  const [pwd, setPwd] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)

  useEffect(() => {
    if (!token) { setValid(false); return }
    api.get('/auth/reset-password/check', { params: { token } })
      .then(r => setValid(r.data.valid))
      .catch(() => setValid(false))
  }, [token])

  const submit = async e => {
    e.preventDefault()
    setError('')
    if (pwd.length < 8) return setError('Le mot de passe doit contenir au moins 8 caractères')
    if (pwd !== confirm) return setError('Les deux mots de passe ne correspondent pas')
    setLoading(true)
    try {
      await api.post('/auth/reset-password', { token, new_password: pwd })
      setDone(true)
    } catch (err) {
      setError(err.response?.data?.detail || 'Une erreur est survenue. Réessayez.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-page">
      <div style={{ textAlign: 'center', marginBottom: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 10 }}><Logo size={56} /></div>
        <h1 style={{ fontSize: 28, fontWeight: 700 }}>UniLearn</h1>
      </div>
      <div className="auth-card">
        <h2 style={{ fontSize: 22, fontWeight: 500, marginBottom: 16 }}>Nouveau mot de passe</h2>

        {valid === null && <div className="spinner" />}

        {valid === false && !done && (
          <>
            <div className="alert alert-error" role="alert">Ce lien est invalide ou a expiré.</div>
            <Link to="/forgot-password" className="btn btn-primary">Refaire une demande</Link>
          </>
        )}

        {done && (
          <>
            <div className="alert alert-success" role="status">Mot de passe modifié. Vous pouvez maintenant vous connecter.</div>
            <Link to="/login" className="btn btn-primary">Se connecter</Link>
          </>
        )}

        {valid && !done && (
          <form onSubmit={submit}>
            {error && <div className="alert alert-error" role="alert">{error}</div>}
            <div className="form-group">
              <label className="form-label" htmlFor="rp-new">Nouveau mot de passe</label>
              <input id="rp-new" className="form-input" type="password" autoComplete="new-password"
                     value={pwd} onChange={e => setPwd(e.target.value)} required autoFocus />
              <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>Au moins 8 caractères.</p>
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="rp-confirm">Confirmer le mot de passe</label>
              <input id="rp-confirm" className="form-input" type="password" autoComplete="new-password"
                     value={confirm} onChange={e => setConfirm(e.target.value)} required />
            </div>
            <button type="submit" className="btn btn-primary" disabled={loading} style={{ width: '100%', justifyContent: 'center' }}>
              {loading ? 'Enregistrement…' : 'Enregistrer le mot de passe'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
