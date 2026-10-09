import { Link, useNavigate } from 'react-router-dom'
import Logo from '../components/Logo'

const FEATURES = [
  { icon: '📚', title: 'Cours en ligne', text: 'Leçons en PDF et en vidéo, avec suivi de votre progression.' },
  { icon: '📝', title: 'Devoirs et examens', text: 'Remise de travaux, évaluations en ligne et consultation des notes.' },
  { icon: '🎥', title: 'Classes virtuelles', text: 'Séances de visioconférence organisées par vos enseignants.' },
  { icon: '💬', title: 'Échanges', text: 'Messagerie et forums de discussion pour chaque cours.' },
]

/** Page d'accueil publique — présentation inspirée de la page d'accueil d'un site Moodle. */
export default function LandingPage() {
  const navigate = useNavigate()

  return (
    <div className="app-shell" style={{ display: 'flex', flexDirection: 'column' }}>
      <header className="navbar-moodle">
        <Link to="/" className="brand">
          <Logo />
          <span>UniLearn</span>
        </Link>
        <div className="nav-right">
          <button className="btn btn-primary" onClick={() => navigate('/login')}>Connexion</button>
        </div>
      </header>

      <div className="main" style={{ flex: 1 }}>
        <div className="page-header">
          <h1 className="page-title">Bienvenue sur UniLearn</h1>
        </div>

        <main className="content" style={{ maxWidth: 1100, width: '100%', margin: '0 auto' }}>
          <div className="card" style={{ marginBottom: 24 }}>
            <div className="card-body" style={{ padding: '28px 28px' }}>
              <h2 style={{ fontSize: 22, fontWeight: 500, marginBottom: 8 }}>La plateforme d'apprentissage de l'Université de Ngaoundéré</h2>
              <p style={{ color: 'var(--text-muted)', marginBottom: 18, maxWidth: 680 }}>
                Retrouvez vos cours, vos devoirs et vos examens au même endroit. Connectez-vous avec le compte
                fourni par votre établissement.
              </p>
              <button className="btn btn-primary" onClick={() => navigate('/login')}>Se connecter</button>
            </div>
          </div>

          <div className="course-grid">
            {FEATURES.map(f => (
              <div key={f.title} className="card">
                <div className="card-body">
                  <div style={{ fontSize: 30, marginBottom: 8 }}>{f.icon}</div>
                  <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>{f.title}</h3>
                  <p style={{ fontSize: 14, color: 'var(--text-muted)' }}>{f.text}</p>
                </div>
              </div>
            ))}
          </div>
        </main>

        <footer className="site-footer">
          <span>UniLearn — Université de Ngaoundéré</span>
          <Link to="/login" style={{ color: 'var(--blue)' }}>Connexion</Link>
        </footer>
      </div>
    </div>
  )
}
