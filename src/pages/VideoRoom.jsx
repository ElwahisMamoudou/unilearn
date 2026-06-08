/**
 * LiveRoom.jsx — Salle de cours en ligne (Jitsi + enregistrement automatique)
 *
 * Flux complet :
 *   1. Prof arrive sur /live/:roomId?session=:id
 *   2. Jitsi se charge et le cours démarre
 *   3. MediaRecorder démarre AUTOMATIQUEMENT dès que Jitsi est prêt
 *   4. Prof fait son cours normalement
 *   5. Prof clique "⏹ Terminer le cours"
 *   6. Enregistrement uploadé automatiquement → recording_url en base
 *   7. Étudiants voient la rediffusion dans l'onglet Sessions
 *
 * Pour les étudiants :
 *   - Ils rejoignent Jitsi normalement
 *   - Si une rediffusion existe déjà, un bandeau s'affiche
 */

import { useEffect, useRef, useState, useCallback } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import api from '../api/client'
import useAuthStore from '../store/authStore'

const JITSI_DOMAIN = 'meet.jit.si'
const MAX_RECORDING_BYTES = 2 * 1024 * 1024 * 1024  // 2 GB

export default function LiveRoom() {
  const { roomId }     = useParams()
  const [params]       = useSearchParams()
  const navigate       = useNavigate()
  const { user }       = useAuthStore()

  const sessionId  = params.get('session')
  const isTeacher  = user?.role === 'teacher' || user?.role === 'admin'

  /* ── État session ── */
  const [session,  setSession]  = useState(null)
  const [loading,  setLoading]  = useState(true)

  /* ── État enregistrement ── */
  // idle | waiting | recording | stopping | uploading | done | error
  const [recState,    setRecState]    = useState('idle')
  const [recDuration, setRecDuration] = useState(0)
  const [recSize,     setRecSize]     = useState(0)
  const [uploadPct,   setUploadPct]   = useState(0)
  const [errMsg,      setErrMsg]      = useState('')
  const [recUrl,      setRecUrl]      = useState(null)

  /* ── Refs ── */
  const jitsiContainer = useRef(null)
  const jitsiApi       = useRef(null)
  const mediaRec       = useRef(null)
  const chunks         = useRef([])
  const durationTick   = useRef(null)
  const streamRef      = useRef(null)
  const jitsiReady     = useRef(false)

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
     ENREGISTREMENT — MediaRecorder
  ════════════════════════════════════════ */
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
    if (!isTeacher || !sessionId) return
    if (!navigator.mediaDevices?.getDisplayMedia) {
      setErrMsg("Votre navigateur ne supporte pas l'enregistrement d'écran.")
      setRecState('error')
      return
    }

    setRecState('waiting')  // en attente de la permission écran

    try {
      const displayStream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: 30, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: true,
      })

      // Micro optionnel
      let micStream = null
      try {
        micStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
      } catch { /* micro non obligatoire */ }

      const tracks = [...displayStream.getTracks()]
      if (micStream) micStream.getAudioTracks().forEach(t => tracks.push(t))

      const combined = new MediaStream(tracks)
      streamRef.current = combined
      chunks.current    = []
      setRecSize(0)
      setRecDuration(0)

      const mimeType = getBestMimeType()
      const recorder = new MediaRecorder(combined, {
        mimeType:           mimeType || undefined,
        videoBitsPerSecond: 2_500_000,
      })

      recorder.ondataavailable = e => {
        if (e.data?.size > 0) {
          chunks.current.push(e.data)
          setRecSize(prev => prev + e.data.size)
        }
      }

      recorder.onstop = () => {
        clearInterval(durationTick.current)
        combined.getTracks().forEach(t => t.stop())
        uploadRecording(recorder.mimeType)
      }

      // Si le prof ferme le partage d'écran → arrêt automatique
      displayStream.getVideoTracks()[0].onended = () => {
        if (recorder.state === 'recording') recorder.stop()
      }

      recorder.start(2000)  // chunk toutes les 2s
      mediaRec.current = recorder

      setRecState('recording')
      durationTick.current = setInterval(() => setRecDuration(d => d + 1), 1000)

    } catch (err) {
      if (err.name === 'NotAllowedError') {
        setErrMsg("Permission refusée. Autorisez le partage d'écran.")
      } else {
        setErrMsg(`Erreur : ${err.message}`)
      }
      setRecState('error')
    }
  }, [isTeacher, sessionId])

  const stopRecording = useCallback(() => {
    if (mediaRec.current?.state === 'recording') {
      setRecState('stopping')
      mediaRec.current.stop()
    }
  }, [])

  /* ── Upload ── */
  const uploadRecording = async (mimeType) => {
    if (chunks.current.length === 0) {
      setErrMsg('Aucune donnée enregistrée.')
      setRecState('error')
      return
    }

    setRecState('uploading')
    setUploadPct(0)

    const ext  = (mimeType || '').includes('mp4') ? '.mp4' : '.webm'
    const blob = new Blob(chunks.current, { type: mimeType || 'video/webm' })

    if (blob.size > MAX_RECORDING_BYTES) {
      setErrMsg("L'enregistrement dépasse 2 GB.")
      setRecState('error')
      return
    }

    const fd    = new FormData()
    fd.append('file', blob, `recording${ext}`)

    const token    = localStorage.getItem('token') || ''
    const API_ROOT = (import.meta.env.VITE_API_URL || 'http://localhost:8000/api')

    try {
      await new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest()
        xhr.upload.onprogress = e => {
          if (e.lengthComputable) setUploadPct(Math.round(e.loaded / e.total * 100))
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
        // Terminer la session côté backend
        api.post(`/sessions/${sessionId}/end`).catch(() => {})
      })
    } catch (err) {
      setErrMsg(`Échec upload : ${err.message}`)
      setRecState('error')
    }
  }

  /* ════════════════════════════════════════
     JITSI — chargement et init
  ════════════════════════════════════════ */
  const initJitsi = useCallback(() => {
    if (!jitsiContainer.current || jitsiApi.current) return
    if (typeof window.JitsiMeetExternalAPI === 'undefined') return

    const api = new window.JitsiMeetExternalAPI(JITSI_DOMAIN, {
      roomName:   roomId,
      parentNode: jitsiContainer.current,
      width:      '100%',
      height:     '100%',
      userInfo:   { displayName: user?.name || 'Participant' },
      configOverwrite: {
        startWithAudioMuted: false,
        startWithVideoMuted: false,
        disableDeepLinking:  true,
      },
      interfaceConfigOverwrite: {
        SHOW_JITSI_WATERMARK:  false,
        SHOW_BRAND_WATERMARK:  false,
        TOOLBAR_BUTTONS: [
          'microphone', 'camera', 'desktop', 'fullscreen',
          'fodeviceselection', 'hangup', 'chat', 'raisehand', 'tileview',
        ],
      },
    })

    // Démarrer l'enregistrement automatiquement quand Jitsi est prêt
    api.addEventListener('videoConferenceJoined', () => {
      if (isTeacher && !jitsiReady.current) {
        jitsiReady.current = true
        // Petit délai pour laisser Jitsi se stabiliser
        setTimeout(() => startRecording(), 1500)
      }
    })

    // Quand le prof quitte Jitsi → arrêter l'enregistrement
    api.addEventListener('videoConferenceLeft', () => {
      if (isTeacher) stopRecording()
    })

    jitsiApi.current = api
  }, [roomId, user, isTeacher, startRecording, stopRecording])

  // Injecter le script Jitsi puis initialiser
  useEffect(() => {
    if (loading) return

    if (window.JitsiMeetExternalAPI) {
      initJitsi()
      return
    }

    const script    = document.createElement('script')
    script.src      = `https://${JITSI_DOMAIN}/external_api.js`
    script.async    = true
    script.onload   = () => initJitsi()
    script.onerror  = () => setErrMsg('Impossible de charger Jitsi.')
    document.head.appendChild(script)

    return () => {
      jitsiApi.current?.dispose()
      jitsiApi.current = null
    }
  }, [loading, initJitsi])

  /* ── Cleanup global ── */
  useEffect(() => {
    return () => {
      clearInterval(durationTick.current)
      streamRef.current?.getTracks().forEach(t => t.stop())
      jitsiApi.current?.dispose()
    }
  }, [])

  /* ── Formateurs ── */
  const fmtDuration = s => {
    const h   = Math.floor(s / 3600)
    const m   = Math.floor((s % 3600) / 60)
    const sec = s % 60
    return h > 0
      ? `${h}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`
      : `${m}:${String(sec).padStart(2,'0')}`
  }

  const fmtSize = b => b < 1024*1024
    ? `${(b/1024).toFixed(0)} KB`
    : `${(b/1024/1024).toFixed(1)} MB`

  /* ════════════════════════════════════════
     RENDU
  ════════════════════════════════════════ */
  return (
    <div style={{
      height: '100dvh', display: 'flex', flexDirection: 'column',
      background: '#0f1f3d', color: '#fff', overflow: 'hidden',
    }}>

      {/* ── Topbar ── */}
      <div style={{
        height: 52, flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 16px',
        background: 'rgba(0,0,0,.5)',
        borderBottom: '1px solid rgba(255,255,255,.08)',
        zIndex: 10,
      }}>

        {/* Gauche : retour + titre + indicateur REC */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
          <button
            onClick={() => navigate(-1)}
            style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,.6)', fontSize: 20, cursor: 'pointer', padding: '4px 8px', flexShrink: 0 }}
          >←</button>

          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {session?.title || 'Cours en ligne'}
            </div>

            {/* Indicateur état enregistrement */}
            {recState === 'waiting' && (
              <div style={{ fontSize: 11, color: '#fbbf24' }}>
                ⏳ En attente de la permission d'écran…
              </div>
            )}
            {recState === 'recording' && (
              <div style={{ fontSize: 11, color: '#f87171', display: 'flex', alignItems: 'center', gap: 5 }}>
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#ef4444', display: 'inline-block', animation: 'blink 1.2s infinite' }} />
                REC {fmtDuration(recDuration)} · {fmtSize(recSize)}
              </div>
            )}
            {recState === 'stopping' && (
              <div style={{ fontSize: 11, color: '#fbbf24' }}>⏳ Arrêt en cours…</div>
            )}
            {recState === 'uploading' && (
              <div style={{ fontSize: 11, color: '#60a5fa' }}>⬆ Sauvegarde {uploadPct}%…</div>
            )}
            {recState === 'done' && (
              <div style={{ fontSize: 11, color: '#4ade80' }}>✓ Rediffusion sauvegardée</div>
            )}
            {recState === 'error' && (
              <div style={{ fontSize: 11, color: '#f87171' }} title={errMsg}>⚠ {errMsg}</div>
            )}
          </div>
        </div>

        {/* Droite : boutons selon rôle et état */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>

          {/* Barre de progression upload */}
          {recState === 'uploading' && (
            <div style={{ width: 120, height: 5, background: 'rgba(255,255,255,.15)', borderRadius: 4, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${uploadPct}%`, background: '#3b82f6', borderRadius: 4, transition: 'width .3s' }} />
            </div>
          )}

          {/* Bouton Terminer — visible uniquement pendant l'enregistrement */}
          {isTeacher && (recState === 'recording' || recState === 'waiting') && (
            <button
              onClick={stopRecording}
              disabled={recState === 'waiting'}
              style={{
                background: recState === 'waiting' ? 'rgba(239,68,68,.3)' : '#ef4444',
                border: 'none', color: '#fff',
                borderRadius: 8, padding: '7px 16px',
                fontWeight: 700, fontSize: 13, cursor: recState === 'waiting' ? 'not-allowed' : 'pointer',
                display: 'flex', alignItems: 'center', gap: 6,
                transition: 'background .2s',
              }}
            >
              <span style={{ width: 8, height: 8, borderRadius: 2, background: '#fff', display: 'inline-block' }} />
              Terminer le cours
            </button>
          )}

          {/* Bouton Relancer si erreur */}
          {isTeacher && recState === 'error' && (
            <button
              onClick={startRecording}
              style={{
                background: '#f59e0b', border: 'none', color: '#fff',
                borderRadius: 8, padding: '7px 16px',
                fontWeight: 700, fontSize: 13, cursor: 'pointer',
              }}
            >
              ↺ Relancer l'enregistrement
            </button>
          )}

          {/* Badge rediffusion disponible */}
          {recState === 'done' && (
            <span style={{ fontSize: 12, color: '#4ade80', fontWeight: 700 }}>
              ✓ Cours sauvegardé
            </span>
          )}
        </div>
      </div>

      {/* ── Corps : Jitsi ── */}
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        <div ref={jitsiContainer} style={{ width: '100%', height: '100%' }} />

        {/* Overlay chargement */}
        {loading && (
          <div style={{
            position: 'absolute', inset: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: '#0f1f3d',
          }}>
            <div style={{ textAlign: 'center' }}>
              <div className="spinner" style={{ margin: '0 auto 16px' }} />
              <div style={{ color: 'rgba(255,255,255,.6)', fontSize: 14 }}>Chargement de la salle…</div>
            </div>
          </div>
        )}

        {/* Bandeau rediffusion disponible (étudiants) */}
        {!isTeacher && recUrl && <ReplayBanner url={recUrl} />}

        {/* Toast confirmation upload réussi (prof) */}
        {isTeacher && recState === 'done' && recUrl && (
          <div style={{
            position: 'absolute', bottom: 24, left: '50%', transform: 'translateX(-50%)',
            background: 'rgba(0,0,0,.9)', borderRadius: 14, padding: '16px 24px',
            display: 'flex', alignItems: 'center', gap: 14,
            border: '1px solid rgba(74,222,128,.4)',
            backdropFilter: 'blur(8px)', zIndex: 20,
            boxShadow: '0 8px 32px rgba(0,0,0,.4)',
          }}>
            <span style={{ fontSize: 24 }}>✅</span>
            <div>
              <div style={{ fontWeight: 700, fontSize: 14, color: '#4ade80' }}>
                Cours enregistré et sauvegardé !
              </div>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,.6)', marginTop: 3 }}>
                Les étudiants peuvent maintenant voir la rediffusion dans l'onglet Sessions.
              </div>
            </div>
            <button
              onClick={() => navigate(-1)}
              style={{
                background: '#3b82f6', border: 'none', color: '#fff',
                borderRadius: 8, padding: '7px 16px',
                fontWeight: 700, fontSize: 13, cursor: 'pointer',
              }}
            >
              Retour au cours
            </button>
          </div>
        )}
      </div>

      <style>{`
        @keyframes blink {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0.2; }
        }
      `}</style>
    </div>
  )
}


/* ════════════════════════════════════════════════════════════════
   ReplayBanner — bandeau pour les étudiants
════════════════════════════════════════════════════════════════ */
function ReplayBanner({ url }) {
  const [show, setShow] = useState(true)
  if (!show) return null
  return (
    <div style={{
      position: 'absolute', bottom: 20, left: '50%', transform: 'translateX(-50%)',
      background: 'rgba(0,0,0,.88)', borderRadius: 12, padding: '12px 20px',
      display: 'flex', alignItems: 'center', gap: 12,
      border: '1px solid rgba(59,130,246,.4)',
      backdropFilter: 'blur(8px)', zIndex: 10,
    }}>
      <span style={{ fontSize: 18 }}>🎬</span>
      <div style={{ fontSize: 13, color: 'rgba(255,255,255,.85)' }}>
        La rediffusion de ce cours est disponible
      </div>
      <a href={url} target="_blank" rel="noreferrer"
        style={{
          background: '#3b82f6', color: '#fff', borderRadius: 8,
          padding: '5px 14px', fontSize: 12, fontWeight: 700,
          textDecoration: 'none', whiteSpace: 'nowrap',
        }}
      >Voir la vidéo</a>
      <button onClick={() => setShow(false)}
        style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,.4)', fontSize: 18, cursor: 'pointer', padding: 0 }}>
        ×
      </button>
    </div>
  )
}
