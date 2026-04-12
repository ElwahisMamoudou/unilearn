import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../api/client'
import useAuthStore from '../store/authStore'

export default function NotificationBell() {
  const { token } = useAuthStore()
  const navigate  = useNavigate()
  const [notifs, setNotifs]   = useState([])
  const [open, setOpen]       = useState(false)
  const [loading, setLoading] = useState(false)
  const ref = useRef(null)

  const unread = notifs.filter(n => !n.is_read).length

  // Charger les notifications
  const load = () => {
    if (!token) return
    api.get('/notifications')
      .then(r => setNotifs(r.data || []))
      .catch(() => {})
  }

  // Polling toutes les 30 secondes
  useEffect(() => {
    load()
    const interval = setInterval(load, 30000)
    return () => clearInterval(interval)
  }, [token])

  // Fermer en cliquant dehors
  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const markRead = async (notif) => {
    if (!notif.is_read) {
      await api.patch(`/notifications/${notif.id}/read`).catch(() => {})
      setNotifs(prev => prev.map(n => n.id === notif.id ? { ...n, is_read: true } : n))
    }
    setOpen(false)
    if (notif.link) navigate(notif.link)
  }

  const markAllRead = async () => {
    await api.post('/notifications/read-all').catch(() => {})
    setNotifs(prev => prev.map(n => ({ ...n, is_read: true })))
  }

  const iconFor = (type) => {
    if (type === 'message')     return '💬'
    if (type === 'exam')        return '📝'
    if (type === 'homework')    return '📚'
    if (type === 'correction')  return '✅'
    if (type === 'grade')       return '🎯'
    return '🔔'
  }

  const timeAgo = (dateStr) => {
    const diff = Date.now() - new Date(dateStr).getTime()
    const min  = Math.floor(diff / 60000)
    if (min < 1)   return "À l'instant"
    if (min < 60)  return `il y a ${min} min`
    const h = Math.floor(min / 60)
    if (h < 24)    return `il y a ${h}h`
    const d = Math.floor(h / 24)
    return `il y a ${d}j`
  }

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      {/* Bouton cloche */}
      <button
        onClick={() => { setOpen(v => !v); if (!open) load() }}
        style={{
          position: 'relative', background: 'none', border: 'none',
          cursor: 'pointer', fontSize: 22, padding: '4px 6px',
          color: 'var(--navy)', lineHeight: 1,
        }}
        title="Notifications"
      >
        🔔
        {unread > 0 && (
          <span style={{
            position: 'absolute', top: 0, right: 0,
            background: '#ef4444', color: '#fff',
            fontSize: 10, fontWeight: 700,
            minWidth: 16, height: 16,
            borderRadius: 8, display: 'flex',
            alignItems: 'center', justifyContent: 'center',
            padding: '0 3px', lineHeight: 1,
          }}>
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>

      {/* Panneau déroulant */}
      {open && (
        <div style={{
          position: 'absolute', right: 0, top: 'calc(100% + 8px)',
          width: 340, maxHeight: 440,
          background: 'var(--bg, #fff)',
          border: '1px solid var(--border)',
          borderRadius: 12, boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
          zIndex: 1000, overflow: 'hidden',
          display: 'flex', flexDirection: 'column',
        }}>
          {/* En-tête */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
            <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--navy)' }}>
              Notifications {unread > 0 && <span style={{ color: '#ef4444' }}>({unread})</span>}
            </span>
            {unread > 0 && (
              <button onClick={markAllRead}
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: '#2563eb' }}>
                Tout marquer lu
              </button>
            )}
          </div>

          {/* Liste */}
          <div style={{ overflowY: 'auto', flex: 1 }}>
            {notifs.length === 0 ? (
              <div style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 14 }}>
                <div style={{ fontSize: 32, marginBottom: 8 }}>🔔</div>
                Aucune notification
              </div>
            ) : notifs.map(n => (
              <div key={n.id}
                onClick={() => markRead(n)}
                style={{
                  display: 'flex', alignItems: 'flex-start', gap: 12,
                  padding: '12px 16px', cursor: 'pointer',
                  background: n.is_read ? 'transparent' : '#eff6ff',
                  borderBottom: '1px solid var(--border)',
                  transition: 'background 0.15s',
                }}
                onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'}
                onMouseLeave={e => e.currentTarget.style.background = n.is_read ? 'transparent' : '#eff6ff'}
              >
                <span style={{ fontSize: 20, flexShrink: 0, marginTop: 1 }}>{iconFor(n.type)}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, color: 'var(--navy)', lineHeight: 1.4, fontWeight: n.is_read ? 400 : 600 }}>
                    {n.message}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3 }}>
                    {timeAgo(n.created_at)}
                  </div>
                </div>
                {!n.is_read && (
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#3b82f6', flexShrink: 0, marginTop: 4 }} />
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}