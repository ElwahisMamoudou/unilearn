import { useEffect, useRef, useState } from 'react'
import { Routes, Route, Navigate, NavLink, Link, useLocation, useNavigate } from 'react-router-dom'
import useAuthStore from './store/authStore'
import Sidebar, { navItemsFor } from './components/Sidebar'
import Logo from './components/Logo'
import ForgotPasswordPage from './pages/ForgotPasswordPage'
import ResetPasswordPage from './pages/ResetPasswordPage'
import SearchPage from './pages/SearchPage'
import ReportsPage from './pages/ReportsPage'
import GroupsPage from './pages/GroupsPage'
import NotificationBell from './components/NotificationBell'
import Dashboard from './pages/Dashboard'
import CoursesPage from './pages/CoursesPage'
import CourseDetail from './pages/CourseDetail'
import LessonViewer from './pages/LessonViewer'
import TeacherDashboard from './pages/TeacherDashboard'
import MessagesPage from './pages/MessagesPage'
import AdminDashboard from './pages/AdminDashboard'
import ForumPage from './pages/ForumPage'
import ExamPage from './pages/ExamPage'
import HomeworkPage from './pages/HomeworkPage'
import ClassesPage from './pages/ClassesPage'
import ClassDetail from './pages/ClassDetail'
import VideoRoom from './pages/VideoRoom'
import LoginPage from './pages/LoginPage'
import ProfilePage from './pages/ProfilePage'
import LandingPage from './pages/LandingPage'
import CallbackPage from './pages/CallbackPage'

function ProtectedRoute({ children }) {
  const { token } = useAuthStore()
  return token ? children : <Navigate to="/login" replace />
}

const PAGE_TITLES = {
  '/home':       'Tableau de bord',
  '/courses':    'Catalogue des cours',
  '/my-courses': 'Mes cours',
  '/teacher':    'Espace enseignant',
  '/messages':   'Messagerie',
  '/admin':      'Classes & Promotions',
  '/exams':      'Evaluations',
  '/homeworks':  'Devoirs',
  '/classes':    'Classes & Promotions',
  '/profile':    'Mon profil',
  '/search':     'Recherche',
  '/reports':    'Rapports et journaux',
}

function pageTitle(pathname) {
  if (PAGE_TITLES[pathname]) return PAGE_TITLES[pathname]
  if (/^\/courses\/\d+\/groups$/.test(pathname)) return 'Groupes du cours'
  if (pathname.startsWith('/courses/')) return 'Cours'
  if (pathname.startsWith('/classes/')) return 'Classe'
  if (pathname.startsWith('/forum/'))   return 'Forum'
  return 'UniLearn'
}

const ROLE_LABELS = { admin: 'Administrateur', teacher: 'Enseignant', student: 'Etudiant' }

