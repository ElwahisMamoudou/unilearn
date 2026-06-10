/**
 * VideoRoom.jsx — Visioconférence WebRTC peer-to-peer style WhatsApp
 *
 * - Pas de service tiers (Daily, Jitsi, 8x8) — 100% intégré
 * - Signaling via WebSocket sur le backend FastAPI (/ws/room/{room_id})
 * - Flux vidéo peer-to-peer direct entre navigateurs (WebRTC)
 * - Enregistrement local (MediaRecorder) → upload → rediffusion
 * - Interface : vidéo locale en bas à droite, pairs en grille, barre de contrôles
 */

import { useEffect, useRef, useState, useCallback } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import api from '../api/client'
import useAuthStore from '../store/authStore'

// ICE servers (STUN public Google + TURN de secours)
const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
]

function buildRecordingUrl(url) {
  if (!url) return null
  if (url.startsWith('http')) return url
  const base = (import.meta.env.VITE_API_URL || 'http://localhost:8000/api')
    .replace(/\/api\/?$/, '')
  return `${base}${url}`
}

function buildWsUrl(roomId) {
  const api = import.meta.env.VITE_API_URL || 'http://localhost:8000/api'
  const base = api.replace(/\/api\/?$/, '').replace(/^http/, 'ws')
  return `${base}/ws/room/${roomId}`
}

