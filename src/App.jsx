import { useState } from 'react'
import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import useAuthStore from './store/authStore'
import Sidebar from './components/Sidebar'
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
import YouTubeSetupPage from './pages/YouTubeSetupPage'

function ProtectedRoute({ children }) {
  const { token } = useAuthStore()
  return token ? children : <Navigate to="/login" replace />
}

function AppLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const { user } = useAuthStore()
  const location = useLocation()
  const canViewClasses = ['admin', 'teacher', 'student'].includes(user?.role)

  const isViewer = location.pathname.startsWith('/lesson/')
  const isRoom   = location.pathname.startsWith('/room/')
  const isYouTube = location.pathname.startsWith('/youtube-setup')

  if (isViewer) return <Routes><Route path="/lesson/:id" element={<LessonViewer />} /></Routes>
  if (isRoom)   return <Routes><Route path="/room/:roomId" element={<VideoRoom />} /></Routes>
  if (isYouTube) return <Routes><Route path="/youtube-setup" element={<YouTubeSetupPage />} /></Routes>

  const pageTitles = {
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
    '/youtube-setup': '🎬 Configuration YouTube',
  }
  const title = pageTitles[location.pathname] || 'UniLearn'

  return (
    <div className="app-shell">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="main">
        <header className="topbar">
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <button
              onClick={() => setSidebarOpen(v => !v)}
              style={{ background: 'none', border: 'none', fontSize: 22, color: 'var(--navy)', padding: 4 }}
              className="hamburger"
            >
              &#9776;
            </button>
            <span className="topbar-title">{title}</span>
          </div>
          <div className="topbar-actions" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <NotificationBell />
            <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>{user?.name?.split(' ')[0]}</span>
          </div>
        </header>
        <main className="content">
          <Routes>
            <Route path="/home"            element={<Dashboard />} />
            <Route path="/"                element={<Navigate to="/home" replace />} />
            <Route path="/courses"         element={<CoursesPage />} />
            <Route path="/courses/:id"     element={<CourseDetail />} />
            <Route path="/my-courses"      element={<CoursesPage myOnly />} />
            <Route path="/teacher"         element={<TeacherDashboard />} />
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
            <Route path="/youtube-setup"   element={<YouTubeSetupPage />} />
            <Route path="*"               element={<Navigate to="/home" replace />} />
          </Routes>
        </main>
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