function AppLayout() {
  const [drawerOpen, setDrawerOpen] = useState(() => window.innerWidth >= 992)
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef(null)
  const { user, logout } = useAuthStore()
  const location = useLocation()
  const navigate = useNavigate()
  const canViewClasses = ['admin', 'teacher', 'student'].includes(user?.role)

  // ferme le menu utilisateur quand on clique ailleurs
  useEffect(() => {
    const close = e => { if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false) }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])

  const isViewer = location.pathname.startsWith('/lesson/')
  if (isViewer) return <Routes><Route path="/lesson/:id" element={<LessonViewer />} /></Routes>

  const title = pageTitle(location.pathname)
  const initials = user?.name?.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2) || 'U'
  const doLogout = () => { logout(); navigate('/') }
  const [searchText, setSearchText] = useState('')
  const submitSearch = e => {
    e.preventDefault()
    if (searchText.trim().length >= 2) navigate(`/search?q=${encodeURIComponent(searchText.trim())}`)
  }
  const closeDrawerOnMobile = () => { if (window.innerWidth < 992) setDrawerOpen(false) }

  return (
    <div className={`app-shell${drawerOpen ? ' drawer-open' : ''}`}>
      <header className="navbar-moodle">
        <button className="nav-toggle" onClick={() => setDrawerOpen(v => !v)} aria-label="Ouvrir ou fermer le menu">&#9776;</button>
        <Link to="/home" className="brand">
          <Logo />
          <span>UniLearn</span>
        </Link>
        <nav className="nav-primary" aria-label="Navigation principale">
          {navItemsFor(user?.role).filter(i => i.to !== '/messages').map(i => (
            <NavLink key={i.to} to={i.to} end className={({ isActive }) => (isActive ? 'active' : '')}>{i.text}</NavLink>
          ))}
        </nav>
        <form className="nav-search" onSubmit={submitSearch} role="search">
          <input value={searchText} onChange={e => setSearchText(e.target.value)} placeholder="Rechercher…" aria-label="Recherche globale" />
          <button type="submit" aria-label="Lancer la recherche">🔍</button>
        </form>
        <div className="nav-right">
          <NotificationBell />
          <div className="user-menu" ref={menuRef}>
            <button className="user-trigger" onClick={() => setMenuOpen(v => !v)} aria-haspopup="menu" aria-expanded={menuOpen}>
              <span className="user-avatar">{initials}</span>
              <span className="user-name">{user?.name?.split(' ')[0]}</span>
              <span aria-hidden="true">&#9662;</span>
            </button>
            {menuOpen && (
              <div className="dropdown" role="menu">
                <div className="dropdown-head">
                  <p>{user?.name}</p>
                  <span>{ROLE_LABELS[user?.role] || ''}</span>
                </div>
                <Link to="/profile" onClick={() => setMenuOpen(false)}>Profil</Link>
                <Link to="/messages" onClick={() => setMenuOpen(false)}>Messages</Link>
                <button onClick={doLogout}>Déconnexion</button>
              </div>
            )}
          </div>
        </div>
      </header>

      <Sidebar onClose={() => setDrawerOpen(false)} onNavigate={closeDrawerOnMobile} />

      <div className="main">
        <div className="page-header">
          <nav className="breadcrumb" aria-label="Fil d'Ariane">
            {location.pathname !== '/home' && <Link to="/home">Accueil</Link>}
            <span>{title}</span>
          </nav>
          <h1 className="page-title">{title}</h1>
        </div>
        <main className="content">
          <Routes>
            <Route path="/home"            element={<Dashboard />} />
            <Route path="/"                element={<Navigate to="/home" replace />} />
            <Route path="/courses"         element={<CoursesPage />} />
            <Route path="/courses/:id"     element={<CourseDetail />} />
            <Route path="/my-courses"      element={<CoursesPage myOnly />} />
            <Route path="/teacher"         element={
              user?.role === 'teacher' || user?.role === 'admin'
                ? <TeacherDashboard />
                : <Navigate to="/home" replace />
            } />
            <Route path="/messages"        element={<MessagesPage />} />
            <Route path="/admin"           element={
              user?.role === 'admin'
                ? <AdminDashboard />
                : <Navigate to="/home" replace />
            } />
            <Route path="/forum/:courseId" element={<ForumPage />} />
            <Route path="/exams"           element={<ExamPage />} />
            <Route path="/homeworks"       element={<HomeworkPage />} />
            <Route path="/classes"         element={
              canViewClasses
                ? <ClassesPage />
                : <Navigate to="/home" replace />
            } />
            <Route path="/classes/:id"     element={
              canViewClasses
                ? <ClassDetail />
                : <Navigate to="/home" replace />
            } />
            <Route path="/profile"         element={<ProfilePage />} />
            <Route path="/search"          element={<SearchPage />} />
            <Route path="/courses/:courseId/groups" element={<GroupsPage />} />
            <Route path="/reports"         element={
              ['admin', 'teacher'].includes(user?.role) ? <ReportsPage /> : <Navigate to="/home" replace />
            } />
            <Route path="*"               element={<Navigate to="/home" replace />} />
          </Routes>
        </main>
        <footer className="site-footer">
          <span>
            Vous êtes connecté sous le nom « {user?.name} » (<button onClick={doLogout}>Déconnexion</button>)
          </span>
          <span>UniLearn — Université de Ngaoundéré</span>
        </footer>
      </div>
    </div>
  )
}

export default function App() {
  const { token } = useAuthStore()

  return (
    <Routes>
      {/* Page d'accueil publique — accessible sans connexion */}
      <Route path="/"
        element={token ? <Navigate to="/home" replace /> : <LandingPage />}
      />

      {/* Connexion */}
      <Route path="/login"
        element={token ? <Navigate to="/home" replace /> : <LoginPage />}
      />

      {/* Mot de passe oublié (public) */}
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password"  element={<ResetPasswordPage />} />

      {/* OAuth callback — DOIT être AVANT /* (wildcard) */}
      <Route path="/callback" 
        element={<CallbackPage />} 
      />

      {/* Pages protégées */}
      <Route path="/lesson/:id"   element={<ProtectedRoute><LessonViewer /></ProtectedRoute>} />
      <Route path="/room/:roomId" element={<ProtectedRoute><VideoRoom /></ProtectedRoute>} />
      <Route path="/*"            element={<ProtectedRoute><AppLayout /></ProtectedRoute>} />
    </Routes>
  )
}