export default function VideoRoom() {
  const { roomId }   = useParams()
  const [params]     = useSearchParams()
  const navigate     = useNavigate()
  const { user }     = useAuthStore()

  const sessionId = params.get('session')
  const isTeacher = user?.role === 'teacher' || user?.role === 'admin'

  const [session,  setSession]  = useState(null)
  const [peers,    setPeers]    = useState({})   // { peer_id: { name, stream, videoEl } }
  const [myPeerId, setMyPeerId] = useState(null)
  const [status,   setStatus]   = useState('connecting') // connecting | ready | error

  // Contrôles
  const [micOn,    setMicOn]    = useState(true)
  const [camOn,    setCamOn]    = useState(true)
  const [isFullscreen, setIsFullscreen] = useState(false)

  // Enregistrement
  const [recState,    setRecState]    = useState('idle')
  const [recDuration, setRecDuration] = useState(0)
  const [recSize,     setRecSize]     = useState(0)
  const [uploadPct,   setUploadPct]   = useState(0)
  const [recUrl,      setRecUrl]      = useState(null)
  const [errMsg,      setErrMsg]      = useState('')

  // Refs
  const localVideoRef  = useRef(null)
  const localStream    = useRef(null)
  const wsRef          = useRef(null)
  const pcsRef         = useRef({})    // { peer_id: RTCPeerConnection }
  const peersRef       = useRef({})    // miroir de peers pour les callbacks
  const mediaRec       = useRef(null)
  const chunks         = useRef([])
  const durationTick   = useRef(null)

  /* ═══════════════════════════════════════
     1. INIT : caméra + WebSocket
  ═══════════════════════════════════════ */
  useEffect(() => {
    let cancelled = false

    const init = async () => {
      // Charger la session
      try {
        if (sessionId) {
          const r = await api.get(`/sessions/room/${roomId}`)
          if (!cancelled) {
            setSession(r.data)
            if (r.data.recording_url) setRecUrl(buildRecordingUrl(r.data.recording_url))
          }
        }
      } catch (_) {}

      // Ouvrir la caméra
      let stream
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true })
        localStream.current = stream
        if (localVideoRef.current) localVideoRef.current.srcObject = stream
      } catch (err) {
        if (!cancelled) {
          setErrMsg('Caméra/micro non disponible : ' + err.message)
          setStatus('error')
        }
        return
      }

      if (cancelled) { stream.getTracks().forEach(t => t.stop()); return }

      // Connexion WebSocket signaling
      const ws = new WebSocket(buildWsUrl(roomId))
      wsRef.current = ws

      ws.onopen = () => {
        ws.send(JSON.stringify({
          type:      'join',
          user_id:   user?.id || 'anon',
          user_name: user?.name || 'Participant',
        }))
      }

      ws.onmessage = async (e) => {
        let msg
        try { msg = JSON.parse(e.data) } catch { return }
        await handleSignal(msg)
      }

      ws.onerror = () => { if (!cancelled) setStatus('error') }
      ws.onclose = () => { if (!cancelled && status !== 'ready') setStatus('error') }
    }

    init()

    return () => {
      cancelled = true
      cleanup()
    }
  }, []) // eslint-disable-line

  /* ═══════════════════════════════════════
     2. SIGNALING WebRTC
  ═══════════════════════════════════════ */
  const handleSignal = useCallback(async (msg) => {
    switch (msg.type) {

      case 'welcome': {
        setMyPeerId(msg.peer_id)
        setStatus('ready')
        // Initier une connexion vers chaque pair existant
        for (const peer of msg.peers) {
          await createOffer(peer.id, peer.name)
        }
        break
      }

      case 'peer_joined': {
        // Un nouveau pair arrive — il nous enverra une offer
        setPeers(prev => ({ ...prev, [msg.peer_id]: { name: msg.peer_name, stream: null } }))
        peersRef.current[msg.peer_id] = { name: msg.peer_name, stream: null }
        break
      }

      case 'offer': {
        await handleOffer(msg.from, msg.from_name, msg.sdp)
        break
      }

      case 'answer': {
        const pc = pcsRef.current[msg.from]
        if (pc) {
          try { await pc.setRemoteDescription(new RTCSessionDescription(msg.sdp)) } catch (_) {}
        }
        break
      }

      case 'ice': {
        const pc = pcsRef.current[msg.from]
        if (pc && msg.candidate) {
          try { await pc.addIceCandidate(new RTCIceCandidate(msg.candidate)) } catch (_) {}
        }
        break
      }

      case 'peer_left': {
        removePeer(msg.peer_id)
        break
      }
    }
  }, []) // eslint-disable-line

  const createPeerConnection = (peerId, peerName) => {
    if (pcsRef.current[peerId]) return pcsRef.current[peerId]

    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS })

    // Ajouter notre flux local
    localStream.current?.getTracks().forEach(t => pc.addTrack(t, localStream.current))

    // ICE candidates → envoyer au pair
    pc.onicecandidate = (e) => {
      if (e.candidate && wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({
          type:      'ice',
          to:        peerId,
          candidate: e.candidate,
        }))
      }
    }

    // Flux distant reçu
    pc.ontrack = (e) => {
      const stream = e.streams[0]
      setPeers(prev => {
        const updated = { ...prev, [peerId]: { name: peerName, stream } }
        peersRef.current = updated
        return updated
      })
    }

    pc.onconnectionstatechange = () => {
      if (['failed', 'disconnected', 'closed'].includes(pc.connectionState)) {
        removePeer(peerId)
      }
    }

    pcsRef.current[peerId] = pc
    return pc
  }

  const createOffer = async (peerId, peerName) => {
    const pc = createPeerConnection(peerId, peerName)
    try {
      const offer = await pc.createOffer()
      await pc.setLocalDescription(offer)
      wsRef.current?.send(JSON.stringify({
        type: 'offer',
        to:   peerId,
        sdp:  pc.localDescription,
      }))
    } catch (_) {}
  }

  const handleOffer = async (peerId, peerName, sdp) => {
    const pc = createPeerConnection(peerId, peerName)
    try {
      await pc.setRemoteDescription(new RTCSessionDescription(sdp))
      const answer = await pc.createAnswer()
      await pc.setLocalDescription(answer)
      wsRef.current?.send(JSON.stringify({
        type: 'answer',
        to:   peerId,
        sdp:  pc.localDescription,
      }))
    } catch (_) {}
  }

  const removePeer = (peerId) => {
    pcsRef.current[peerId]?.close()
    delete pcsRef.current[peerId]
    setPeers(prev => {
      const updated = { ...prev }
      delete updated[peerId]
      peersRef.current = updated
      return updated
    })
  }

  /* ═══════════════════════════════════════
     3. CONTRÔLES
  ═══════════════════════════════════════ */
  const toggleMic = () => {
    localStream.current?.getAudioTracks().forEach(t => { t.enabled = !t.enabled })
    setMicOn(v => !v)
  }

  const toggleCam = () => {
    localStream.current?.getVideoTracks().forEach(t => { t.enabled = !t.enabled })
    setCamOn(v => !v)
  }

  const hangUp = () => {
    if (recState === 'recording') stopRecording()
    else cleanup()
    navigate(-1)
  }

  const cleanup = () => {
    wsRef.current?.close()
    Object.values(pcsRef.current).forEach(pc => pc.close())
    pcsRef.current = {}
    localStream.current?.getTracks().forEach(t => t.stop())
    clearInterval(durationTick.current)
  }

  /* ═══════════════════════════════════════
     4. ENREGISTREMENT
  ═══════════════════════════════════════ */
  const startRecording = useCallback(async () => {
    if (!isTeacher || recState === 'recording') return
    chunks.current = []
    setRecSize(0); setRecDuration(0); setErrMsg('')

    const mimeType = ['video/webm;codecs=vp9,opus','video/webm;codecs=vp8,opus','video/webm']
      .find(t => MediaRecorder.isTypeSupported(t)) || ''

    const rec = new MediaRecorder(localStream.current, {
      mimeType: mimeType || undefined,
      videoBitsPerSecond: 2_000_000,
    })
    rec.ondataavailable = e => {
      if (e.data?.size > 0) { chunks.current.push(e.data); setRecSize(p => p + e.data.size) }
    }
    rec.onstop = () => {
      clearInterval(durationTick.current)
      uploadRecording(rec.mimeType)
    }
    rec.start(2000)
    mediaRec.current = rec
    setRecState('recording')
    durationTick.current = setInterval(() => setRecDuration(d => d + 1), 1000)
  }, [isTeacher, recState])

  const stopRecording = useCallback(() => {
    if (mediaRec.current?.state === 'recording') {
      setRecState('stopping')
      mediaRec.current.stop()
    }
  }, [])

  const uploadRecording = async (mimeType) => {
    if (!chunks.current.length || !sessionId) { setRecState('idle'); return }
    setRecState('uploading'); setUploadPct(0)
    const ext  = (mimeType||'').includes('mp4') ? '.mp4' : '.webm'
    const blob = new Blob(chunks.current, { type: mimeType || 'video/webm' })
    const fd   = new FormData()
    fd.append('file', blob, `recording${ext}`)
    const token    = localStorage.getItem('token') || ''
    const API_ROOT = import.meta.env.VITE_API_URL || 'http://localhost:8000/api'
    try {
      const data = await new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest()
        xhr.upload.onprogress = e => { if (e.lengthComputable) setUploadPct(Math.round(e.loaded/e.total*100)) }
        xhr.onload = () => xhr.status < 300 ? resolve(JSON.parse(xhr.responseText)) : reject(new Error(xhr.status))
        xhr.onerror = () => reject(new Error('réseau'))
        xhr.open('POST', `${API_ROOT}/sessions/${sessionId}/recording`)
        xhr.setRequestHeader('Authorization', `Bearer ${token}`)
        xhr.send(fd)
      })
      setRecUrl(buildRecordingUrl(data.recording_url))
      setRecState('done')
      api.post(`/sessions/${sessionId}/end`).catch(() => {})
    } catch (err) {
      setErrMsg(`Upload échoué : ${err.message}`)
      setRecState('error')
    }
  }

  const fmtD = s => `${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`
  const fmtS = b => b < 1048576 ? `${(b/1024).toFixed(0)} KB` : `${(b/1048576).toFixed(1)} MB`

  /* ═══════════════════════════════════════
     5. RENDU
  ═══════════════════════════════════════ */
  const peerList = Object.entries(peers)
  const totalPeers = peerList.length

  // Grille responsive
  const gridCols = totalPeers === 0 ? 1
    : totalPeers === 1 ? 2
    : totalPeers <= 3  ? 2
    : totalPeers <= 8  ? 3 : 4

  return (
    <div style={{
      height: '100dvh', display: 'flex', flexDirection: 'column',
      background: '#111827', color: '#fff', overflow: 'hidden', userSelect: 'none',
    }}>

      {/* ── Grille vidéo principale ── */}
      <div style={{
        flex: 1, overflow: 'hidden', position: 'relative',
        display: 'grid',
        gridTemplateColumns: `repeat(${gridCols}, 1fr)`,
        gap: 3, padding: 3,
        background: '#111827',
      }}>

        {/* Ma propre vidéo */}
        <VideoTile
          label={`${user?.name || 'Moi'} (vous)`}
          isSelf
          videoRef={localVideoRef}
          micOn={micOn}
          camOn={camOn}
          isTeacher={isTeacher}
          highlight={totalPeers === 0}
        />

        {/* Vidéos des pairs */}
        {peerList.map(([id, peer]) => (
          <VideoTile
            key={id}
            label={peer.name}
            stream={peer.stream}
          />
        ))}

        {/* Overlay connexion */}
        {status === 'connecting' && (
          <div style={{
            position: 'absolute', inset: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(17,24,39,.92)', zIndex: 20, flexDirection: 'column', gap: 16,
          }}>
            <div style={{ width:44, height:44, border:'3px solid rgba(255,255,255,.15)', borderTopColor:'#25d366', borderRadius:'50%', animation:'spin .8s linear infinite' }} />
            <div style={{ color: 'rgba(255,255,255,.7)', fontSize:14 }}>Connexion en cours…</div>
          </div>
        )}

        {status === 'error' && (
          <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center', background:'rgba(17,24,39,.95)', zIndex:20, flexDirection:'column', gap:12 }}>
            <div style={{ fontSize:40 }}>📵</div>
            <div style={{ color:'#f87171', fontSize:14, textAlign:'center', maxWidth:280 }}>
              {errMsg || 'Impossible de rejoindre la salle'}
            </div>
            <button onClick={() => navigate(-1)} style={{ background:'#ef4444', border:'none', color:'#fff', borderRadius:10, padding:'10px 24px', fontWeight:700, cursor:'pointer' }}>
              Retour
            </button>
          </div>
        )}

        {/* Indicateur REC */}
        {recState === 'recording' && (
          <div style={{
            position:'absolute', top:12, left:12, zIndex:10,
            background:'rgba(0,0,0,.7)', borderRadius:20, padding:'5px 12px',
            display:'flex', alignItems:'center', gap:7, fontSize:12, fontWeight:700,
          }}>
            <span style={{ width:8, height:8, borderRadius:'50%', background:'#ef4444', display:'inline-block', animation:'blink 1.2s infinite' }} />
            REC {fmtD(recDuration)} · {fmtS(recSize)}
          </div>
        )}

        {/* Compteur participants */}
        {status === 'ready' && (
          <div style={{
            position:'absolute', top:12, right:12, zIndex:10,
            background:'rgba(0,0,0,.55)', borderRadius:20, padding:'5px 12px',
            fontSize:12, color:'rgba(255,255,255,.8)',
          }}>
            👥 {totalPeers + 1} participant{totalPeers > 0 ? 's' : ''}
          </div>
        )}

        {/* Toast upload */}
        {recState === 'uploading' && (
          <div style={{ position:'absolute', bottom:90, left:'50%', transform:'translateX(-50%)', background:'rgba(0,0,0,.85)', borderRadius:12, padding:'12px 20px', zIndex:10, display:'flex', alignItems:'center', gap:12, minWidth:220 }}>
            <div style={{ width:100, height:5, background:'rgba(255,255,255,.15)', borderRadius:4, overflow:'hidden' }}>
              <div style={{ height:'100%', width:`${uploadPct}%`, background:'#25d366', borderRadius:4, transition:'width .3s' }} />
            </div>
            <span style={{ fontSize:12, color:'rgba(255,255,255,.7)' }}>Sauvegarde {uploadPct}%</span>
          </div>
        )}

        {/* Toast succès enregistrement */}
        {recState === 'done' && (
          <div style={{ position:'absolute', bottom:90, left:'50%', transform:'translateX(-50%)', background:'rgba(0,0,0,.9)', borderRadius:14, padding:'14px 20px', zIndex:10, border:'1px solid rgba(37,211,102,.4)', display:'flex', alignItems:'center', gap:12 }}>
            <span style={{ fontSize:22 }}>✅</span>
            <div>
              <div style={{ fontWeight:700, fontSize:13, color:'#4ade80' }}>Cours sauvegardé !</div>
              <div style={{ fontSize:11, color:'rgba(255,255,255,.5)' }}>Rediffusion disponible dans Sessions</div>
            </div>
          </div>
        )}
      </div>

      {/* ── Barre de contrôles ── */}
      <div style={{
        height: 80, flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        gap: 16, background: '#1f2937',
        borderTop: '1px solid rgba(255,255,255,.06)',
      }}>

        {/* Micro */}
        <CtrlBtn
          active={micOn}
          onClick={toggleMic}
          icon={micOn ? '🎤' : '🔇'}
          label={micOn ? 'Couper micro' : 'Activer micro'}
          color={micOn ? '#374151' : '#ef4444'}
        />

        {/* Caméra */}
        <CtrlBtn
          active={camOn}
          onClick={toggleCam}
          icon={camOn ? '📹' : '🚫'}
          label={camOn ? 'Couper caméra' : 'Activer caméra'}
          color={camOn ? '#374151' : '#ef4444'}
        />

        {/* Enregistrement (prof uniquement) */}
        {isTeacher && sessionId && (
          <CtrlBtn
            onClick={recState === 'recording' ? stopRecording : startRecording}
            icon={recState === 'recording' ? '⏹' : '⏺'}
            label={recState === 'recording' ? 'Arrêter REC' : 'Enregistrer'}
            color={recState === 'recording' ? '#ef4444' : '#374151'}
            pulse={recState === 'recording'}
          />
        )}

        {/* Raccrocher */}
        <button
          onClick={hangUp}
          style={{
            width:56, height:56, borderRadius:'50%',
            background:'#ef4444', border:'none', cursor:'pointer',
            fontSize:22, display:'flex', alignItems:'center', justifyContent:'center',
            boxShadow:'0 4px 16px rgba(239,68,68,.4)',
            transition:'transform .1s',
          }}
          onMouseDown={e => e.currentTarget.style.transform='scale(.92)'}
          onMouseUp={e => e.currentTarget.style.transform='scale(1)'}
        >
          📵
        </button>

      </div>

      <style>{`
        @keyframes spin  { to { transform: rotate(360deg) } }
        @keyframes blink { 0%,100%{opacity:1} 50%{opacity:.2} }
        @keyframes pulse { 0%,100%{box-shadow:0 0 0 0 rgba(239,68,68,.6)} 50%{box-shadow:0 0 0 8px rgba(239,68,68,0)} }
      `}</style>
    </div>
  )
}


