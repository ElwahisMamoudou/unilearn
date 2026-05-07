import { useNavigate } from 'react-router-dom'
import { useEffect, useState } from 'react'

const STATS = [
  { value: '500+', label: 'Étudiants actifs' },
  { value: '120+', label: 'Cours disponibles' },
  { value: '40+',  label: 'Enseignants experts' },
  { value: '98%',  label: 'Taux de satisfaction' },
]

const FEATURES = [
  {
    icon: '🎥',
    title: 'Cours en direct',
    desc: 'Rejoignez des sessions live avec vos enseignants et posez vos questions en temps réel.',
    color: '#0ea5e9',
  },
  {
    icon: '📄',
    title: 'Leçons PDF & Vidéo',
    desc: 'Accédez à tous vos supports de cours à tout moment, depuis n\'importe quel appareil.',
    color: '#8b5cf6',
  },
  {
    icon: '📝',
    title: 'Devoirs & Examens',
    desc: 'Soumettez vos travaux en ligne et recevez vos corrections directement sur la plateforme.',
    color: '#f59e0b',
  },
  {
    icon: '💬',
    title: 'Forum de discussion',
    desc: 'Échangez avec vos camarades et enseignants dans un espace collaboratif dédié.',
    color: '#22c55e',
  },
  {
    icon: '📊',
    title: 'Suivi de progression',
    desc: 'Visualisez vos progrès et identifiez vos points forts et axes d\'amélioration.',
    color: '#ef4444',
  },
  {
    icon: '🏆',
    title: 'Résultats en ligne',
    desc: 'Consultez vos notes et évaluations directement depuis votre tableau de bord.',
    color: '#14b8a6',
  },
]

const TESTIMONIALS = [
  {
    name: 'Aicha Mbaye',
    role: 'Étudiante L2 Informatique',
    text: 'UniLearn a complètement changé ma façon d\'apprendre. J\'accède à mes cours à n\'importe quelle heure, même depuis chez moi.',
    avatar: 'AM',
    color: '#8b5cf6',
  },
  {
    name: 'Dr. Emmanuel Njoya',
    role: 'Enseignant — Génie Civil',
    text: 'La plateforme est intuitive et me permet de suivre mes étudiants facilement. La gestion des devoirs est un gain de temps précieux.',
    avatar: 'EN',
    color: '#0ea5e9',
  },
  {
    name: 'Karim Oumarou',
    role: 'Étudiant Master 1',
    text: 'Les cours en direct sont excellents. Je peux interagir avec mon professeur comme en présentiel, mais depuis n\'importe où.',
    avatar: 'KO',
    color: '#f59e0b',
  },
]

