import { useState } from 'react'
import { Link } from 'react-router-dom'
import api from '../api/client'
import Logo from '../components/Logo'

/** Mot de passe oublié : on saisit son e-mail, on reçoit un lien. */
export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')

  const submit = async e => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await api.post('/auth/forgot-password', { email })
      setDone(true)
    } catch (err) {
      setError(err.response?.status === 429
        ? 'Trop de demandes. Réessayez dans une heure.'
        : (err.response?.data?.detail || 'Une erreur est survenue. Réessayez.'))
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
        <h2 style={{ fontSize: 22, fontWeight: 500, marginBottom: 12 }}>Mot de passe oublié</h2>
        {done ? (
          <>
            <div className="alert alert-success" role="status">
              Si cette adresse correspond à un compte, un e-mail vient d'être envoyé avec un lien
              pour choisir un nouveau mot de passe (valable 1 heure).
            </div>
            <p style={{ fontSize: 14, color: 'var(--text-muted)' }}>
              Rien reçu ? Vérifiez vos courriers indésirables, ou demandez à l'administrateur de réinitialiser votre mot de passe.
            </p>
          </>
        ) : (
          <form onSubmit={submit}>
            <p style={{ fontSize: 14, color: 'var(--text-muted)', marginBottom: 16 }}>
              Saisissez l'adresse e-mail de votre compte. Nous vous enverrons un lien de réinitialisation.
            </p>
            {error && <div className="alert alert-error" role="alert">{error}</div>}
            <div className="form-group">
              <label className="form-label" htmlFor="fp-email">Adresse e-mail</label>
              <input id="fp-email" className="form-input" type="email" value={email}
                     onChange={e => setEmail(e.target.value)} required autoFocus />
            </div>
            <button type="submit" className="btn btn-primary" disabled={loading} style={{ width: '100%', justifyContent: 'center' }}>
              {loading ? 'Envoi…' : 'Envoyer le lien'}
            </button>
          </form>
        )}
        <p style={{ marginTop: 20, fontSize: 14, textAlign: 'center' }}>
          <Link to="/login" style={{ color: 'var(--blue)' }}>← Retour à la connexion</Link>
        </p>
      </div>
    </div>
  )
}
