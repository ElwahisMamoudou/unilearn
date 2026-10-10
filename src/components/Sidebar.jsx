import { NavLink } from 'react-router-dom'
import { useEffect, useState } from 'react'
import useAuthStore from '../store/authStore'
import api from '../api/client'

const NAV_STUDENT = [
  { to: '/home',       icon: '🏠', text: 'Tableau de bord' },
  { to: '/my-courses', icon: '📚', text: 'Mes cours' },
  { to: '/exams',      icon: '📋', text: 'Examens' },
  { to: '/homeworks',  icon: '📝', text: 'Devoirs' },
  { to: '/messages',   icon: '✉️', text: 'Messages', badge: true },
]

const NAV_TEACHER = [
  { to: '/home',      icon: '🏠', text: 'Tableau de bord' },
  { to: '/teacher',   icon: '📖', text: 'Mes cours' },
  { to: '/homeworks', icon: '📝', text: 'Devoirs' },
  { to: '/reports',   icon: '📊', text: 'Rapports' },
  { to: '/messages',  icon: '✉️', text: 'Messages', badge: true },
]

const NAV_ADMIN = [
  { to: '/home',     icon: '🏠', text: 'Tableau de bord' },
  { to: '/admin',    icon: '🏫', text: 'Classes & Promotions' },
  { to: '/courses',  icon: '📚', text: 'Tous les cours' },
  { to: '/reports',  icon: '📊', text: 'Rapports et journaux' },
  { to: '/messages', icon: '✉️', text: 'Messages', badge: true },
]

export function navItemsFor(role) {
  return role === 'admin' ? NAV_ADMIN : role === 'teacher' ? NAV_TEACHER : NAV_STUDENT
}

/** Tiroir de navigation de gauche (comme le menu latéral de Moodle). */
export default function Sidebar({ onClose, onNavigate }) {
  const { user } = useAuthStore()
  const [unread, setUnread] = useState(0)

  useEffect(() => {
    const load = () =>
      api.get('/messages/unread-count').then(r => setUnread(r.data.count)).catch(() => {})
    load()
    const interval = setInterval(load, 30000)
    return () => clearInterval(interval)
  }, [])

  return (
    <>
      <div className="drawer-backdrop" onClick={onClose} />
      <aside className="drawer" aria-label="Navigation">
        <div className="drawer-title">Navigation</div>
        <nav>
          {navItemsFor(user?.role).map(({ to, icon, text, badge }) => (
            <NavLink
              key={to}
              to={to}
              end
              className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
              onClick={onNavigate}
            >
              <span className="nav-icon">{icon}</span>
              {text}
              {badge && unread > 0 && (
                <span className="nav-badge">{unread > 99 ? '99+' : unread}</span>
              )}
            </NavLink>
          ))}
          <NavLink
            to="/profile"
            className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
            onClick={onNavigate}
          >
            <span className="nav-icon">👤</span>
            Mon profil
          </NavLink>
        </nav>
      </aside>
    </>
  )
}
