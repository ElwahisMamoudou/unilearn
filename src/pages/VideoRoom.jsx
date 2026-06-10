/**
 * VideoRoom.jsx — Salle de visioconférence Daily.co + enregistrement
 *
 * Flux :
 *   1. On récupère la session (room_id) depuis l'API
 *   2. On demande un token Daily au backend (/api/sessions/:id/token)
 *      → token owner pour prof (modérateur immédiat, pas de lobby)
 *      → token participant pour étudiant
 *   3. Le SDK @daily-co/daily-js charge l'iframe Daily dans le conteneur
 *   4. Prof peut enregistrer via MediaRecorder (webcam/micro) pendant le cours
 *   5. À la fin : upload automatique → recording_url en BDD
 */

import { useEffect, useRef, useState, useCallback } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import api from '../api/client'
import useAuthStore from '../store/authStore'

const MAX_RECORDING_BYTES = 2 * 1024 * 1024 * 1024  // 2 GB

function buildRecordingUrl(url) {
  if (!url) return null
  if (url.startsWith('http')) return url
  const base = (import.meta.env.VITE_API_URL || 'http://localhost:8000/api')
    .replace(/\/api\/?$/, '')
  return `${base}${url}`
}

export default function VideoRoom() {
  const { roomId }   = useParams()
  const [params]     = useSearchParams()
  const navigate     = useNavigate()
  const { user }     = useAuthStore()

  const sessionId = params.get('session')
  const isTeacher = user?.role === 'teacher' || user?.role === 'admin'

  const [session,   setSession]   = useState(null)
  const [loading,   setLoading]   = useState(true)
  const [callReady, setCallReady] = useState(false)
  const [errMsg,    setErrMsg]    = useState('')

  // Enregistrement
  const [recState,    setRecState]    = useState('idle')
  const [recDuration, setRecDuration] = useState(0)
  const [recSize,     setRecSize]     = useState(0)
  const [uploadPct,   setUploadPct]   = useState(0)
  const [recUrl,      setRecUrl]      = useState(null)

  const containerRef = useRef(null)
  const callRef      = useRef(null)
  const mediaRec     = useRef(null)
  const chunks       = useRef([])
  const durationTick = useRef(null)
  const streamRef    = useRef(null)

  /* ════════════════════════════════════════
     INIT : charger session + token Daily
  ════════════════════════════════════════ */
  useEffect(() => {
    const init = async () => {
      try {
        // 1. Charger la session
        let sess = null
        if (sessionId) {
          const r = await api.get(`/sessions/room/${roomId}`)
          sess = r.data
          setSession(sess)
          if (sess.recording_url) setRecUrl(buildRecordingUrl(sess.recording_url))
        }

        // 2. Obtenir le token Daily
        const tokenRes = await api.get(`/sessions/${sessionId}/token`)
        const { token, room_url } = tokenRes.data

        // 3. Charger le SDK Daily dynamiquement
        await loadDailyScript()

        // 4. Créer l'appel Daily dans le conteneur
        const call = window.DailyIframe.createFrame(containerRef.current, {
          iframeStyle: {
            position:   'absolute',
            top:        0,
            left:       0,
            width:      '100%',
            height:     '100%',
            border:     'none',
            borderRadius: 0,
          },
          showLeaveButton:      true,
          showFullscreenButton: true,
        })

        call.on('joined-meeting',  () => setCallReady(true))
        call.on('left-meeting',    () => {
          if (isTeacher && mediaRec.current?.state === 'recording') stopRecording()
          navigate(-1)
        })
        call.on('error', e => setErrMsg(`Erreur Daily : ${e.errorMsg || 'inconnue'}`))

        await call.join({ url: room_url, token })
        callRef.current = call

      } catch (err) {
        setErrMsg(err?.response?.data?.detail || err.message || 'Erreur de connexion')
      } finally {
        setLoading(false)
      }
    }

    init()

    return () => {
      clearInterval(durationTick.current)
      streamRef.current?.getTracks().forEach(t => t.stop())
      callRef.current?.destroy()
    }
  }, [])  // eslint-disable-line

  /* ════════════════════════════════════════
     CHARGEMENT SDK Daily
  ════════════════════════════════════════ */
  function loadDailyScript() {
    return new Promise((resolve, reject) => {
      if (window.DailyIframe) { resolve(); return }
      const s = document.createElement('script')
      s.src   = 'https://unpkg.com/@daily-co/daily-js'
      s.async = true
      s.onload  = resolve
      s.onerror = () => reject(new Error('Impossible de charger Daily.co'))
      document.head.appendChild(s)
    })
  }

  /* ════════════════════════════════════════
     ENREGISTREMENT (webcam/micro)
  ════════════════════════════════════════ */
  const getBestMimeType = () => {
    const c = ['video/webm;codecs=vp9,opus','video/webm;codecs=vp8,opus','video/webm','video/mp4']
    return c.find(t => MediaRecorder.isTypeSupported(t)) || ''
  }

  const startRecording = useCallback(async () => {
    if (!isTeacher || !sessionId || recState === 'recording') return
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 25 } },
        audio: true,
      })
      streamRef.current = stream
      chunks.current    = []
      setRecSize(0)
      setRecDuration(0)
      setErrMsg('')

      const mimeType = getBestMimeType()
      const rec = new MediaRecorder(stream, { mimeType: mimeType || undefined, videoBitsPerSecond: 2_000_000 })

      rec.ondataavailable = e => {
        if (e.data?.size > 0) { chunks.current.push(e.data); setRecSize(p => p + e.data.size) }
      }
      rec.onstop = () => {
        clearInterval(durationTick.current)
        stream.getTracks().forEach(t => t.stop())
        uploadRecording(rec.mimeType)
      }

      rec.start(2000)
      mediaRec.current = rec
      setRecState('recording')
      durationTick.current = setInterval(() => setRecDuration(d => d + 1), 1000)

    } catch (err) {
      setErrMsg(err.name === 'NotAllowedError'
        ? 'Permission refusée. Autorisez la caméra et le micro.'
        : `Erreur : ${err.message}`)
      setRecState('error')
    }
  }, [isTeacher, sessionId, recState])

  const stopRecording = useCallback(() => {
    if (mediaRec.current?.state === 'recording') {
      setRecState('stopping')
      mediaRec.current.stop()
    }
  }, [])

  const uploadRecording = async (mimeType) => {
    if (!chunks.current.length) { setErrMsg('Aucune donnée.'); setRecState('error'); return }
    setRecState('uploading'); setUploadPct(0)

    const ext  = (mimeType || '').includes('mp4') ? '.mp4' : '.webm'
    const blob = new Blob(chunks.current, { type: mimeType || 'video/webm' })
    if (blob.size > MAX_RECORDING_BYTES) { setErrMsg('Enregistrement > 2 GB.'); setRecState('error'); return }

    const fd    = new FormData()
    fd.append('file', blob, `recording${ext}`)
    const token    = localStorage.getItem('token') || ''
    const API_ROOT = (import.meta.env.VITE_API_URL || 'http://localhost:8000/api')

    try {
      const data = await new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest()
        xhr.upload.onprogress = e => { if (e.lengthComputable) setUploadPct(Math.round(e.loaded/e.total*100)) }
        xhr.onload = () => xhr.status < 300 ? resolve(JSON.parse(xhr.responseText)) : reject(new Error(`Erreur ${xhr.status}`))
        xhr.onerror = () => reject(new Error('Erreur réseau'))
        xhr.open('POST', `${API_ROOT}/sessions/${sessionId}/recording`)
        xhr.setRequestHeader('Authorization', `Bearer ${token}`)
        xhr.send(fd)
      })
      setRecUrl(buildRecordingUrl(data.recording_url))
      setRecState('done')
      api.post(`/sessions/${sessionId}/end`).catch(() => {})
    } catch (err) {
      setErrMsg(`Échec upload : ${err.message}`)
      setRecState('error')
    }
  }

  /* ── Formateurs ── */
  const fmtD = s => {
    const h=Math.floor(s/3600), m=Math.floor((s%3600)/60), sec=s%60
    return h>0 ? `${h}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}` : `${m}:${String(sec).padStart(2,'0')}`
  }
  const fmtS = b => b < 1048576 ? `${(b/1024).toFixed(0)} KB` : `${(b/1048576).toFixed(1)} MB`

  /* ════════════════════════════════════════
     RENDU
  ════════════════════════════════════════ */
  return (
    <div style={{ height:'100dvh', display:'flex', flexDirection:'column', background:'#0f1f3d', color:'#fff', overflow:'hidden' }}>

      {/* Topbar */}
      <div style={{ height:52, flexShrink:0, display:'flex', alignItems:'center', justifyContent:'space-between', padding:'0 16px', background:'rgba(0,0,0,.5)', borderBottom:'1px solid rgba(255,255,255,.08)', zIndex:10 }}>

        <div style={{ display:'flex', alignItems:'center', gap:12, minWidth:0 }}>
          <button onClick={() => navigate(-1)} style={{ background:'none', border:'none', color:'rgba(255,255,255,.6)', fontSize:20, cursor:'pointer', padding:'4px 8px', flexShrink:0 }}>←</button>
          <div style={{ minWidth:0 }}>
            <div style={{ fontWeight:700, fontSize:14, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
              {session?.title || 'Cours en ligne'}
            </div>
            {recState === 'recording' && (
              <div style={{ fontSize:11, color:'#f87171', display:'flex', alignItems:'center', gap:5 }}>
                <span style={{ width:7, height:7, borderRadius:'50%', background:'#ef4444', display:'inline-block', animation:'blink 1.2s infinite' }} />
                REC {fmtD(recDuration)} · {fmtS(recSize)}
              </div>
            )}
            {recState === 'stopping'  && <div style={{ fontSize:11, color:'#fbbf24' }}>⏳ Arrêt…</div>}
            {recState === 'uploading' && <div style={{ fontSize:11, color:'#60a5fa' }}>⬆ Sauvegarde {uploadPct}%…</div>}
            {recState === 'done'      && <div style={{ fontSize:11, color:'#4ade80' }}>✓ Rediffusion sauvegardée</div>}
            {recState === 'error'     && <div style={{ fontSize:11, color:'#f87171' }} title={errMsg}>⚠ {errMsg}</div>}
            {errMsg && recState !== 'error' && <div style={{ fontSize:11, color:'#f87171' }}>⚠ {errMsg}</div>}
          </div>
        </div>

        <div style={{ display:'flex', alignItems:'center', gap:8, flexShrink:0 }}>
          {recState === 'uploading' && (
            <div style={{ width:120, height:5, background:'rgba(255,255,255,.15)', borderRadius:4, overflow:'hidden' }}>
              <div style={{ height:'100%', width:`${uploadPct}%`, background:'#3b82f6', borderRadius:4, transition:'width .3s' }} />
            </div>
          )}
          {isTeacher && (recState === 'idle' || recState === 'error') && callReady && (
            <button onClick={startRecording} style={{ background:'#ef4444', border:'none', color:'#fff', borderRadius:8, padding:'7px 16px', fontWeight:700, fontSize:13, cursor:'pointer', display:'flex', alignItems:'center', gap:6 }}>
              <span style={{ width:8, height:8, borderRadius:'50%', background:'#fff', display:'inline-block' }} />
              {recState === 'error' ? '↺ Relancer' : '⏺ Enregistrer'}
            </button>
          )}
          {isTeacher && recState === 'recording' && (
            <button onClick={stopRecording} style={{ background:'#1e3a5f', border:'1px solid rgba(255,255,255,.2)', color:'#fff', borderRadius:8, padding:'7px 16px', fontWeight:700, fontSize:13, cursor:'pointer', display:'flex', alignItems:'center', gap:6 }}>
              <span style={{ width:8, height:8, borderRadius:2, background:'#ef4444', display:'inline-block' }} />
              Terminer le cours
            </button>
          )}
          {recState === 'done' && <span style={{ fontSize:12, color:'#4ade80', fontWeight:700 }}>✓ Cours sauvegardé</span>}
        </div>
      </div>

      {/* Zone vidéo */}
      <div style={{ flex:1, position:'relative', overflow:'hidden' }}>
        <div ref={containerRef} style={{ width:'100%', height:'100%' }} />

        {/* Overlay chargement */}
        {loading && (
          <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center', background:'#0f1f3d' }}>
            <div style={{ textAlign:'center' }}>
              <div style={{ width:40, height:40, border:'3px solid rgba(255,255,255,.15)', borderTopColor:'#3b82f6', borderRadius:'50%', animation:'spin 0.8s linear infinite', margin:'0 auto 16px' }} />
              <div style={{ color:'rgba(255,255,255,.6)', fontSize:14 }}>Connexion à la salle…</div>
            </div>
          </div>
        )}

        {/* Bandeau rediffusion (étudiants) */}
        {!isTeacher && recUrl && <ReplayBanner url={recUrl} />}

        {/* Toast succès (prof) */}
        {isTeacher && recState === 'done' && recUrl && (
          <div style={{ position:'absolute', bottom:24, left:'50%', transform:'translateX(-50%)', background:'rgba(0,0,0,.9)', borderRadius:14, padding:'16px 24px', display:'flex', alignItems:'center', gap:14, border:'1px solid rgba(74,222,128,.4)', backdropFilter:'blur(8px)', zIndex:20, boxShadow:'0 8px 32px rgba(0,0,0,.4)' }}>
            <span style={{ fontSize:24 }}>✅</span>
            <div>
              <div style={{ fontWeight:700, fontSize:14, color:'#4ade80' }}>Cours enregistré et sauvegardé !</div>
              <div style={{ fontSize:12, color:'rgba(255,255,255,.6)', marginTop:3 }}>Les étudiants voient la rediffusion dans l'onglet Sessions.</div>
            </div>
            <button onClick={() => navigate(-1)} style={{ background:'#3b82f6', border:'none', color:'#fff', borderRadius:8, padding:'7px 16px', fontWeight:700, fontSize:13, cursor:'pointer' }}>
              Retour au cours
            </button>
          </div>
        )}
      </div>

      <style>{`
        @keyframes blink { 0%,100%{opacity:1} 50%{opacity:.2} }
        @keyframes spin   { to{transform:rotate(360deg)} }
      `}</style>
    </div>
  )
}

function ReplayBanner({ url }) {
  const [show, setShow] = useState(true)
  if (!show) return null
  return (
    <div style={{ position:'absolute', bottom:20, left:'50%', transform:'translateX(-50%)', background:'rgba(0,0,0,.88)', borderRadius:12, padding:'12px 20px', display:'flex', alignItems:'center', gap:12, border:'1px solid rgba(59,130,246,.4)', backdropFilter:'blur(8px)', zIndex:10 }}>
      <span style={{ fontSize:18 }}>🎬</span>
      <div style={{ fontSize:13, color:'rgba(255,255,255,.85)' }}>La rediffusion de ce cours est disponible</div>
      <a href={url} target="_blank" rel="noreferrer" style={{ background:'#3b82f6', color:'#fff', borderRadius:8, padding:'5px 14px', fontSize:12, fontWeight:700, textDecoration:'none', whiteSpace:'nowrap' }}>Voir la vidéo</a>
      <button onClick={() => setShow(false)} style={{ background:'none', border:'none', color:'rgba(255,255,255,.4)', fontSize:18, cursor:'pointer', padding:0 }}>×</button>
    </div>
  )
}
