/**
 * LiveRoom.jsx — Salle de cours en ligne
 *
 * Fonctionnalités :
 *   - Enseignant : enregistrement local via MediaRecorder (écran + micro)
 *     → upload automatique vers POST /api/sessions/:id/recording à la fin
 *   - Étudiant : rejoindre la salle Jitsi + voir la rediffusion si disponible
 *   - Barre de progression pendant l'upload
 *   - Gestion des erreurs (navigateur non compatible, permission refusée…)
 */

import { useEffect, useRef, useState, useCallback } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import api from '../api/client'
import useAuthStore from '../store/authStore'

/* ── Config Jitsi ── */
const JITSI_DOMAIN = 'meet.jit.si'

/* ── Taille max upload : 2 GB ── */
const MAX_RECORDING_BYTES = 2 * 1024 * 1024 * 1024

export default function LiveRoom() {
  const { roomId }      = useParams()
  const [params]        = useSearchParams()
  const navigate        = useNavigate()
  const { user }        = useAuthStore()

  const sessionId = params.get('session')   // ?session=ID passé en URL

  const isTeacher = user?.role === 'teacher' || user?.role === 'admin'

  /* ── État session ── */
  const [session,  setSession]  = useState(null)
  const [loading,  setLoading]  = useState(true)

  /* ── État enregistrement ── */
  const [recState,    setRecState]    = useState('idle')    // idle | recording | uploading | done | error
  const [recDuration, setRecDuration] = useState(0)         // secondes
  const [recSize,     setRecSize]     = useState(0)         // bytes
  const [uploadPct,   setUploadPct]   = useState(0)         // 0-100
  const [errMsg,      setErrMsg]      = useState('')
  const [recUrl,      setRecUrl]      = useState(null)      // URL rediffusion après upload

  /* ── Refs ── */
  const jitsiRef     = useRef(null)
  const jitsiApi     = useRef(null)
  const mediaRec     = useRef(null)
  const chunks       = useRef([])
  const durationTick = useRef(null)
  const streamRef    = useRef(null)

  /* ════════════════════════════════════════
     CHARGEMENT SESSION
  ════════════════════════════════════════ */
  useEffect(() => {
    const load = async () => {
      try {
        if (sessionId) {
          const r = await api.get(`/sessions/room/${roomId}`)
          setSession(r.data)
          if (r.data.recording_url) setRecUrl(r.data.recording_url)
        }
      } catch {
        // Session non trouvée — on affiche quand même Jitsi
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [roomId, sessionId])

  /* ════════════════════════════════════════
     JITSI EMBED
  ════════════════════════════════════════ */
  useEffect(() => {
    if (loading || !jitsiRef.current) return
    if (typeof window.JitsiMeetExternalAPI === 'undefined') return

    const api = new window.JitsiMeetExternalAPI(JITSI_DOMAIN, {
      roomName:       roomId,
      parentNode:     jitsiRef.current,
      width:          '100%',
      height:         '100%',
      userInfo:       { displayName: user?.name || 'Participant' },
      configOverwrite: {
        startWithAudioMuted: false,
        startWithVideoMuted: false,
        disableDeepLinking:  true,
      },
      interfaceConfigOverwrite: {
        SHOW_JITSI_WATERMARK: false,
        SHOW_BRAND_WATERMARK:  false,
        TOOLBAR_BUTTONS: [
          'microphone', 'camera', 'closedcaptions', 'desktop',
          'fullscreen', 'fodeviceselection', 'hangup', 'chat',
          'raisehand', 'tileview',
        ],
      },
    })

    jitsiApi.current = api

    return () => {
      api.dispose()
      jitsiApi.current = null
    }
  }, [loading, roomId, user])

  /* ════════════════════════════════════════
     ENREGISTREMENT — MediaRecorder
  ════════════════════════════════════════ */

  /**
   * Choisit le meilleur format supporté par le navigateur.
   * Priorité : WebM VP9 > WebM VP8 > MP4 > WebM simple
   */
  const getBestMimeType = () => {
    const candidates = [
      'video/webm;codecs=vp9,opus',
      'video/webm;codecs=vp8,opus',
      'video/mp4;codecs=h264,aac',
      'video/webm',
    ]
    return candidates.find(t => MediaRecorder.isTypeSupported(t)) || ''
  }

  const startRecording = useCallback(async () => {
    if (!navigator.mediaDevices?.getDisplayMedia) {
      setErrMsg("Votre navigateur ne supporte pas l'enregistrement d'écran.")
      setRecState('error')
      return
    }

    try {
      // Capture écran + audio système + micro
      const displayStream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: 30 },
        audio: true,
      })

      let micStream = null
      try {
        micStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
      } catch {
        // Micro optionnel
      }

      // Fusionner les tracks audio si possible
      const tracks = [...displayStream.getTracks()]
      if (micStream) {
        micStream.getAudioTracks().forEach(t => tracks.push(t))
      }

      const combined = new MediaStream(tracks)
      streamRef.current = combined

      chunks.current = []
      setRecSize(0)

      const mimeType = getBestMimeType()
      const recorder = new MediaRecorder(combined, {
        mimeType:        mimeType || undefined,
        videoBitsPerSecond: 2_500_000,   // 2.5 Mbps
      })

      recorder.ondataavailable = e => {
        if (e.data?.size > 0) {
          chunks.current.push(e.data)
          setRecSize(prev => prev + e.data.size)
        }
      }

      recorder.onstop = () => {
        stopDurationTick()
        combined.getTracks().forEach(t => t.stop())
        uploadRecording()
      }

      // Arrêt si l'utilisateur ferme le partage d'écran
      displayStream.getVideoTracks()[0].onended = () => {
        if (recorder.state === 'recording') recorder.stop()
      }

      recorder.start(2000)   // chunk toutes les 2s
      mediaRec.current = recorder
      setRecState('recording')
      setRecDuration(0)
      startDurationTick()

    } catch (err) {
      if (err.name === 'NotAllowedError') {
        setErrMsg("Permission refusée. Autorisez le partage d'écran dans votre navigateur.")
      } else {
        setErrMsg(`Erreur : ${err.message}`)
      }
      setRecState('error')
    }
  }, [sessionId])

  const stopRecording = useCallback(() => {
    if (mediaRec.current?.state === 'recording') {
      mediaRec.current.stop()
    }
  }, [])

  const startDurationTick = () => {
    durationTick.current = setInterval(() => {
      setRecDuration(d => d + 1)
    }, 1000)
  }

  const stopDurationTick = () => {
    clearInterval(durationTick.current)
  }

  /* ── Upload vers le backend ── */
  const uploadRecording = async () => {
    if (chunks.current.length === 0) {
      setErrMsg("Aucune donnée enregistrée.")
      setRecState('error')
      return
    }

    setRecState('uploading')
    setUploadPct(0)

    const mimeType = mediaRec.current?.mimeType || 'video/webm'
    const ext      = mimeType.includes('mp4') ? '.mp4' : '.webm'
    const blob     = new Blob(chunks.current, { type: mimeType })

    if (blob.size > MAX_RECORDING_BYTES) {
      setErrMsg("L'enregistrement dépasse 2 GB. Veuillez réduire la durée.")
      setRecState('error')
      return
    }

    const fd = new FormData()
    fd.append('file', blob, `recording${ext}`)

    try {
      // XMLHttpRequest pour avoir la progression
      const xhr = new XMLHttpRequest()
      const token = localStorage.getItem('token') || ''

      const API_ROOT = (import.meta.env.VITE_API_URL || 'http://localhost:8000/api')

      await new Promise((resolve, reject) => {
        xhr.upload.onprogress = e => {
          if (e.lengthComputable) {
            setUploadPct(Math.round((e.loaded / e.total) * 100))
          }
        }
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve(JSON.parse(xhr.responseText))
          } else {
            reject(new Error(`Erreur ${xhr.status}`))
          }
        }
        xhr.onerror = () => reject(new Error('Erreur réseau'))
        xhr.open('POST', `${API_ROOT}/sessions/${sessionId}/recording`)
        xhr.setRequestHeader('Authorization', `Bearer ${token}`)
        xhr.send(fd)
      }).then(data => {
        setRecUrl(data.recording_url)
        setRecState('done')
      })

    } catch (err) {
      setErrMsg(`Échec de l'upload : ${err.message}`)
      setRecState('error')
    }
  }

  /* ── Cleanup ── */
  useEffect(() => {
    return () => {
      stopDurationTick()
      streamRef.current?.getTracks().forEach(t => t.stop())
    }
  }, [])

  /* ── Formater durée ── */
  const fmtDuration = s => {
    const h = Math.floor(s / 3600)
    const m = Math.floor((s % 3600) / 60)
    const sec = s % 60
    return h > 0
      ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
      : `${m}:${String(sec).padStart(2, '0')}`
  }

  const fmtSize = bytes => {
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  }

  /* ════════════════════════════════════════
     RENDU
  ════════════════════════════════════════ */
  return (
    <div style={{
      height: '100dvh', display: 'flex', flexDirection: 'column',
      background: '#0f1f3d', color: '#fff',
    }}>

      {/* ── Topbar ── */}
      <div style={{
        height: 52, flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 16px',
        background: 'rgba(0,0,0,.4)',
        borderBottom: '1px solid rgba(255,255,255,.08)',
      }}>
        {/* Gauche : retour + titre */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button
            onClick={() => navigate(-1)}
            style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,.6)', fontSize: 20, cursor: 'pointer', padding: '4px 8px' }}
          >←</button>
          <div>
            <div style={{ fontWeight: 700, fontSize: 14 }}>
              {session?.title || 'Cours en ligne'}
            </div>
            {recState === 'recording' && (
              <div style={{ fontSize: 11, color: '#f87171', display: 'flex', alignItems: 'center', gap: 5 }}>
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#ef4444', display: 'inline-block', animation: 'pulse 1.2s infinite' }} />
                REC {fmtDuration(recDuration)} · {fmtSize(recSize)}
              </div>
            )}
          </div>
        </div>

        {/* Droite : contrôles enregistrement (enseignant seulement) */}
        {isTeacher && sessionId && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {recState === 'idle' && (
              <button
                onClick={startRecording}
                style={{
                  background: '#ef4444', border: 'none', color: '#fff',
                  borderRadius: 8, padding: '7px 16px', fontWeight: 700,
                  fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
                }}
              >
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#fff', display: 'inline-block' }} />
                Enregistrer
              </button>
            )}

            {recState === 'recording' && (
              <button
                onClick={stopRecording}
                style={{
                  background: '#1e293b', border: '2px solid #ef4444', color: '#ef4444',
                  borderRadius: 8, padding: '7px 16px', fontWeight: 700,
                  fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
                }}
              >
                <span style={{ width: 8, height: 8, borderRadius: 2, background: '#ef4444', display: 'inline-block' }} />
                Arrêter et sauvegarder
              </button>
            )}

            {recState === 'uploading' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 140, height: 6, background: 'rgba(255,255,255,.15)', borderRadius: 4, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${uploadPct}%`, background: '#3b82f6', borderRadius: 4, transition: 'width .3s' }} />
                </div>
                <span style={{ fontSize: 12, color: 'rgba(255,255,255,.7)' }}>Upload {uploadPct}%</span>
              </div>
            )}

            {recState === 'done' && (
              <span style={{ fontSize: 12, color: '#4ade80', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 5 }}>
                ✓ Rediffusion disponible
              </span>
            )}

            {recState === 'error' && (
              <span style={{ fontSize: 12, color: '#f87171', maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={errMsg}>
                ⚠ {errMsg || 'Erreur enregistrement'}
              </span>
            )}
          </div>
        )}
      </div>

      {/* ── Corps ── */}
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>

        {/* Jitsi iframe */}
        <div ref={jitsiRef} style={{ width: '100%', height: '100%' }} />

        {/* Chargement du script Jitsi si nécessaire */}
        <JitsiLoader domain={JITSI_DOMAIN} />

        {/* Rediffusion disponible pour les étudiants */}
        {!isTeacher && recUrl && (
          <ReplayBanner url={recUrl} />
        )}

        {/* Message si l'enregistrement vient de terminer (pour le prof) */}
        {isTeacher && recState === 'done' && recUrl && (
          <div style={{
            position: 'absolute', bottom: 20, left: '50%', transform: 'translateX(-50%)',
            background: 'rgba(0,0,0,.85)', borderRadius: 12, padding: '14px 24px',
            display: 'flex', alignItems: 'center', gap: 14, backdropFilter: 'blur(8px)',
            border: '1px solid rgba(74,222,128,.3)',
          }}>
            <span style={{ fontSize: 20 }}>✅</span>
            <div>
              <div style={{ fontWeight: 700, fontSize: 14, color: '#4ade80' }}>Enregistrement sauvegardé !</div>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,.6)', marginTop: 2 }}>
                La rediffusion est disponible pour les étudiants dans la session.
              </div>
            </div>
            <a href={recUrl} target="_blank" rel="noreferrer"
              style={{ background: '#3b82f6', color: '#fff', borderRadius: 8, padding: '6px 14px', fontSize: 12, fontWeight: 700, textDecoration: 'none' }}>
              Voir
            </a>
          </div>
        )}
      </div>

      {/* Animation pulse pour le point rouge REC */}
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0.3; }
        }
      `}</style>
    </div>
  )
}


