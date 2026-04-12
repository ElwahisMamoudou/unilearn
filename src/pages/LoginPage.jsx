import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import useAuthStore from '../store/authStore'

export default function LoginPage() {
  const navigate = useNavigate()
  const { login } = useAuthStore()
  const [email, setEmail]     = useState('')
  const [password, setPass]   = useState('')
  const [error, setError]     = useState('')
  const [loading, setLoading] = useState(false)

  const submit = async e => {
    e.preventDefault()
    setError(''); setLoading(true)
    try {
      await login(email, password)
      navigate('/')
    } catch (err) {
      setError(err.response?.data?.detail || 'Email ou mot de passe incorrect')
    } finally { setLoading(false) }
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-logo">UniLearn</div>
        <p className="auth-sub">Université de Ngaoundéré</p>

        {error && <div className="alert alert-error">{error}</div>}

        <form onSubmit={submit}>
          <div className="form-group">
            <label className="form-label">Email</label>
            <input className="form-input" type="email"
              value={email} onChange={e => setEmail(e.target.value)}
              placeholder="votre@email.cm" required />
          </div>

          <div className="form-group">
            <label className="form-label">Mot de passe</label>
            <input className="form-input" type="password"
              value={password} onChange={e => setPass(e.target.value)}
              placeholder="••••••••" required minLength={6} />
          </div>

          <button type="submit" className="btn btn-primary"
            style={{ width: '100%', justifyContent: 'center', marginTop: 8 }}
            disabled={loading}>
            {loading ? 'Connexion en cours...' : 'Se connecter'}
          </button>
        </form>

        <div style={{ marginTop: 24, padding: 14, background: '#f8fafc', borderRadius: 8, fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.8 }}>
          <strong>Comptes de démonstration</strong><br />
          admin@unilearn.cm / admin1234<br />
          prof@unilearn.cm / prof1234<br />
          etudiant@unilearn.cm / etudiant1234
        </div>
      </div>
    </div>
  )
}