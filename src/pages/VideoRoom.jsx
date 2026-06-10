/**
 * VideoRoom.jsx — Visioconférence WebRTC peer-to-peer
 * Fonctionnalités :
 *   - Vidéo/audio WebRTC multi-participants
 *   - Couper micro / caméra
 *   - Partage d'écran (remplace la caméra dans le flux)
 *   - Chat en temps réel (via WebSocket signaling)
 *   - Lever la main
 *   - Plein écran
 *   - Enregistrement local → upload → rediffusion
 */

import { useEffect, useRef, useState, useCallback } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import api from '../api/client'
import useAuthStore from '../store/authStore'

const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
]

function buildRecordingUrl(url) {
  if (!url) return null
  if (url.startsWith('http')) return url
  const base = (import.meta.env.VITE_API_URL || 'http://localhost:8000/api').replace(/\/api\/?$/, '')
  return `${base}${url}`
}

function buildWsUrl(roomId) {
  const api = import.meta.env.VITE_API_URL || 'http://localhost:8000/api'
  return api.replace(/\/api\/?$/, '').replace(/^http/, 'ws') + `/ws/room/${roomId}`
}

export default function VideoRoom() {
  const { roomId }   = useParams()
  const [params]     = useSearchParams()
  const navigate     = useNavigate()
  const { user }     = useAuthStore()

  const sessionId = params.get('session')
  const isTeacher = user?.role === 'teacher' || user?.role === 'admin'

  const [session,   setSession]   = useState(null)
  const [peers,     setPeers]     = useState({})
  const [myPeerId,  setMyPeerId]  = useState(null)
  const [status,    setStatus]    = useState('connecting')

  // Contrôles A/V
  const [micOn,       setMicOn]       = useState(true)
  const [camOn,       setCamOn]       = useState(true)
  const [screenSharing, setScreenSharing] = useState(false)

  // UI
  const [showChat,    setShowChat]    = useState(false)
  const [handRaised,  setHandRaised]  = useState(false)
  const [raisedHands, setRaisedHands] = useState({}) // { peer_id: true }
  const [fullscreen,  setFullscreen]  = useState(false)
  const [chatMessages, setChatMessages] = useState([])
  const [chatInput,   setChatInput]   = useState('')
  const [unread,      setUnread]      = useState(0)
  const [pinnedPeer,  setPinnedPeer]  = useState(null) // peer_id épinglé en grand
  const [errMsg,      setErrMsg]      = useState('')

  // Enregistrement
  const [recState,    setRecState]    = useState('idle')
  const [recDuration, setRecDuration] = useState(0)
  const [recSize,     setRecSize]     = useState(0)
  const [uploadPct,   setUploadPct]   = useState(0)
  const [recUrl,      setRecUrl]      = useState(null)

  // Refs
  const localVideoRef  = useRef(null)
  const localStream    = useRef(null)
  const screenStream   = useRef(null)
  const wsRef          = useRef(null)
  const pcsRef         = useRef({})
  const peersRef       = useRef({})
  const mediaRec       = useRef(null)
  const chunks         = useRef([])
  const durationTick   = useRef(null)
  const chatEndRef     = useRef(null)
  const containerRef   = useRef(null)

  /* ═══════════════════════════════════════
     INIT
  ═══════════════════════════════════════ */
  useEffect(() => {
    let cancelled = false
    const init = async () => {
      try {
        if (sessionId) {
          const r = await api.get(`/sessions/room/${roomId}`)
          if (!cancelled) {
            setSession(r.data)
            if (r.data.recording_url) setRecUrl(buildRecordingUrl(r.data.recording_url))
          }
        }
      } catch (_) {}

      let stream
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true })
        localStream.current = stream
        if (localVideoRef.current) localVideoRef.current.srcObject = stream
      } catch (err) {
        if (!cancelled) { setErrMsg('Caméra/micro : ' + err.message); setStatus('error') }
        return
      }
      if (cancelled) { stream.getTracks().forEach(t => t.stop()); return }

      const ws = new WebSocket(buildWsUrl(roomId))
      wsRef.current = ws

      ws.onopen = () => ws.send(JSON.stringify({
        type: 'join', user_id: user?.id || 'anon', user_name: user?.name || 'Participant',
      }))
      ws.onmessage = async (e) => {
        try { await handleSignal(JSON.parse(e.data)) } catch (_) {}
      }
      ws.onerror = () => { if (!cancelled) setStatus('error') }
    }
    init()
    return () => { cancelled = true; cleanup() }
  }, []) // eslint-disable-line

  // Scroll chat auto
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatMessages])

  // Plein écran
  useEffect(() => {
    const onFsChange = () => setFullscreen(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', onFsChange)
    return () => document.removeEventListener('fullscreenchange', onFsChange)
  }, [])

  /* ═══════════════════════════════════════
     SIGNALING
  ═══════════════════════════════════════ */
  const handleSignal = useCallback(async (msg) => {
    switch (msg.type) {
      case 'welcome': {
        setMyPeerId(msg.peer_id)
        setStatus('ready')
        for (const peer of msg.peers) await createOffer(peer.id, peer.name)
        break
      }
      case 'peer_joined':
        setPeers(prev => { const u = {...prev, [msg.peer_id]: {name: msg.peer_name, stream: null}}; peersRef.current = u; return u })
        addSystemMsg(`${msg.peer_name} a rejoint la salle`)
        break
      case 'offer':
        await handleOffer(msg.from, msg.from_name, msg.sdp)
        break
      case 'answer': {
        const pc = pcsRef.current[msg.from]
        if (pc) try { await pc.setRemoteDescription(new RTCSessionDescription(msg.sdp)) } catch (_) {}
        break
      }
      case 'ice': {
        const pc = pcsRef.current[msg.from]
        if (pc && msg.candidate) try { await pc.addIceCandidate(new RTCIceCandidate(msg.candidate)) } catch (_) {}
        break
      }
      case 'peer_left':
        removePeer(msg.peer_id)
        addSystemMsg(`${peersRef.current[msg.peer_id]?.name || 'Un participant'} a quitté`)
        break
      case 'chat':
        setChatMessages(prev => [...prev, { from: msg.from_name, text: msg.text, time: msg.time, id: Date.now() + Math.random() }])
        setUnread(u => showChat ? 0 : u + 1)
        break
      case 'hand':
        setRaisedHands(prev => ({ ...prev, [msg.peer_id]: msg.raised }))
        break
      case 'screen':
        setPeers(prev => {
          const u = { ...prev, [msg.peer_id]: { ...prev[msg.peer_id], isSharing: msg.sharing } }
          peersRef.current = u; return u
        })
        break
    }
  }, [showChat]) // eslint-disable-line

  const createPeerConnection = (peerId, peerName) => {
    if (pcsRef.current[peerId]) return pcsRef.current[peerId]
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS })
    localStream.current?.getTracks().forEach(t => pc.addTrack(t, localStream.current))
    pc.onicecandidate = (e) => {
      if (e.candidate && wsRef.current?.readyState === 1)
        wsRef.current.send(JSON.stringify({ type: 'ice', to: peerId, candidate: e.candidate }))
    }
    pc.ontrack = (e) => {
      const stream = e.streams[0]
      setPeers(prev => { const u = {...prev, [peerId]: {...(prev[peerId]||{name:peerName}), stream}}; peersRef.current = u; return u })
    }
    pc.onconnectionstatechange = () => {
      if (['failed','disconnected','closed'].includes(pc.connectionState)) removePeer(peerId)
    }
    pcsRef.current[peerId] = pc
    return pc
  }

  const createOffer = async (peerId, peerName) => {
    const pc = createPeerConnection(peerId, peerName)
    try {
      const offer = await pc.createOffer()
      await pc.setLocalDescription(offer)
      wsRef.current?.send(JSON.stringify({ type: 'offer', to: peerId, sdp: pc.localDescription }))
    } catch (_) {}
  }

  const handleOffer = async (peerId, peerName, sdp) => {
    const pc = createPeerConnection(peerId, peerName)
    try {
      await pc.setRemoteDescription(new RTCSessionDescription(sdp))
      const answer = await pc.createAnswer()
      await pc.setLocalDescription(answer)
      wsRef.current?.send(JSON.stringify({ type: 'answer', to: peerId, sdp: pc.localDescription }))
    } catch (_) {}
  }

  const removePeer = (peerId) => {
    pcsRef.current[peerId]?.close()
    delete pcsRef.current[peerId]
    setPeers(prev => { const u = {...prev}; delete u[peerId]; peersRef.current = u; return u })
    setRaisedHands(prev => { const u = {...prev}; delete u[peerId]; return u })
  }

  /* ═══════════════════════════════════════
     CONTRÔLES A/V
  ═══════════════════════════════════════ */
  const toggleMic = () => {
    localStream.current?.getAudioTracks().forEach(t => { t.enabled = !t.enabled })
    setMicOn(v => !v)
  }

  const toggleCam = () => {
    localStream.current?.getVideoTracks().forEach(t => { t.enabled = !t.enabled })
    setCamOn(v => !v)
  }

  /* ═══════════════════════════════════════
     PARTAGE D'ÉCRAN
  ═══════════════════════════════════════ */
  const toggleScreen = async () => {
    if (screenSharing) {
      // Arrêter le partage → revenir sur la caméra
      screenStream.current?.getTracks().forEach(t => t.stop())
      screenStream.current = null

      const camTrack = localStream.current?.getVideoTracks()[0]
      if (camTrack) {
        // Remplacer la piste écran par la caméra dans toutes les connexions
        Object.values(pcsRef.current).forEach(pc => {
          const sender = pc.getSenders().find(s => s.track?.kind === 'video')
          if (sender && camTrack) sender.replaceTrack(camTrack)
        })
        if (localVideoRef.current) localVideoRef.current.srcObject = localStream.current
      }
      setScreenSharing(false)
      wsRef.current?.send(JSON.stringify({ type: 'screen', sharing: false }))

    } else {
      // Démarrer le partage d'écran
      try {
        const sStream = await navigator.mediaDevices.getDisplayMedia({
          video: { cursor: 'always' },
          audio: true,
        })
        screenStream.current = sStream
        const screenTrack = sStream.getVideoTracks()[0]

        // Remplacer la caméra par l'écran dans toutes les connexions
        Object.values(pcsRef.current).forEach(pc => {
          const sender = pc.getSenders().find(s => s.track?.kind === 'video')
          if (sender) sender.replaceTrack(screenTrack)
        })

        // Afficher l'écran dans la vidéo locale
        if (localVideoRef.current) {
          const mixedStream = new MediaStream([
            screenTrack,
            ...localStream.current.getAudioTracks(),
          ])
          localVideoRef.current.srcObject = mixedStream
        }

        // Quand l'utilisateur arrête via le bouton natif du navigateur
        screenTrack.onended = () => toggleScreen()

        setScreenSharing(true)
        wsRef.current?.send(JSON.stringify({ type: 'screen', sharing: true }))

      } catch (err) {
        if (err.name !== 'NotAllowedError')
          setErrMsg('Partage écran : ' + err.message)
      }
    }
  }

  /* ═══════════════════════════════════════
     CHAT
  ═══════════════════════════════════════ */
  const sendChat = () => {
    const text = chatInput.trim()
    if (!text || wsRef.current?.readyState !== 1) return
    const time = new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
    wsRef.current.send(JSON.stringify({ type: 'chat', text, time }))
    setChatMessages(prev => [...prev, { from: 'Moi', text, time, id: Date.now(), self: true }])
    setChatInput('')
  }

  const addSystemMsg = (text) => {
    setChatMessages(prev => [...prev, { system: true, text, id: Date.now() }])
  }

  /* ═══════════════════════════════════════
     LEVER LA MAIN
  ═══════════════════════════════════════ */
  const toggleHand = () => {
    const next = !handRaised
    setHandRaised(next)
    wsRef.current?.send(JSON.stringify({ type: 'hand', raised: next }))
  }

  /* ═══════════════════════════════════════
     PLEIN ÉCRAN
  ═══════════════════════════════════════ */
  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen()
    } else {
      document.exitFullscreen()
    }
  }

  /* ═══════════════════════════════════════
     RACCROCHER
  ═══════════════════════════════════════ */
  const hangUp = () => {
    if (recState === 'recording') stopRecording()
    else { cleanup(); navigate(-1) }
  }

  const cleanup = () => {
    wsRef.current?.close()
    Object.values(pcsRef.current).forEach(pc => pc.close())
    pcsRef.current = {}
    screenStream.current?.getTracks().forEach(t => t.stop())
    localStream.current?.getTracks().forEach(t => t.stop())
    clearInterval(durationTick.current)
  }

  /* ═══════════════════════════════════════
     ENREGISTREMENT
  ═══════════════════════════════════════ */
  const startRecording = useCallback(async () => {
    if (!isTeacher || recState === 'recording') return
    chunks.current = []; setRecSize(0); setRecDuration(0)
    const mimeType = ['video/webm;codecs=vp9,opus','video/webm;codecs=vp8,opus','video/webm']
      .find(t => MediaRecorder.isTypeSupported(t)) || ''
    const src = screenSharing
      ? new MediaStream([
          ...(screenStream.current?.getVideoTracks() || []),
          ...localStream.current.getAudioTracks(),
        ])
      : localStream.current
    const rec = new MediaRecorder(src, { mimeType: mimeType||undefined, videoBitsPerSecond: 2_000_000 })
    rec.ondataavailable = e => { if (e.data?.size>0) { chunks.current.push(e.data); setRecSize(p=>p+e.data.size) } }
    rec.onstop = () => { clearInterval(durationTick.current); uploadRecording(rec.mimeType) }
    rec.start(2000)
    mediaRec.current = rec
    setRecState('recording')
    durationTick.current = setInterval(() => setRecDuration(d => d+1), 1000)
  }, [isTeacher, recState, screenSharing])

  const stopRecording = useCallback(() => {
    if (mediaRec.current?.state === 'recording') { setRecState('stopping'); mediaRec.current.stop() }
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
      cleanup(); navigate(-1)
    } catch (err) {
      setErrMsg(`Upload échoué : ${err.message}`)
      setRecState('error')
    }
  }

  const fmtD = s => `${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`
  const fmtS = b => b < 1048576 ? `${(b/1024).toFixed(0)} KB` : `${(b/1048576).toFixed(1)} MB`

  /* ═══════════════════════════════════════
     RENDU
  ═══════════════════════════════════════ */
  const peerList    = Object.entries(peers)
  const totalPeers  = peerList.length
  const totalPeople = totalPeers + 1
  const gridCols    = totalPeers === 0 ? 1 : totalPeers <= 1 ? 2 : totalPeers <= 3 ? 2 : totalPeers <= 8 ? 3 : 4

  // Si un pair partage son écran → l'épingler automatiquement
  const sharingPeer = peerList.find(([, p]) => p.isSharing)
  const activePinned = pinnedPeer || (sharingPeer ? sharingPeer[0] : null)

  return (
    <div
      ref={containerRef}
      style={{ height:'100dvh', display:'flex', flexDirection:'column', background:'#0d1117', color:'#fff', overflow:'hidden', userSelect:'none' }}
    >

      {/* ── Topbar ── */}
      <div style={{ height:48, flexShrink:0, display:'flex', alignItems:'center', justifyContent:'space-between', padding:'0 14px', background:'#161b22', borderBottom:'1px solid rgba(255,255,255,.06)', zIndex:10 }}>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <button onClick={() => navigate(-1)} style={{ background:'none', border:'none', color:'rgba(255,255,255,.5)', fontSize:18, cursor:'pointer', padding:'4px 6px' }}>←</button>
          <div>
            <div style={{ fontWeight:700, fontSize:13 }}>{session?.title || 'Cours en ligne'}</div>
            <div style={{ fontSize:11, color:'rgba(255,255,255,.4)' }}>
              {status === 'connecting' ? '🔄 Connexion…' : `👥 ${totalPeople} participant${totalPeople>1?'s':''}`}
            </div>
          </div>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          {/* Indicateur REC */}
          {recState === 'recording' && (
            <div style={{ background:'rgba(239,68,68,.15)', border:'1px solid rgba(239,68,68,.4)', borderRadius:20, padding:'3px 10px', fontSize:11, fontWeight:700, color:'#f87171', display:'flex', alignItems:'center', gap:5 }}>
              <span style={{ width:6,height:6,borderRadius:'50%',background:'#ef4444',display:'inline-block',animation:'blink 1.2s infinite' }} />
              REC {fmtD(recDuration)} · {fmtS(recSize)}
            </div>
          )}
          {recState === 'uploading' && (
            <div style={{ display:'flex', alignItems:'center', gap:8, fontSize:11, color:'#60a5fa' }}>
              <div style={{ width:80,height:4,background:'rgba(255,255,255,.1)',borderRadius:4,overflow:'hidden' }}>
                <div style={{ height:'100%', width:`${uploadPct}%`, background:'#3b82f6', transition:'width .3s' }} />
              </div>
              {uploadPct}%
            </div>
          )}
          {/* Plein écran */}
          <button onClick={toggleFullscreen} title="Plein écran"
            style={{ background:'none', border:'none', color:'rgba(255,255,255,.5)', fontSize:16, cursor:'pointer', padding:4 }}>
            {fullscreen ? '⊠' : '⛶'}
          </button>
        </div>
      </div>

      {/* ── Corps principal ── */}
      <div style={{ flex:1, display:'flex', overflow:'hidden' }}>

        {/* Grille vidéo */}
        <div style={{ flex:1, overflow:'hidden', position:'relative', padding:4, display:'grid',
          gridTemplateColumns: activePinned ? '1fr' : `repeat(${gridCols}, 1fr)`,
          gridTemplateRows:    activePinned ? '1fr 120px' : undefined,
          gap:4, background:'#0d1117' }}>

          {/* Vue épinglée (partage écran ou pair sélectionné) */}
          {activePinned && (() => {
            const isMe = activePinned === 'me'
            const p = peers[activePinned]
            return (
              <div style={{ position:'relative', borderRadius:12, overflow:'hidden', background:'#161b22', cursor:'pointer' }}
                onClick={() => setPinnedPeer(null)}>
                {isMe
                  ? <video ref={localVideoRef} autoPlay muted playsInline style={{ width:'100%',height:'100%',objectFit:'contain',background:'#000' }} />
                  : <PeerVideo stream={p?.stream} style={{ width:'100%',height:'100%',objectFit:'contain',background:'#000' }} />
                }
                <div style={{ position:'absolute',top:8,left:8,background:'rgba(0,0,0,.6)',borderRadius:8,padding:'3px 10px',fontSize:12 }}>
                  {isMe ? `${user?.name||'Moi'} (partage écran)` : p?.name}
                  <span style={{ marginLeft:6,fontSize:10,color:'rgba(255,255,255,.5)' }}>· Clic pour désépingler</span>
                </div>
              </div>
            )
          })()}

          {/* Tuiles des participants */}
          <div style={{ display:'flex', gap:4, overflowX: activePinned ? 'auto' : undefined,
            flexDirection: activePinned ? 'row' : undefined,
            display: activePinned ? 'flex' : 'contents' }}>

            {/* Moi */}
            <VideoTile
              label={user?.name || 'Moi'}
              isSelf videoRef={localVideoRef}
              micOn={micOn} camOn={camOn && !screenSharing}
              isTeacher={isTeacher}
              handRaised={handRaised}
              isSharing={screenSharing}
              compact={!!activePinned}
              onPin={() => setPinnedPeer(activePinned === 'me' ? null : 'me')}
              pinned={pinnedPeer === 'me'}
              showLocalVideo={!activePinned}
            />

            {/* Pairs */}
            {peerList.map(([id, peer]) => (
              <VideoTile
                key={id}
                label={peer.name}
                stream={peer.stream}
                handRaised={!!raisedHands[id]}
                isSharing={peer.isSharing}
                compact={!!activePinned}
                onPin={() => setPinnedPeer(activePinned === id ? null : id)}
                pinned={pinnedPeer === id}
              />
            ))}
          </div>

          {/* Overlay connexion */}
          {status === 'connecting' && (
            <div style={{ position:'absolute',inset:0,display:'flex',alignItems:'center',justifyContent:'center',background:'rgba(13,17,23,.95)',zIndex:20,flexDirection:'column',gap:14 }}>
              <div style={{ width:44,height:44,border:'3px solid rgba(255,255,255,.1)',borderTopColor:'#25d366',borderRadius:'50%',animation:'spin .8s linear infinite' }} />
              <div style={{ color:'rgba(255,255,255,.5)',fontSize:13 }}>Connexion en cours…</div>
            </div>
          )}

          {status === 'error' && (
            <div style={{ position:'absolute',inset:0,display:'flex',alignItems:'center',justifyContent:'center',background:'rgba(13,17,23,.97)',zIndex:20,flexDirection:'column',gap:12 }}>
              <div style={{ fontSize:40 }}>📵</div>
              <div style={{ color:'#f87171',fontSize:13,textAlign:'center',maxWidth:260 }}>{errMsg||'Impossible de rejoindre'}</div>
              <button onClick={()=>navigate(-1)} style={{ background:'#ef4444',border:'none',color:'#fff',borderRadius:10,padding:'9px 22px',fontWeight:700,cursor:'pointer' }}>Retour</button>
            </div>
          )}

          {/* Toast upload réussi */}
          {recState === 'done' && (
            <div style={{ position:'absolute',bottom:12,left:'50%',transform:'translateX(-50%)',background:'rgba(0,0,0,.9)',borderRadius:12,padding:'12px 20px',zIndex:10,border:'1px solid rgba(37,211,102,.4)',display:'flex',alignItems:'center',gap:10,fontSize:13 }}>
              ✅ <span style={{ color:'#4ade80',fontWeight:700 }}>Cours sauvegardé !</span>
            </div>
          )}
        </div>

        {/* ── Chat latéral ── */}
        {showChat && (
          <div style={{ width:280,flexShrink:0,display:'flex',flexDirection:'column',background:'#161b22',borderLeft:'1px solid rgba(255,255,255,.06)' }}>
            <div style={{ padding:'10px 14px',borderBottom:'1px solid rgba(255,255,255,.06)',fontWeight:700,fontSize:13,display:'flex',alignItems:'center',justifyContent:'space-between' }}>
              💬 Chat
              <button onClick={()=>{setShowChat(false)}} style={{ background:'none',border:'none',color:'rgba(255,255,255,.4)',fontSize:18,cursor:'pointer' }}>×</button>
            </div>

            {/* Messages */}
            <div style={{ flex:1,overflowY:'auto',padding:10,display:'flex',flexDirection:'column',gap:8 }}>
              {chatMessages.length === 0 && (
                <div style={{ color:'rgba(255,255,255,.3)',fontSize:12,textAlign:'center',marginTop:20 }}>
                  Aucun message pour l'instant
                </div>
              )}
              {chatMessages.map(m => m.system ? (
                <div key={m.id} style={{ textAlign:'center',fontSize:11,color:'rgba(255,255,255,.3)',fontStyle:'italic' }}>{m.text}</div>
              ) : (
                <div key={m.id} style={{ alignSelf: m.self ? 'flex-end' : 'flex-start', maxWidth:'90%' }}>
                  {!m.self && <div style={{ fontSize:10,color:'rgba(255,255,255,.4)',marginBottom:2,paddingLeft:4 }}>{m.from}</div>}
                  <div style={{
                    background: m.self ? '#25d366' : '#1f2937',
                    borderRadius: m.self ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
                    padding:'7px 12px', fontSize:13, lineHeight:1.4, wordBreak:'break-word',
                    color: m.self ? '#fff' : 'rgba(255,255,255,.9)',
                  }}>
                    {m.text}
                  </div>
                  {m.time && <div style={{ fontSize:10,color:'rgba(255,255,255,.3)',marginTop:2,paddingLeft:4,textAlign:m.self?'right':'left' }}>{m.time}</div>}
                </div>
              ))}
              <div ref={chatEndRef} />
            </div>

            {/* Saisie */}
            <div style={{ padding:10,borderTop:'1px solid rgba(255,255,255,.06)',display:'flex',gap:8 }}>
              <input
                value={chatInput}
                onChange={e => setChatInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && sendChat()}
                placeholder="Message…"
                style={{ flex:1,background:'#1f2937',border:'1px solid rgba(255,255,255,.1)',borderRadius:20,padding:'8px 14px',color:'#fff',fontSize:13,outline:'none' }}
              />
              <button onClick={sendChat} style={{ background:'#25d366',border:'none',borderRadius:'50%',width:36,height:36,cursor:'pointer',fontSize:16,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0 }}>➤</button>
            </div>
          </div>
        )}
      </div>

      {/* ── Barre de contrôles ── */}
      <div style={{ height:76,flexShrink:0,display:'flex',alignItems:'center',justifyContent:'center',gap:10,background:'#161b22',borderTop:'1px solid rgba(255,255,255,.06)',padding:'0 12px' }}>

        {/* Micro */}
        <CtrlBtn onClick={toggleMic} icon={micOn ? '🎤' : '🔇'} label={micOn?'Couper micro':'Activer micro'} color={micOn?'#1f2937':'#ef4444'} />

        {/* Caméra */}
        <CtrlBtn onClick={toggleCam} icon={camOn ? '📹' : '📷'} label={camOn?'Couper caméra':'Activer caméra'} color={camOn?'#1f2937':'#ef4444'} />

        {/* Partage d'écran */}
        <CtrlBtn onClick={toggleScreen} icon='🖥' label={screenSharing?'Arrêter partage':'Partager écran'} color={screenSharing?'#2563eb':'#1f2937'} active={screenSharing} />

        {/* Lever la main */}
        <CtrlBtn onClick={toggleHand} icon='✋' label={handRaised?'Baisser la main':'Lever la main'} color={handRaised?'#d97706':'#1f2937'} pulse={handRaised} />

        {/* Chat */}
        <div style={{ position:'relative' }}>
          <CtrlBtn
            onClick={()=>{setShowChat(v=>!v); setUnread(0)}}
            icon='💬' label='Chat'
            color={showChat?'#25d366':'#1f2937'}
          />
          {unread > 0 && !showChat && (
            <div style={{ position:'absolute',top:0,right:0,width:18,height:18,borderRadius:'50%',background:'#ef4444',fontSize:10,fontWeight:700,display:'flex',alignItems:'center',justifyContent:'center',border:'2px solid #161b22' }}>
              {unread > 9 ? '9+' : unread}
            </div>
          )}
        </div>

        {/* Enregistrement (prof) */}
        {isTeacher && sessionId && (
          <CtrlBtn
            onClick={recState === 'recording' ? stopRecording : (recState === 'uploading' ? undefined : startRecording)}
            icon={recState === 'recording' ? '⏹' : recState === 'uploading' ? '⬆' : '⏺'}
            label={recState === 'recording' ? 'Arrêter REC' : 'Enregistrer'}
            color={recState === 'recording' ? '#ef4444' : '#1f2937'}
            pulse={recState === 'recording'}
            disabled={recState === 'uploading'}
          />
        )}

        {/* Raccrocher */}
        <button onClick={hangUp} style={{ width:52,height:52,borderRadius:'50%',background:'#ef4444',border:'none',cursor:'pointer',fontSize:20,display:'flex',alignItems:'center',justifyContent:'center',boxShadow:'0 4px 14px rgba(239,68,68,.4)',marginLeft:6,transition:'transform .1s' }}
          onMouseDown={e=>e.currentTarget.style.transform='scale(.9)'}
          onMouseUp={e=>e.currentTarget.style.transform='scale(1)'}>
          📵
        </button>
      </div>

      <style>{`
        @keyframes spin  { to { transform:rotate(360deg) } }
        @keyframes blink { 0%,100%{opacity:1} 50%{opacity:.15} }
        @keyframes pulse { 0%,100%{box-shadow:0 0 0 0 rgba(239,68,68,.5)} 60%{box-shadow:0 0 0 10px rgba(239,68,68,0)} }
        @keyframes handpulse { 0%,100%{box-shadow:0 0 0 0 rgba(217,119,6,.5)} 60%{box-shadow:0 0 0 10px rgba(217,119,6,0)} }
        * { box-sizing: border-box }
        ::-webkit-scrollbar { width:4px }
        ::-webkit-scrollbar-track { background: transparent }
        ::-webkit-scrollbar-thumb { background: rgba(255,255,255,.15); border-radius:4px }
      `}</style>
    </div>
  )
}

