import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import api from '../api/client'
import useAuthStore from '../store/authStore'

const JITSI_DOMAIN = 'meet.jit.si'

export default function VideoRoom() {
  const { roomId } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const { user } = useAuthStore()

  const containerRef = useRef(null)
  const apiRef = useRef(null)
  const timerRef = useRef(null)
  const streamStartedRef = useRef(false)

  const [session, setSession] = useState(location.state?.session || null)
  const [duration, setDuration] = useState(0)
  const [status, setStatus] = useState('Préparation de la salle Jitsi...')
  const [ending, setEnding] = useState(false)
  const [message, setMessage] = useState('')

  const isTeacher = user?.role === 'teacher' || user?.role === 'admin'

  // FIX: timer unique (était déclaré deux fois)
  useEffect(() => {
    timerRef.current = setInterval(() => setDuration(v => v + 1), 1000)
    return () => clearInterval(timerRef.current)
  }, [])

  // FIX: chargement session corrigé (syntaxe cassée dans l'original)
  useEffect(() => {
    if (session?.id) return
    const load = async () => {
      try {
        const res = await api.get(`/sessions/room/${roomId}`)
        setSession(res.data)
      } catch {
        setMessage('Impossible de charger les informations du live.')
      }
    }
    load()
  }, [roomId, session?.id])

  // FIX: init Jitsi corrigé (return et dispose mal formés dans l'original)
  useEffect(() => {
    if (!session?.room_id || !containerRef.current) return

    const existing = document.querySelector('script[data-jitsi-external-api="true"]')
    const script = existing || document.createElement('script')
    script.src = `https://${JITSI_DOMAIN}/external_api.js`
    script.async = true
    script.dataset.jitsiExternalApi = 'true'

    const initJitsi = () => {
      if (!window.JitsiMeetExternalAPI || apiRef.current) return

      apiRef.current = new window.JitsiMeetExternalAPI(JITSI_DOMAIN, {
        roomName: `UniLearn-${session.room_id}`,
        parentNode: containerRef.current,
        userInfo: {
          displayName: user?.name || (isTeacher ? 'Enseignant' : 'Étudiant'),
          email: user?.email || undefined,
        },
        configOverwrite: {
          liveStreamingEnabled: true,
          fileRecordingsEnabled: false,
          prejoinPageEnabled: false,        // désactive la page "Rejoindre"
          prejoinConfig: { enabled: false },
          startWithAudioMuted: false,
          startWithVideoMuted: false,
          disableDeepLinking: true,
          toolbarButtons: [
            'microphone', 'camera', 'desktop', 'chat', 'participants-pane',
            'tileview', 'fullscreen', 'hangup', 'livestreaming', 'settings',
            'raisehand', 'videoquality',
          ],
        },
        interfaceConfigOverwrite: {  // FIX: était mal indenté
          SHOW_JITSI_WATERMARK: false,
          SHOW_WATERMARK_FOR_GUESTS: false,
        },
      })

      apiRef.current.addListener('videoConferenceJoined', () => {
        setStatus(isTeacher ? 'Live en cours...' : 'Connecté au cours en direct')
        startYouTubeStreaming()
      })

      apiRef.current.addListener('readyToClose', () => {
        if (!ending) navigate(-1)
      })
    }

    if (existing) {
      initJitsi()
    } else {
      script.onload = initJitsi
      script.onerror = () => setMessage('Impossible de charger Jitsi Meet.')
      document.head.appendChild(script)
    }

    // FIX: cleanup corrigé (était syntaxiquement invalide avec conn.send)
    return () => {
      try {
        apiRef.current?.dispose()
      } catch {}
      apiRef.current = null
      streamStartedRef.current = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.room_id])

  const startYouTubeStreaming = () => {
    if (!isTeacher || !session?.youtube_stream_key || streamStartedRef.current) return
    streamStartedRef.current = true

    setTimeout(() => {
      try {
        apiRef.current?.executeCommand('startRecording', {
          mode: 'stream',
          streamId: session.youtube_stream_key,
          youtubeStreamKey: session.youtube_stream_key,
        })
        setStatus('Live YouTube en cours...')
      } catch {
        setMessage('La salle est ouverte, mais le lancement automatique du streaming YouTube a échoué.')
      }
    }, 2500)
  }

  const fmtTime = seconds => {
    const value = Math.max(0, Number(seconds) || 0)
    const h = Math.floor(value / 3600)
    const m = Math.floor((value % 3600) / 60)
    const s = value % 60
    return h > 0
      ? `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
      : `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  }

  const endLive = async () => {
    if (!session?.id) return navigate(-1)
    try {
      setEnding(true)
      setStatus('Arrêt du streaming et sauvegarde...')
      try {
        apiRef.current?.executeCommand('stopRecording', 'stream')
      } catch {}
      const res = await api.post(`/sessions/${session.id}/end`)
      setSession(res.data)
      setMessage('Rediffusion disponible dans quelques minutes.')
      setTimeout(() => navigate(-1), 1800)
    } catch {
      setMessage('Impossible de terminer la session automatiquement.')
      setEnding(false)
    }
  }

  const leave = () => {
    try {
      apiRef.current?.executeCommand('hangup')
    } catch {}
    navigate(-1)
  }

  return (
    // FIX: div fermante manquante dans l'original
    <div style={{ height: '100vh', background: '#07111f', color: '#e5eefb', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, padding: '12px 18px', background: '#0f1b2d', borderBottom: '1px solid #24344d' }}>
        <div>
          <div style={{ fontSize: 13, color: '#93a4bc' }}>UniLearn Live · Jitsi Meet + YouTube</div>
          <div style={{ fontWeight: 700 }}>{session?.title || 'Cours en ligne'}</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 13, color: '#93a4bc' }}>{fmtTime(duration)}</span>
          <span style={{ fontSize: 12, fontWeight: 700, color: '#fecaca', background: '#7f1d1d', padding: '4px 10px', borderRadius: 999 }}>
            🔴 {status}
          </span>
          {isTeacher ? (
            <button className="btn btn-danger btn-sm" disabled={ending} onClick={endLive}>
              ⏹ Terminer et sauvegarder
            </button>
          ) : (
            <button className="btn btn-outline btn-sm" onClick={leave}>Quitter</button>
          )}
        </div>
      </div>

      {message && (
        <div style={{ padding: '10px 18px', background: '#1f2937', color: '#fef3c7', fontSize: 13 }}>
          {message}
        </div>
      )}

      <div ref={containerRef} style={{ flex: 1, minHeight: 0, height: '100%', width: '100%' }} />
    </div>
  )
}