export default function LandingPage() {
  const navigate = useNavigate()
  const [scrolled, setScrolled] = useState(false)
  const [visible, setVisible]   = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 60)
    window.addEventListener('scroll', onScroll)
    setTimeout(() => setVisible(true), 100)
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <div style={{ fontFamily: "'Sora', 'DM Sans', sans-serif", background: '#f8fafc', minHeight: '100vh', overflowX: 'hidden' }}>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Sora:wght@300;400;500;600;700;800&family=Playfair+Display:wght@700;800;900&display=swap');

        * { box-sizing: border-box; margin: 0; padding: 0; }

        .hero-title {
          font-family: 'Playfair Display', serif;
          font-size: clamp(36px, 6vw, 72px);
          font-weight: 900;
          line-height: 1.1;
          color: #fff;
          text-shadow: 0 4px 24px rgba(0,0,0,.3);
        }

        .nav-link {
          color: rgba(255,255,255,.85);
          font-size: 14px;
          font-weight: 600;
          text-decoration: none;
          transition: color .2s;
          cursor: pointer;
        }
        .nav-link:hover { color: #fff; }

        .btn-cta {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          background: linear-gradient(135deg, #0ea5e9, #6366f1);
          color: #fff;
          border: none;
          border-radius: 14px;
          padding: 14px 32px;
          font-size: 16px;
          font-weight: 700;
          cursor: pointer;
          transition: all .25s cubic-bezier(.175,.885,.32,1.275);
          box-shadow: 0 8px 24px rgba(14,165,233,.35);
          font-family: 'Sora', sans-serif;
        }
        .btn-cta:hover {
          transform: translateY(-3px) scale(1.03);
          box-shadow: 0 16px 40px rgba(14,165,233,.45);
        }

        .btn-outline-white {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          background: rgba(255,255,255,.12);
          color: #fff;
          border: 1.5px solid rgba(255,255,255,.3);
          border-radius: 14px;
          padding: 13px 28px;
          font-size: 15px;
          font-weight: 600;
          cursor: pointer;
          transition: all .2s;
          backdrop-filter: blur(8px);
          font-family: 'Sora', sans-serif;
        }
        .btn-outline-white:hover {
          background: rgba(255,255,255,.22);
          border-color: rgba(255,255,255,.6);
          transform: translateY(-2px);
        }

        .feature-card {
          background: #fff;
          border-radius: 20px;
          padding: 28px 24px;
          border: 1px solid #e8ecf4;
          transition: all .3s cubic-bezier(.175,.885,.32,1.275);
          cursor: default;
        }
        .feature-card:hover {
          transform: translateY(-8px);
          box-shadow: 0 20px 48px rgba(15,31,61,.1);
          border-color: transparent;
        }

        .stat-card {
          text-align: center;
          padding: 24px 20px;
        }

        .testimonial-card {
          background: #fff;
          border-radius: 20px;
          padding: 28px 24px;
          border: 1px solid #e8ecf4;
          transition: transform .3s;
        }
        .testimonial-card:hover { transform: translateY(-4px); box-shadow: 0 16px 40px rgba(15,31,61,.08); }

        .floating-badge {
          background: rgba(255,255,255,.15);
          backdrop-filter: blur(12px);
          border: 1px solid rgba(255,255,255,.25);
          border-radius: 50px;
          padding: 8px 18px;
          color: #fff;
          font-size: 13px;
          font-weight: 600;
          display: inline-flex;
          align-items: center;
          gap: 8px;
        }

        .hero-img-card {
          background: rgba(255,255,255,.12);
          backdrop-filter: blur(16px);
          border: 1px solid rgba(255,255,255,.2);
          border-radius: 20px;
          padding: 20px;
          color: #fff;
        }

        @keyframes float {
          0%,100% { transform: translateY(0px); }
          50%      { transform: translateY(-12px); }
        }
        @keyframes fadeUp {
          from { opacity:0; transform:translateY(30px); }
          to   { opacity:1; transform:translateY(0); }
        }
        .fade-up { animation: fadeUp .7s ease forwards; }
        .float   { animation: float 4s ease-in-out infinite; }

        .section-label {
          font-size: 12px;
          font-weight: 700;
          letter-spacing: 2.5px;
          text-transform: uppercase;
          color: #0ea5e9;
          margin-bottom: 12px;
        }
        .section-title {
          font-family: 'Playfair Display', serif;
          font-size: clamp(28px, 4vw, 44px);
          font-weight: 800;
          color: #0f1f3d;
          line-height: 1.2;
        }

        .nav-scrolled {
          background: rgba(15,31,61,.96) !important;
          backdrop-filter: blur(20px);
          box-shadow: 0 4px 24px rgba(0,0,0,.15);
        }
      `}</style>

      {/* ══════════════════════════
          NAVBAR
      ══════════════════════════ */}
      <nav style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100,
        padding: '18px 5%',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        background: scrolled ? 'rgba(15,31,61,.96)' : 'transparent',
        backdropFilter: scrolled ? 'blur(20px)' : 'none',
        boxShadow: scrolled ? '0 4px 24px rgba(0,0,0,.15)' : 'none',
        transition: 'all .3s ease',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: 'linear-gradient(135deg, #0ea5e9, #6366f1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>🎓</div>
          <span style={{ fontFamily: 'Playfair Display, serif', fontSize: 22, fontWeight: 800, color: '#fff' }}>UniLearn</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 32 }}>
          <span className="nav-link" onClick={() => document.getElementById('features')?.scrollIntoView({ behavior: 'smooth' })}>Fonctionnalités</span>
          <span className="nav-link" onClick={() => document.getElementById('testimonials')?.scrollIntoView({ behavior: 'smooth' })}>Témoignages</span>
          <span className="nav-link" onClick={() => document.getElementById('about')?.scrollIntoView({ behavior: 'smooth' })}>À propos</span>
        </div>
        <button className="btn-cta" style={{ padding: '10px 24px', fontSize: 14 }} onClick={() => navigate('/login')}>
          Se connecter →
        </button>
      </nav>

      {/* ══════════════════════════
          HERO
      ══════════════════════════ */}
      <section style={{
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #0f1f3d 0%, #1a3a6e 45%, #0f2d6e 70%, #0d1f4a 100%)',
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        padding: '120px 5% 80px',
        overflow: 'hidden',
      }}>
        {/* Cercles décoratifs */}
        <div style={{ position: 'absolute', top: -80, right: -80, width: 500, height: 500, borderRadius: '50%', background: 'rgba(99,102,241,.12)', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', bottom: -100, left: '30%', width: 400, height: 400, borderRadius: '50%', background: 'rgba(14,165,233,.1)', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', top: '20%', left: '5%', width: 200, height: 200, borderRadius: '50%', background: 'rgba(139,92,246,.08)', pointerEvents: 'none' }} />

        {/* Grille décorative */}
        <div style={{
          position: 'absolute', inset: 0, opacity: .04,
          backgroundImage: 'linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)',
          backgroundSize: '60px 60px',
          pointerEvents: 'none',
        }} />

        <div style={{ maxWidth: 1200, margin: '0 auto', width: '100%', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 60, alignItems: 'center' }}>

          {/* Texte gauche */}
          <div style={{ opacity: visible ? 1 : 0, transform: visible ? 'translateY(0)' : 'translateY(30px)', transition: 'all .8s ease' }}>
            <div className="floating-badge" style={{ marginBottom: 24 }}>
              🌍 Université de Ngaoundéré · Cameroun
            </div>
            <h1 className="hero-title" style={{ marginBottom: 24 }}>
              Apprenez<br />
              <span style={{ background: 'linear-gradient(90deg, #0ea5e9, #8b5cf6)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                Sans Limites
              </span>
              <br />Progressez Vite
            </h1>
            <p style={{ fontSize: 17, color: 'rgba(255,255,255,.7)', lineHeight: 1.75, marginBottom: 36, maxWidth: 480 }}>
              UniLearn est la plateforme e-learning officielle de l'université. Accédez à vos cours, soumettez vos devoirs et suivez votre progression depuis n'importe où.
            </p>
            <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
              <button className="btn-cta" onClick={() => navigate('/login')}>
                🚀 Accéder à la plateforme
              </button>
              <button className="btn-outline-white" onClick={() => document.getElementById('features')?.scrollIntoView({ behavior: 'smooth' })}>
                Découvrir →
              </button>
            </div>
            {/* Stats mini */}
            <div style={{ display: 'flex', gap: 32, marginTop: 48, paddingTop: 32, borderTop: '1px solid rgba(255,255,255,.1)' }}>
              {STATS.slice(0, 3).map((s, i) => (
                <div key={i}>
                  <div style={{ fontSize: 26, fontWeight: 800, color: '#fff', fontFamily: 'Playfair Display, serif' }}>{s.value}</div>
                  <div style={{ fontSize: 12, color: 'rgba(255,255,255,.5)', marginTop: 2 }}>{s.label}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Visuel droite */}
          <div style={{ position: 'relative', opacity: visible ? 1 : 0, transform: visible ? 'translateY(0)' : 'translateY(40px)', transition: 'all .9s ease .2s' }}>

            {/* Carte principale */}
            <div className="float hero-img-card" style={{ padding: 0, overflow: 'hidden', borderRadius: 24 }}>
              {/* Simulation d'une salle de cours en ligne */}
              <div style={{
                background: 'linear-gradient(135deg, #1e3a5f 0%, #0ea5e9 100%)',
                padding: '28px 24px 0',
                textAlign: 'center',
              }}>
                <div style={{ fontSize: 64, marginBottom: 8 }}>🎓</div>
                <div style={{ color: '#fff', fontWeight: 700, fontSize: 16, marginBottom: 4 }}>Cours en direct</div>
                <div style={{ color: 'rgba(255,255,255,.6)', fontSize: 13, marginBottom: 20 }}>Mécanique des Fluides — L3</div>
                {/* Avatars */}
                <div style={{ display: 'flex', justifyContent: 'center', gap: -8, marginBottom: 20 }}>
                  {['AM','KO','FB','NE','LD'].map((initials, i) => (
                    <div key={i} style={{
                      width: 36, height: 36, borderRadius: '50%',
                      background: ['#0ea5e9','#8b5cf6','#f59e0b','#22c55e','#ef4444'][i],
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 11, fontWeight: 700, color: '#fff',
                      border: '2px solid rgba(255,255,255,.2)',
                      marginLeft: i > 0 ? -6 : 0,
                    }}>{initials}</div>
                  ))}
                  <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'rgba(255,255,255,.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: '#fff', border: '2px solid rgba(255,255,255,.2)', marginLeft: -6 }}>+24</div>
                </div>
              </div>
              {/* Stats de la session */}
              <div style={{ background: 'rgba(255,255,255,.08)', padding: '16px 24px', display: 'flex', justifyContent: 'space-around' }}>
                {[['🔴','En direct'],['👥','32 présents'],['📖','12 leçons']].map(([icon, label], i) => (
                  <div key={i} style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 18 }}>{icon}</div>
                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,.7)', marginTop: 2 }}>{label}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Badge flottant haut-droite */}
            <div style={{
              position: 'absolute', top: -20, right: -20,
              background: '#22c55e', borderRadius: 16, padding: '12px 18px',
              color: '#fff', fontSize: 13, fontWeight: 700,
              boxShadow: '0 8px 24px rgba(34,197,94,.4)',
              display: 'flex', alignItems: 'center', gap: 8,
            }}>
              ✓ 98% satisfaction
            </div>

            {/* Badge flottant bas-gauche */}
            <div style={{
              position: 'absolute', bottom: -20, left: -20,
              background: '#fff', borderRadius: 16, padding: '12px 18px',
              color: '#0f1f3d', fontSize: 13, fontWeight: 700,
              boxShadow: '0 8px 32px rgba(15,31,61,.15)',
              display: 'flex', alignItems: 'center', gap: 8,
            }}>
              📈 <span>+47% de réussite aux examens</span>
            </div>

            {/* Carte devoir rendu */}
            <div style={{
              position: 'absolute', top: '40%', right: -40,
              background: '#fff', borderRadius: 14, padding: '14px 18px',
              color: '#0f1f3d', boxShadow: '0 8px 32px rgba(15,31,61,.12)',
              minWidth: 160,
            }}>
              <div style={{ fontSize: 11, color: '#64748b', marginBottom: 4 }}>Devoir rendu ✓</div>
              <div style={{ fontSize: 13, fontWeight: 700 }}>Série 3 — RDM</div>
              <div style={{ height: 6, background: '#f1f5f9', borderRadius: 4, marginTop: 8, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: '78%', background: 'linear-gradient(90deg, #0ea5e9, #6366f1)', borderRadius: 4 }} />
              </div>
              <div style={{ fontSize: 10, color: '#64748b', marginTop: 4 }}>Progression : 78%</div>
            </div>
          </div>
        </div>
      </section>

      {/* ══════════════════════════
          STATS
      ══════════════════════════ */}
      <section style={{ background: '#0f1f3d', padding: '60px 5%' }}>
        <div style={{ maxWidth: 1000, margin: '0 auto', display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 0 }}>
          {STATS.map((s, i) => (
            <div key={i} className="stat-card" style={{ borderRight: i < 3 ? '1px solid rgba(255,255,255,.08)' : 'none' }}>
              <div style={{ fontFamily: 'Playfair Display, serif', fontSize: 42, fontWeight: 900, color: '#0ea5e9', lineHeight: 1 }}>{s.value}</div>
              <div style={{ fontSize: 14, color: 'rgba(255,255,255,.5)', marginTop: 8, fontWeight: 500 }}>{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ══════════════════════════
          FEATURES
      ══════════════════════════ */}
      <section id="features" style={{ padding: '100px 5%', background: '#f8fafc' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 60 }}>
            <div className="section-label">Fonctionnalités</div>
            <h2 className="section-title">Tout ce dont vous avez besoin<br />pour apprendre efficacement</h2>
            <p style={{ fontSize: 16, color: '#64748b', marginTop: 16, maxWidth: 520, margin: '16px auto 0' }}>
              Une suite complète d'outils conçus pour transformer l'expérience d'apprentissage universitaire.
            </p>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 24 }}>
            {FEATURES.map((f, i) => (
              <div key={i} className="feature-card">
                <div style={{ width: 52, height: 52, borderRadius: 14, background: `${f.color}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26, marginBottom: 18 }}>
                  {f.icon}
                </div>
                <h3 style={{ fontSize: 17, fontWeight: 700, color: '#0f1f3d', marginBottom: 10 }}>{f.title}</h3>
                <p style={{ fontSize: 14, color: '#64748b', lineHeight: 1.7 }}>{f.desc}</p>
                <div style={{ marginTop: 16, height: 3, borderRadius: 2, background: f.color, width: 40 }} />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════════════════════
          VISUEL CENTRAL
      ══════════════════════════ */}
      <section style={{
        background: 'linear-gradient(135deg, #1a3a6e 0%, #0f1f3d 100%)',
        padding: '100px 5%',
        position: 'relative',
        overflow: 'hidden',
      }}>
        <div style={{ position: 'absolute', top: -60, right: -60, width: 400, height: 400, borderRadius: '50%', background: 'rgba(99,102,241,.1)', pointerEvents: 'none' }} />
        <div style={{ maxWidth: 1200, margin: '0 auto', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 80, alignItems: 'center' }}>

          {/* Gauche : illustration dashboard */}
          <div style={{ position: 'relative' }}>
            <div style={{ background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.12)', borderRadius: 24, padding: 24, backdropFilter: 'blur(12px)' }}>
              <div style={{ fontSize: 13, color: 'rgba(255,255,255,.5)', marginBottom: 16, fontWeight: 600 }}>Tableau de bord étudiant</div>
              {/* Cours en progression */}
              {[
                { title: 'Thermodynamique', pct: 75, color: '#0ea5e9' },
                { title: 'Mécanique des Fluides', pct: 45, color: '#8b5cf6' },
                { title: 'Résistance des Matériaux', pct: 90, color: '#22c55e' },
                { title: 'Mathématiques Avancées', pct: 30, color: '#f59e0b' },
              ].map((c, i) => (
                <div key={i} style={{ marginBottom: 16 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                    <span style={{ fontSize: 13, color: 'rgba(255,255,255,.8)', fontWeight: 500 }}>{c.title}</span>
                    <span style={{ fontSize: 12, color: c.color, fontWeight: 700 }}>{c.pct}%</span>
                  </div>
                  <div style={{ height: 8, background: 'rgba(255,255,255,.08)', borderRadius: 4, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${c.pct}%`, background: `linear-gradient(90deg, ${c.color}88, ${c.color})`, borderRadius: 4, transition: 'width 1s ease' }} />
                  </div>
                </div>
              ))}
              <div style={{ marginTop: 20, padding: '14px 16px', background: 'rgba(14,165,233,.15)', borderRadius: 12, border: '1px solid rgba(14,165,233,.3)', display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ fontSize: 22 }}>🎯</span>
                <div>
                  <div style={{ fontSize: 12, color: '#0ea5e9', fontWeight: 700 }}>Prochain examen</div>
                  <div style={{ fontSize: 13, color: 'rgba(255,255,255,.8)', marginTop: 2 }}>Thermodynamique — Dans 3 jours</div>
                </div>
              </div>
            </div>
          </div>

          {/* Droite : texte */}
          <div>
            <div className="section-label" style={{ color: '#0ea5e9' }}>Pour les étudiants</div>
            <h2 style={{ fontFamily: 'Playfair Display, serif', fontSize: 38, fontWeight: 800, color: '#fff', lineHeight: 1.2, marginBottom: 24 }}>
              Votre apprentissage,<br />à votre rythme
            </h2>
            <p style={{ fontSize: 16, color: 'rgba(255,255,255,.65)', lineHeight: 1.8, marginBottom: 32 }}>
              Suivez votre progression cours par cours, recevez des notifications pour vos devoirs et examens, et accédez à tous vos supports pédagogiques en un clic.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginBottom: 36 }}>
              {['Accès illimité aux cours PDF et vidéo', 'Notifications pour les deadlines', 'Suivi de progression en temps réel', 'Forum de discussion par cours'].map((item, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ width: 22, height: 22, borderRadius: '50%', background: '#0ea5e9', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 11, fontWeight: 700, color: '#fff' }}>✓</div>
                  <span style={{ fontSize: 15, color: 'rgba(255,255,255,.8)' }}>{item}</span>
                </div>
              ))}
            </div>
            <button className="btn-cta" onClick={() => navigate('/login')}>
              Commencer maintenant →
            </button>
          </div>
        </div>
      </section>

      {/* ══════════════════════════
          TÉMOIGNAGES
      ══════════════════════════ */}
      <section id="testimonials" style={{ padding: '100px 5%', background: '#f8fafc' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 60 }}>
            <div className="section-label">Témoignages</div>
            <h2 className="section-title">Ce qu'ils disent d'UniLearn</h2>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 24 }}>
            {TESTIMONIALS.map((t, i) => (
              <div key={i} className="testimonial-card">
                <div style={{ fontSize: 32, color: '#e2e8f0', marginBottom: 16, fontFamily: 'serif', lineHeight: 1 }}>"</div>
                <p style={{ fontSize: 15, color: '#475569', lineHeight: 1.75, marginBottom: 24 }}>{t.text}</p>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ width: 44, height: 44, borderRadius: '50%', background: t.color, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: 14, flexShrink: 0 }}>{t.avatar}</div>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 14, color: '#0f1f3d' }}>{t.name}</div>
                    <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>{t.role}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════════════════════
          CTA FINAL
      ══════════════════════════ */}
      <section id="about" style={{
        background: 'linear-gradient(135deg, #0ea5e9 0%, #6366f1 50%, #0f1f3d 100%)',
        padding: '100px 5%',
        textAlign: 'center',
        position: 'relative',
        overflow: 'hidden',
      }}>
        <div style={{ position: 'absolute', top: -80, left: '20%', width: 300, height: 300, borderRadius: '50%', background: 'rgba(255,255,255,.05)', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', bottom: -60, right: '15%', width: 250, height: 250, borderRadius: '50%', background: 'rgba(255,255,255,.05)', pointerEvents: 'none' }} />
        <div style={{ position: 'relative', maxWidth: 680, margin: '0 auto' }}>
          <div style={{ fontSize: 52, marginBottom: 20 }}>🎓</div>
          <h2 style={{ fontFamily: 'Playfair Display, serif', fontSize: 42, fontWeight: 900, color: '#fff', lineHeight: 1.2, marginBottom: 20 }}>
            Prêt à transformer votre parcours académique ?
          </h2>
          <p style={{ fontSize: 17, color: 'rgba(255,255,255,.75)', lineHeight: 1.7, marginBottom: 40 }}>
            Rejoignez des centaines d'étudiants qui utilisent UniLearn pour réussir leurs études à l'Université de Ngaoundéré.
          </p>
          <button className="btn-cta" style={{ fontSize: 17, padding: '16px 40px' }} onClick={() => navigate('/login')}>
            Se connecter à UniLearn →
          </button>
          <div style={{ marginTop: 20, fontSize: 13, color: 'rgba(255,255,255,.5)' }}>
            Utilisez vos identifiants universitaires pour vous connecter
          </div>
        </div>
      </section>

      {/* ══════════════════════════
          FOOTER
      ══════════════════════════ */}
      <footer style={{ background: '#0a1628', padding: '40px 5%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: 'linear-gradient(135deg, #0ea5e9, #6366f1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>🎓</div>
          <span style={{ fontFamily: 'Playfair Display, serif', fontSize: 18, fontWeight: 700, color: '#fff' }}>UniLearn</span>
        </div>
        <div style={{ fontSize: 13, color: 'rgba(255,255,255,.3)' }}>
          © 2025 UniLearn · Université de Ngaoundéré · Tous droits réservés
        </div>
        <button className="btn-cta" style={{ padding: '8px 20px', fontSize: 13 }} onClick={() => navigate('/login')}>
          Se connecter
        </button>
      </footer>
    </div>
  )
}