/* ═══════════════════════════════════════════════
   Composant : tuile vidéo d'un participant
═══════════════════════════════════════════════ */
function VideoTile({ label, isSelf, videoRef, stream, micOn, camOn, isTeacher, highlight }) {
  const elRef = useRef(null)

  useEffect(() => {
    if (!isSelf && stream && elRef.current) {
      elRef.current.srcObject = stream
    }
  }, [stream, isSelf])

  const noVideo = isSelf ? !camOn : !stream

  return (
    <div style={{
      position: 'relative', borderRadius: 12, overflow: 'hidden',
      background: '#1f2937', minHeight: 160,
      border: highlight ? '2px solid rgba(37,211,102,.3)' : '2px solid transparent',
    }}>
      {/* Vidéo */}
      {isSelf ? (
        <video
          ref={videoRef}
          autoPlay muted playsInline
          style={{ width:'100%', height:'100%', objectFit:'cover', display: noVideo ? 'none' : 'block', transform:'scaleX(-1)' }}
        />
      ) : (
        <video
          ref={elRef}
          autoPlay playsInline
          style={{ width:'100%', height:'100%', objectFit:'cover', display: noVideo ? 'none' : 'block' }}
        />
      )}

      {/* Avatar si pas de vidéo */}
      {noVideo && (
        <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center', flexDirection:'column', gap:8 }}>
          <div style={{
            width:60, height:60, borderRadius:'50%',
            background: 'linear-gradient(135deg, #25d366, #128c7e)',
            display:'flex', alignItems:'center', justifyContent:'center',
            fontSize:26, fontWeight:700,
          }}>
            {label?.[0]?.toUpperCase() || '?'}
          </div>
          <div style={{ fontSize:11, color:'rgba(255,255,255,.5)' }}>Caméra désactivée</div>
        </div>
      )}

      {/* Nom + badges */}
      <div style={{
        position:'absolute', bottom:0, left:0, right:0,
        padding:'20px 10px 8px',
        background:'linear-gradient(transparent, rgba(0,0,0,.7))',
        display:'flex', alignItems:'center', justifyContent:'space-between',
      }}>
        <div style={{ fontSize:12, fontWeight:600, color:'#fff', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', maxWidth:'70%' }}>
          {label}
          {isTeacher && <span style={{ marginLeft:5, fontSize:10, background:'#25d366', borderRadius:4, padding:'1px 5px' }}>Prof</span>}
        </div>
        <div style={{ display:'flex', gap:4 }}>
          {isSelf && !micOn && <span style={{ fontSize:14 }}>🔇</span>}
        </div>
      </div>
    </div>
  )
}


/* ═══════════════════════════════════════════════
   Composant : bouton de contrôle rond
═══════════════════════════════════════════════ */
function CtrlBtn({ onClick, icon, label, color, pulse }) {
  return (
    <button
      onClick={onClick}
      title={label}
      style={{
        width:52, height:52, borderRadius:'50%',
        background: color || '#374151',
        border:'none', cursor:'pointer', fontSize:20,
        display:'flex', alignItems:'center', justifyContent:'center',
        transition:'transform .1s, background .2s',
        animation: pulse ? 'pulse 1.5s infinite' : 'none',
        flexShrink: 0,
      }}
      onMouseDown={e => e.currentTarget.style.transform='scale(.9)'}
      onMouseUp={e => e.currentTarget.style.transform='scale(1)'}
    >
      {icon}
    </button>
  )
}