/* ════════════════════════════════════════════════════════════════
   JitsiLoader
   Injecte le script Jitsi Meet External API si pas encore chargé.
════════════════════════════════════════════════════════════════ */
function JitsiLoader({ domain }) {
  useEffect(() => {
    if (window.JitsiMeetExternalAPI) return
    const script = document.createElement('script')
    script.src   = `https://${domain}/external_api.js`
    script.async = true
    document.head.appendChild(script)
    return () => {}
  }, [domain])
  return null
}


/* ════════════════════════════════════════════════════════════════
   ReplayBanner
   Bandeau affiché aux étudiants quand la rediffusion est dispo.
════════════════════════════════════════════════════════════════ */
function ReplayBanner({ url }) {
  const [show, setShow] = useState(true)
  if (!show) return null
  return (
    <div style={{
      position: 'absolute', bottom: 20, left: '50%', transform: 'translateX(-50%)',
      background: 'rgba(0,0,0,.85)', borderRadius: 12, padding: '12px 20px',
      display: 'flex', alignItems: 'center', gap: 12, backdropFilter: 'blur(8px)',
      border: '1px solid rgba(59,130,246,.4)', zIndex: 10,
    }}>
      <span style={{ fontSize: 18 }}>🎬</span>
      <div style={{ fontSize: 13, color: 'rgba(255,255,255,.8)' }}>
        La rediffusion de ce cours est disponible
      </div>
      <a href={url} target="_blank" rel="noreferrer"
        style={{ background: '#3b82f6', color: '#fff', borderRadius: 8, padding: '5px 14px', fontSize: 12, fontWeight: 700, textDecoration: 'none', whiteSpace: 'nowrap' }}>
        Voir la vidéo
      </a>
      <button onClick={() => setShow(false)}
        style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,.4)', fontSize: 18, cursor: 'pointer', padding: 0, lineHeight: 1 }}>
        ×
      </button>
    </div>
  )
}


/* ════════════════════════════════════════════════════════════════
   LiveReplayPlayer
   Utilisé dans CourseDetail.jsx pour afficher la rediffusion
   directement dans la carte de session (étudiants + profs).
════════════════════════════════════════════════════════════════ */
export function LiveReplayPlayer({ session }) {
  const [show, setShow] = useState(false)

  if (!session?.recording_url) return null

  return (
    <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border)' }}>
      {!show ? (
        <button
          onClick={() => setShow(true)}
          style={{
            background: '#eff6ff', border: '1px solid #bfdbfe',
            color: '#1d4ed8', borderRadius: 8, padding: '7px 16px',
            fontSize: 13, fontWeight: 600, cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 7,
          }}
        >
          🎬 Voir la rediffusion
        </button>
      ) : (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--navy)' }}>🎬 Rediffusion</span>
            <button onClick={() => setShow(false)}
              style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: 18, cursor: 'pointer' }}>×</button>
          </div>
          <video
            controls
            style={{ width: '100%', maxHeight: 420, borderRadius: 10, background: '#000' }}
            src={session.recording_url}
          />
        </div>
      )}
    </div>
  )
}
