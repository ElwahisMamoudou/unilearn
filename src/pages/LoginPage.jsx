import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import useAuthStore from '../store/authStore'
import Logo from '../components/Logo'

/** Page de connexion — présentation inspirée de Moodle. */
export default function LoginPage() {
  const navigate = useNavigate()
  const { login } = useAuthStore()
  const [email, setEmail] = useState('')
  const [pass, setPass] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [showPass, setShowPass] = useState(false)

  const submit = async e => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await login(email, pass)
      navigate('/home')
    } catch (err) {
      setError(err.response?.data?.detail || 'Email ou mot de passe incorrect')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-page">
      <div style={{ textAlign: 'center', marginBottom: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 10 }}><Logo size={56} /></div>
        <h1 style={{ fontSize: 28, fontWeight: 700 }}>UniLearn</h1>
        <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>Université de Ngaoundéré</p>
      </div>

      <div className="auth-card">
        <h2 style={{ fontSize: 22, fontWeight: 500, marginBottom: 20 }}>Connexion</h2>

        {error && <div className="alert alert-error" role="alert">{error}</div>}

        <form onSubmit={submit}>
          <div className="form-group">
            <label className="form-label" htmlFor="login-email">Adresse e-mail</label>
            <input
              id="login-email" className="form-input" type="email" autoComplete="username"
              value={email} onChange={e => setEmail(e.target.value)} required autoFocus
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="login-pass">Mot de passe</label>
            <div style={{ position: 'relative' }}>
              <input
                id="login-pass" className="form-input" type={showPass ? 'text' : 'password'}
                autoComplete="current-password" value={pass}
                onChange={e => setPass(e.target.value)} required style={{ paddingRight: 84 }}
              />
              <button
                type="button" onClick={() => setShowPass(v => !v)}
                style={{ position: 'absolute', right: 8, top: 6, background: 'none', border: 'none', color: 'var(--blue)', fontSize: 13 }}
              >
                {showPass ? 'Masquer' : 'Afficher'}
              </button>
            </div>
          </div>

          <button type="submit" className="btn btn-primary" disabled={loading} style={{ width: '100%', justifyContent: 'center' }}>
            {loading ? 'Connexion…' : 'Se connecter'}
          </button>
        </form>

        <p style={{ marginTop: 20, fontSize: 14, textAlign: 'center' }}>
          <Link to="/" style={{ color: 'var(--blue)' }}>← Retour à l'accueil du site</Link>
        </p>
      </div>
    </div>
  )
}