/* ═══════════════════════════════════════════════
   VideoTile
═══════════════════════════════════════════════ */
function VideoTile({ label, isSelf, videoRef, stream, micOn, camOn, isTeacher, handRaised, isSharing, compact, onPin, pinned, showLocalVideo = true }) {
  const elRef = useRef(null)
  useEffect(() => {
    if (!isSelf && stream && elRef.current) elRef.current.srcObject = stream
  }, [stream, isSelf])

  const noVideo = isSelf ? (camOn === false) : !stream

  if (compact) {
    return (
      <div onClick={onPin} style={{ position:'relative',borderRadius:10,overflow:'hidden',background:'#1f2937',minWidth:120,height:'100%',cursor:'pointer',flexShrink:0,border:pinned?'2px solid #25d366':'2px solid transparent' }}>
        {isSelf
          ? <video ref={videoRef} autoPlay muted playsInline style={{ width:'100%',height:'100%',objectFit:'cover',transform:'scaleX(-1)', display: noVideo?'none':'block' }} />
          : <PeerVideo stream={stream} style={{ width:'100%',height:'100%',objectFit:'cover', display: noVideo?'none':'block' }} />
        }
        {noVideo && <AvatarFallback label={label} small />}
        <div style={{ position:'absolute',bottom:4,left:0,right:0,textAlign:'center',fontSize:10,color:'rgba(255,255,255,.7)',background:'rgba(0,0,0,.5)',padding:'2px 0' }}>{label}</div>
        {handRaised && <span style={{ position:'absolute',top:4,right:4,fontSize:14 }}>✋</span>}
      </div>
    )
  }

  return (
    <div onClick={onPin} style={{ position:'relative',borderRadius:12,overflow:'hidden',background:'#161b22',minHeight:160,cursor:'pointer',border:pinned?'2px solid #25d366':'2px solid transparent',transition:'border-color .2s' }}>
      {isSelf
        ? <video ref={videoRef} autoPlay muted playsInline style={{ width:'100%',height:'100%',objectFit:'cover',transform:isSharing?'none':'scaleX(-1)',display:noVideo?'none':'block' }} />
        : <PeerVideo stream={stream} style={{ width:'100%',height:'100%',objectFit:'cover',display:noVideo?'none':'block' }} />
      }
      {noVideo && <AvatarFallback label={label} />}

      {/* Bandeau bas */}
      <div style={{ position:'absolute',bottom:0,left:0,right:0,padding:'18px 10px 8px',background:'linear-gradient(transparent,rgba(0,0,0,.72))',display:'flex',alignItems:'center',justifyContent:'space-between' }}>
        <div style={{ fontSize:12,fontWeight:600,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',maxWidth:'75%',display:'flex',alignItems:'center',gap:5 }}>
          {isSharing && <span style={{ fontSize:10,background:'#2563eb',borderRadius:4,padding:'1px 5px' }}>🖥 Écran</span>}
          {label}
          {isTeacher && <span style={{ fontSize:10,background:'#25d366',borderRadius:4,padding:'1px 5px',marginLeft:3 }}>Prof</span>}
        </div>
        <div style={{ display:'flex',gap:5,alignItems:'center' }}>
          {isSelf && micOn === false && <span style={{ fontSize:13 }}>🔇</span>}
          {handRaised && <span style={{ fontSize:15,animation:'handpulse 1.5s infinite' }}>✋</span>}
        </div>
      </div>
    </div>
  )
}

function PeerVideo({ stream, style }) {
  const ref = useRef(null)
  useEffect(() => { if (stream && ref.current) ref.current.srcObject = stream }, [stream])
  return <video ref={ref} autoPlay playsInline style={style} />
}

function AvatarFallback({ label, small }) {
  return (
    <div style={{ position:'absolute',inset:0,display:'flex',alignItems:'center',justifyContent:'center',flexDirection:'column',gap:8 }}>
      <div style={{ width:small?40:64,height:small?40:64,borderRadius:'50%',background:'linear-gradient(135deg,#25d366,#128c7e)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:small?18:28,fontWeight:700 }}>
        {label?.[0]?.toUpperCase()||'?'}
      </div>
      {!small && <div style={{ fontSize:11,color:'rgba(255,255,255,.4)' }}>Caméra désactivée</div>}
    </div>
  )
}

function CtrlBtn({ onClick, icon, label, color, pulse, disabled, active }) {
  return (
    <button onClick={disabled ? undefined : onClick} title={label}
      style={{ width:50,height:50,borderRadius:'50%',background:color||'#1f2937',border:'none',cursor:disabled?'default':'pointer',fontSize:18,display:'flex',alignItems:'center',justifyContent:'center',transition:'transform .1s, background .2s',animation:pulse?'pulse 1.5s infinite':'none',opacity:disabled?.5:1,flexShrink:0 }}
      onMouseDown={e=>{if(!disabled)e.currentTarget.style.transform='scale(.88)'}}
      onMouseUp={e=>e.currentTarget.style.transform='scale(1)'}>
      {icon}
    </button>
  )
}
