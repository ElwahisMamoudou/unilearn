import { NavLink, useNavigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import useAuthStore from '../store/authStore'
import api from '../api/client'

const NAV_STUDENT = [
  { to: '/home',       label: 'Tableau de bord' },
  { to: '/my-courses', label: 'Mes cours' },
  { to: '/exams',      label: 'Examens' },
  { to: '/homeworks',  label: 'Devoirs' },
  { to: '/messages',   label: 'Messages', badge: true },
]

const NAV_TEACHER = [
  { to: '/home',      label: 'Tableau de bord' },
  { to: '/teacher',   label: 'Mes cours assignes' },
  { to: '/classes',   label: 'Mes classes' },
  { to: '/exams',     label: 'Examens' },
  { to: '/homeworks', label: 'Devoirs' },
  { to: '/messages',  label: 'Messages', badge: true },
]

const NAV_ADMIN = [
  { to: '/home',     label: 'Tableau de bord' },
  { to: '/admin',    label: 'Classes & Promotions' },
  { to: '/messages', label: 'Messages', badge: true },
]

export default function Sidebar({ open, onClose }) {
  const { user, logout } = useAuthStore()
  const navigate = useNavigate()
  const [unread, setUnread] = useState(0)

  useEffect(() => {
    const load = () =>
      api.get('/messages/unread-count').then(r => setUnread(r.data.count)).catch(() => {})
    load()
    const interval = setInterval(load, 30000)
    return () => clearInterval(interval)
  }, [])

  const items =
    user?.role === 'admin'   ? NAV_ADMIN   :
    user?.role === 'teacher' ? NAV_TEACHER : NAV_STUDENT

  const initials  = user?.name?.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2) || 'U'
  const roleLabel =
    user?.role === 'admin'   ? 'Administrateur' :
    user?.role === 'teacher' ? 'Enseignant'      : 'Etudiant'

  return (
    <>
      {open && (
        <div
          onClick={onClose}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 199 }}
        />
      )}

      <aside
        className="sidebar"
        style={{
          position: 'fixed',
          top: 0, left: 0, bottom: 0,
          transform: open ? 'translateX(0)' : 'translateX(-100%)',
          transition: 'transform 0.25s ease',
          zIndex: 200,
        }}
      >
        <button
          onClick={onClose}
          aria-label="Fermer le menu"
          style={{
            position: 'absolute', top: 12, right: 12,
            background: 'none', border: 'none', fontSize: 20,
            color: 'rgba(255,255,255,.6)', cursor: 'pointer',
            padding: 4, lineHeight: 1,
          }}
        >
          ✕
        </button>

        <div className="sidebar-brand">
          <h1>UniLearn</h1>
          <p>Universite de Ngaoundere</p>
        </div>

        <nav className="sidebar-nav">
          <div className="nav-label">Navigation</div>
          {items.map(({ to, label, badge }) => (
            <NavLink
              key={to}
              to={to}
              end
              className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
              onClick={onClose}
            >
              {label}
              {badge && unread > 0 && (
                <span className="nav-badge">{unread > 99 ? '99+' : unread}</span>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-footer">
          <NavLink
            to="/profile"
            className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
            onClick={onClose}
            style={{ marginBottom: 10 }}
          >
            Mon profil
          </NavLink>
          <div className="user-card">
            <div className="user-avatar">{initials}</div>
            <div className="user-info">
              <p style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 100 }}>
                {user?.name}
              </p>
              <span>{roleLabel}</span>
            </div>
            <button
              className="logout-btn"
              title="Se deconnecter"
              onClick={() => { logout(); navigate('/') }}
            >
              Quitter
            </button>
          </div>
        </div>
      </aside>
    </>
  )
}
