import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import useAuthStore from '../store/authStore'

const DEMO_ACCOUNTS = [
  { role: 'Admin',      email: 'admin@unilearn.cm',    password: 'admin1234',    icon: '⚙️', color: '#8b5cf6' },
  { role: 'Enseignant', email: 'prof@unilearn.cm',     password: 'prof1234',     icon: '👨‍🏫', color: '#0ea5e9' },
  { role: 'Étudiant',   email: 'etudiant@unilearn.cm', password: 'etudiant1234', icon: '🎓', color: '#22c55e' },
]

export default function LoginPage() {
  const navigate          = useNavigate()
  const { login }         = useAuthStore()
  const [email, setEmail] = useState('')
  const [pass,  setPass]  = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [showPass, setShowPass] = useState(false)
  const [focused, setFocused]   = useState('')

  const submit = async e => {
    e.preventDefault()
    setError(''); setLoading(true)
    try {
      await login(email, pass)
      navigate('/home')
    } catch (err) {
      setError(err.response?.data?.detail || 'Email ou mot de passe incorrect')
    } finally { setLoading(false) }
  }

  const fillDemo = (acc) => {
    setEmail(acc.email)
    setPass(acc.password)
    setError('')
  }

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      fontFamily: "'Sora', 'DM Sans', sans-serif",
      background: '#f0f4ff',
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Sora:wght@300;400;500;600;700;800&family=Playfair+Display:wght@700;800&display=swap');
        * { box-sizing: border-box; }

        .login-input {
          width: 100%;
          padding: 14px 16px 14px 48px;
          border-radius: 14px;
          border: 2px solid #e2e8f0;
          font-size: 15px;
          font-family: 'Sora', sans-serif;
          color: #0f1f3d;
          background: #fff;
          outline: none;
          transition: all .2s ease;
        }
        .login-input:focus {
          border-color: #6366f1;
          box-shadow: 0 0 0 4px rgba(99,102,241,.1);
        }
        .login-input::placeholder { color: #cbd5e1; }

        .btn-login {
          width: 100%;
          padding: 15px;
          border-radius: 14px;
          border: none;
          background: linear-gradient(135deg, #6366f1, #0ea5e9);
          color: #fff;
          font-size: 16px;
          font-weight: 700;
          font-family: 'Sora', sans-serif;
          cursor: pointer;
          transition: all .25s cubic-bezier(.175,.885,.32,1.275);
          box-shadow: 0 8px 24px rgba(99,102,241,.35);
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
        }
        .btn-login:hover:not(:disabled) {
          transform: translateY(-2px);
          box-shadow: 0 14px 32px rgba(99,102,241,.45);
        }
        .btn-login:disabled {
          opacity: .7;
          cursor: not-allowed;
          transform: none;
        }

        .demo-card {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 10px 14px;
          border-radius: 12px;
          border: 1.5px solid #e2e8f0;
          background: #fff;
          cursor: pointer;
          transition: all .18s ease;
          flex: 1;
        }
        .demo-card:hover {
          border-color: #6366f1;
          background: #faf5ff;
          transform: translateY(-2px);
          box-shadow: 0 6px 20px rgba(99,102,241,.12);
        }

        .input-icon {
          position: absolute;
          left: 15px;
          top: 50%;
          transform: translateY(-50%);
          font-size: 17px;
          pointer-events: none;
          transition: opacity .2s;
        }

        .toggle-pass {
          position: absolute;
          right: 14px;
          top: 50%;
          transform: translateY(-50%);
          background: none;
          border: none;
          cursor: pointer;
          font-size: 17px;
          color: #94a3b8;
          padding: 4px;
          transition: color .15s;
        }
        .toggle-pass:hover { color: #6366f1; }

        @keyframes slideUp {
          from { opacity: 0; transform: translateY(24px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes float {
          0%,100% { transform: translateY(0); }
          50%      { transform: translateY(-10px); }
        }
        .animate-in { animation: slideUp .6s ease forwards; }
        .float      { animation: float 4s ease-in-out infinite; }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        .spinner-ring {
          width: 20px; height: 20px;
          border: 2px solid rgba(255,255,255,.3);
          border-top-color: #fff;
          border-radius: 50%;
          animation: spin .7s linear infinite;
        }

        @keyframes shake {
          0%,100% { transform: translateX(0); }
          20%,60% { transform: translateX(-6px); }
          40%,80% { transform: translateX(6px); }
        }
        .shake { animation: shake .4s ease; }
      `}</style>

      {/* ── PANNEAU GAUCHE (visuel) ── */}
      <div style={{
        flex: 1,
        background: 'linear-gradient(145deg, #0f1f3d 0%, #1a3a6e 45%, #312e81 100%)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '60px 48px',
        position: 'relative',
        overflow: 'hidden',
      }}
        className="hide-mobile"
      >
        {/* Cercles déco */}
        <div style={{ position: 'absolute', top: -80, right: -80, width: 380, height: 380, borderRadius: '50%', background: 'rgba(99,102,241,.12)', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', bottom: -60, left: -60, width: 300, height: 300, borderRadius: '50%', background: 'rgba(14,165,233,.1)', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', top: '40%', right: '10%', width: 180, height: 180, borderRadius: '50%', background: 'rgba(139,92,246,.08)', pointerEvents: 'none' }} />

        {/* Grille */}
        <div style={{ position: 'absolute', inset: 0, opacity: .04, backgroundImage: 'linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)', backgroundSize: '48px 48px', pointerEvents: 'none' }} />

        {/* Logo */}
        <div style={{ marginBottom: 48, textAlign: 'center', position: 'relative' }}>
          <div style={{ width: 72, height: 72, borderRadius: 20, background: 'linear-gradient(135deg, #6366f1, #0ea5e9)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 36, margin: '0 auto 16px', boxShadow: '0 12px 32px rgba(99,102,241,.4)' }}>
            🎓
          </div>
          <h1 style={{ fontFamily: 'Playfair Display, serif', fontSize: 38, fontWeight: 900, color: '#fff', margin: 0, letterSpacing: -.5 }}>UniLearn</h1>
          <p style={{ color: 'rgba(255,255,255,.5)', fontSize: 14, marginTop: 6, fontWeight: 400 }}>Université de Ngaoundéré</p>
        </div>

        {/* Carte flottante centrale */}
        <div className="float" style={{ width: '100%', maxWidth: 360, position: 'relative' }}>

          {/* Carte principale */}
          <div style={{ background: 'rgba(255,255,255,.08)', backdropFilter: 'blur(20px)', border: '1px solid rgba(255,255,255,.15)', borderRadius: 24, padding: 28 }}>
            <div style={{ fontSize: 13, color: 'rgba(255,255,255,.5)', marginBottom: 16, fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase' }}>Progression globale</div>
            {[
              { label: 'Thermodynamique', pct: 82, color: '#0ea5e9' },
              { label: 'Mécanique des Fluides', pct: 55, color: '#8b5cf6' },
              { label: 'Résistance des Matériaux', pct: 91, color: '#22c55e' },
            ].map((c, i) => (
              <div key={i} style={{ marginBottom: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span style={{ fontSize: 13, color: 'rgba(255,255,255,.8)', fontWeight: 500 }}>{c.label}</span>
                  <span style={{ fontSize: 12, color: c.color, fontWeight: 700 }}>{c.pct}%</span>
                </div>
                <div style={{ height: 7, background: 'rgba(255,255,255,.08)', borderRadius: 4, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${c.pct}%`, background: `linear-gradient(90deg, ${c.color}88, ${c.color})`, borderRadius: 4 }} />
                </div>
              </div>
            ))}
            <div style={{ marginTop: 20, padding: '12px 14px', background: 'rgba(99,102,241,.2)', borderRadius: 12, border: '1px solid rgba(99,102,241,.3)', display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 20 }}>📅</span>
              <div>
                <div style={{ fontSize: 11, color: '#a5b4fc', fontWeight: 700 }}>Prochain examen</div>
                <div style={{ fontSize: 13, color: '#fff', marginTop: 1 }}>Thermodynamique — Dans 3 jours</div>
              </div>
            </div>
          </div>

          {/* Badge haut-droite */}
          <div style={{ position: 'absolute', top: -16, right: -16, background: '#22c55e', borderRadius: 14, padding: '8px 14px', color: '#fff', fontSize: 12, fontWeight: 700, boxShadow: '0 6px 20px rgba(34,197,94,.4)', display: 'flex', alignItems: 'center', gap: 6 }}>
            🔴 Cours en direct
          </div>

          {/* Badge bas-gauche */}
          <div style={{ position: 'absolute', bottom: -16, left: -16, background: '#fff', borderRadius: 14, padding: '8px 14px', color: '#0f1f3d', fontSize: 12, fontWeight: 700, boxShadow: '0 6px 20px rgba(15,31,61,.15)', display: 'flex', alignItems: 'center', gap: 6 }}>
            👥 <span>500+ étudiants actifs</span>
          </div>
        </div>

        {/* Témoignage bas */}
        <div style={{ position: 'absolute', bottom: 36, left: 48, right: 48, background: 'rgba(255,255,255,.06)', backdropFilter: 'blur(12px)', border: '1px solid rgba(255,255,255,.1)', borderRadius: 16, padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: 14, flexShrink: 0 }}>AM</div>
          <div>
            <div style={{ fontSize: 13, color: 'rgba(255,255,255,.85)', lineHeight: 1.5, fontStyle: 'italic' }}>"UniLearn a transformé ma façon d'apprendre. Tout est accessible en un clic."</div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,.4)', marginTop: 4 }}>Aicha Mbaye — L2 Informatique</div>
          </div>
        </div>
      </div>

      {/* ── PANNEAU DROIT (formulaire) ── */}
      <div style={{
        width: '100%',
        maxWidth: 520,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        padding: '48px 52px',
        background: '#fff',
        position: 'relative',
        overflow: 'hidden',
      }}>
        {/* Décoration coin */}
        <div style={{ position: 'absolute', top: -40, right: -40, width: 200, height: 200, borderRadius: '50%', background: 'linear-gradient(135deg, rgba(99,102,241,.06), rgba(14,165,233,.06))', pointerEvents: 'none' }} />

        <div className="animate-in">

          {/* En-tête */}
          <div style={{ marginBottom: 36 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 28 }}>
              <div style={{ width: 40, height: 40, borderRadius: 12, background: 'linear-gradient(135deg, #6366f1, #0ea5e9)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>🎓</div>
              <span style={{ fontFamily: 'Playfair Display, serif', fontSize: 22, fontWeight: 800, color: '#0f1f3d' }}>UniLearn</span>
            </div>
            <h2 style={{ fontFamily: 'Playfair Display, serif', fontSize: 30, fontWeight: 800, color: '#0f1f3d', margin: '0 0 8px', lineHeight: 1.2 }}>
              Bon retour ! 👋
            </h2>
            <p style={{ fontSize: 15, color: '#64748b', margin: 0 }}>
              Connectez-vous pour accéder à votre espace académique.
            </p>
          </div>

          {/* Erreur */}
          {error && (
            <div className="shake" style={{ background: '#fef2f2', border: '1.5px solid #fecaca', borderRadius: 12, padding: '12px 16px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 18 }}>⚠️</span>
              <span style={{ fontSize: 14, color: '#dc2626', fontWeight: 500 }}>{error}</span>
            </div>
          )}

          {/* Formulaire */}
          <form onSubmit={submit}>

            {/* Email */}
            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#374151', marginBottom: 8 }}>
                Adresse email
              </label>
              <div style={{ position: 'relative' }}>
                <span className="input-icon" style={{ opacity: focused === 'email' ? 1 : .5 }}>✉️</span>
                <input
                  className="login-input"
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  onFocus={() => setFocused('email')}
                  onBlur={() => setFocused('')}
                  placeholder="votre@email.cm"
                  required
                  autoComplete="email"
                />
              </div>
            </div>

            {/* Mot de passe */}
            <div style={{ marginBottom: 28 }}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#374151', marginBottom: 8 }}>
                Mot de passe
              </label>
              <div style={{ position: 'relative' }}>
                <span className="input-icon" style={{ opacity: focused === 'pass' ? 1 : .5 }}>🔒</span>
                <input
                  className="login-input"
                  type={showPass ? 'text' : 'password'}
                  value={pass}
                  onChange={e => setPass(e.target.value)}
                  onFocus={() => setFocused('pass')}
                  onBlur={() => setFocused('')}
                  placeholder="••••••••"
                  required
                  minLength={6}
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  className="toggle-pass"
                  onClick={() => setShowPass(v => !v)}
                  tabIndex={-1}
                >
                  {showPass ? '🙈' : '👁️'}
                </button>
              </div>
            </div>

            {/* Bouton connexion */}
            <button type="submit" className="btn-login" disabled={loading}>
              {loading ? (
                <>
                  <div className="spinner-ring" />
                  Connexion en cours...
                </>
              ) : (
                <>
                  Se connecter
                  <span style={{ fontSize: 18 }}>→</span>
                </>
              )}
            </button>
          </form>

          {/* Séparateur */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '28px 0' }}>
            <div style={{ flex: 1, height: 1, background: '#e2e8f0' }} />
            <span style={{ fontSize: 12, color: '#94a3b8', fontWeight: 600 }}>Comptes de démonstration</span>
            <div style={{ flex: 1, height: 1, background: '#e2e8f0' }} />
          </div>

          {/* Comptes démo */}
          <div style={{ display: 'flex', gap: 8 }}>
            {DEMO_ACCOUNTS.map((acc, i) => (
              <button key={i} className="demo-card" onClick={() => fillDemo(acc)}>
                <div style={{ width: 34, height: 34, borderRadius: 10, background: `${acc.color}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, flexShrink: 0 }}>
                  {acc.icon}
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#0f1f3d' }}>{acc.role}</div>
                  <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{acc.email}</div>
                </div>
              </button>
            ))}
          </div>

          {/* Retour landing */}
          <div style={{ textAlign: 'center', marginTop: 32 }}>
            <button
              onClick={() => window.history.back()}
              style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: 13, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6, transition: 'color .15s' }}
              onMouseEnter={e => e.currentTarget.style.color = '#6366f1'}
              onMouseLeave={e => e.currentTarget.style.color = '#94a3b8'}
            >
              ← Retour à l'accueil
            </button>
          </div>
        </div>
      </div>

      {/* Responsive mobile */}
      <style>{`
        @media (max-width: 768px) {
          .hide-mobile { display: none !important; }
        }
      `}</style>
    </div>
  )
}
