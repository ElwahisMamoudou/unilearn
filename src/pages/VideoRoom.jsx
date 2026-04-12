import { useEffect, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import api from '../api/client'
import useAuthStore from '../store/authStore'

export default function VideoRoom() {
  const { roomId } = useParams()
  const navigate   = useNavigate()
  const { user }   = useAuthStore()

  const [session, setSession]     = useState(null)
  const [peers, setPeers]         = useState([])
  const [myStream, setMyStream]   = useState(null)
  const [status, setStatus]       = useState('Connexion…')
  const [error, setError]         = useState(null)   // erreur bloquante
  const [micOn, setMicOn]         = useState(true)
  const [camOn, setCamOn]         = useState(true)
  const [chatMessages, setChat]   = useState([])
  const [chatInput, setChatInput] = useState('')
  const [showChat, setShowChat]   = useState(false)
  const [peerReady, setPeerReady] = useState(false)

  const myVideoRef = useRef()
  const peersRef   = useRef([])
  const peerObj    = useRef(null)
  const connRef    = useRef({})
  const chatRef    = useRef()

  const isTeacher = user?.role === 'teacher' || user?.role === 'admin'

  // ── Vérification HTTPS / mediaDevices ─────────
  useEffect(() => {
    const isSecure = location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1'
    if (!isSecure) {
      setError('https')
      return
    }
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setError('no_media')
      return
    }
    // Charger PeerJS
    const script = document.createElement('script')
    script.src = 'https://unpkg.com/peerjs@1.5.2/dist/peerjs.min.js'
    script.onload = () => setPeerReady(true)
    script.onerror = () => setError('peerjs')
    document.head.appendChild(script)

    return () => {
      cleanup()
      if (document.head.contains(script)) document.head.removeChild(script)
    }
  }, [])

  // ── Trouver la session ─────────────────────────
  useEffect(() => {
    const find = async () => {
      try {
        const courses = await api.get('/courses/my')
        for (const c of courses.data) {
          const r = await api.get(`/sessions/course/${c.id}`)
          const found = r.data.find(s => s.room_id === roomId)
          if (found) { setSession(found); return }
        }
      } catch {}
    }
    find()
  }, [roomId])

  // ── Init PeerJS une fois chargé ────────────────
  useEffect(() => {
    if (!peerReady) return
    initPeer()
  }, [peerReady])

  const initPeer = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true })
      setMyStream(stream)
      if (myVideoRef.current) {
        myVideoRef.current.srcObject = stream
        myVideoRef.current.muted = true
      }

      const myPeerId = isTeacher
        ? `teacher_${roomId}`
        : `student_${roomId}_${user.id}_${Date.now()}`

      const p = new window.Peer(myPeerId, {
        host: '0.peerjs.com', port: 443, path: '/', secure: true,
        config: { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] },
      })
      peerObj.current = p

      p.on('open', () => {
        setStatus('Connecté ✓')
        if (!isTeacher) {
          setTimeout(() => {
            const call = p.call(`teacher_${roomId}`, stream)
            if (call) {
              call.on('stream', remote => addPeer({ id: 'teacher', stream: remote, name: 'Enseignant' }))
              call.on('error', () => setStatus('En attente de l\'enseignant…'))
            }
            const conn = p.connect(`teacher_${roomId}`)
            if (conn) {
              connRef.current['teacher'] = conn
              conn.on('data', receiveMessage)
            }
          }, 1000)
        }
      })

      p.on('call', call => {
        call.answer(stream)
        call.on('stream', remote => addPeer({ id: call.peer, stream: remote, name: 'Étudiant' }))
        call.on('close', () => removePeer(call.peer))
      })

      p.on('connection', conn => {
        connRef.current[conn.peer] = conn
        conn.on('data', receiveMessage)
        conn.on('close', () => removePeer(conn.peer))
      })

      p.on('error', err => {
        if (err.type === 'peer-unavailable') {
          setStatus('En attente de l\'enseignant…')
        } else if (err.type === 'network') {
          setStatus('Problème réseau — reconnexion…')
        } else {
          setStatus(`Erreur: ${err.message}`)
        }
      })

    } catch (err) {
      if (err.name === 'NotAllowedError') {
        setError('permission')
      } else if (err.name === 'NotFoundError') {
        setError('no_device')
      } else {
        setError('unknown')
      }
    }
  }

  const addPeer = ({ id, stream, name }) => {
    peersRef.current = peersRef.current.filter(p => p.id !== id)
    peersRef.current.push({ id, stream, name })
    setPeers([...peersRef.current])
  }

  const removePeer = (id) => {
    peersRef.current = peersRef.current.filter(p => p.id !== id)
    setPeers([...peersRef.current])
  }

  const receiveMessage = (data) => {
    setChat(prev => [...prev, data])
    setTimeout(() => { if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight }, 100)
  }

  const sendMessage = () => {
    if (!chatInput.trim()) return
    const msg = { from: user.name, text: chatInput.trim(), at: new Date().toLocaleTimeString() }
    Object.values(connRef.current).forEach(conn => { try { conn.send(msg) } catch {} })
    receiveMessage(msg)
    setChatInput('')
  }

  const toggleMic = () => {
    if (!myStream) return
    myStream.getAudioTracks().forEach(t => { t.enabled = !t.enabled })
    setMicOn(v => !v)
  }

  const toggleCam = () => {
    if (!myStream) return
    myStream.getVideoTracks().forEach(t => { t.enabled = !t.enabled })
    setCamOn(v => !v)
  }

  const cleanup = () => {
    if (myStream) myStream.getTracks().forEach(t => t.stop())
    if (peerObj.current) { try { peerObj.current.destroy() } catch {} }
  }

  const leave = async () => {
    cleanup()
    if (isTeacher && session) {
      try { await api.post(`/sessions/${session.id}/end`) } catch {}
    }
    navigate(-1)
  }

  // ── Pages d'erreur ────────────────────────────
  if (error) {
    const errors = {
      https: {
        icon: '🔒',
        title: 'HTTPS requis',
        msg: 'La vidéoconférence nécessite une connexion sécurisée (HTTPS).',
        fix: (
          <div>
            <p style={{ marginBottom: 12 }}>Pour activer sur localhost, ouvrez Chrome et allez à :</p>
            <div style={{ background: '#1e293b', color: '#e2e8f0', padding: '10px 16px', borderRadius: 8, fontFamily: 'monospace', fontSize: 13, marginBottom: 12 }}>
              chrome://flags/#unsafely-treat-insecure-origin-as-secure
            </div>
            <p>Ajoutez <code>http://localhost:5173</code>, activez, relancez Chrome.</p>
          </div>
        ),
      },
      permission: {
        icon: '🎤',
        title: 'Accès caméra/micro refusé',
        msg: 'Le navigateur a bloqué l\'accès à votre caméra et microphone.',
        fix: <p>Cliquez sur l'icône 🔒 dans la barre d'adresse → Autorisez la caméra et le microphone → Rechargez la page.</p>,
      },
      no_device: {
        icon: '📷',
        title: 'Aucune caméra détectée',
        msg: 'Aucune caméra ou microphone trouvé sur cet appareil.',
        fix: <p>Branchez une caméra USB ou vérifiez que votre webcam est bien connectée.</p>,
      },
      no_media: {
        icon: '🌐',
        title: 'Navigateur non compatible',
        msg: 'Votre navigateur ne supporte pas la vidéoconférence.',
        fix: <p>Utilisez <strong>Google Chrome</strong> ou <strong>Mozilla Firefox</strong> à jour.</p>,
      },
      peerjs: {
        icon: '🔌',
        title: 'Impossible de charger PeerJS',
        msg: 'La bibliothèque de vidéoconférence n\'a pas pu se charger.',
        fix: <p>Vérifiez votre connexion internet et rechargez la page.</p>,
      },
      unknown: {
        icon: '⚠️',
        title: 'Erreur inattendue',
        msg: 'Une erreur s\'est produite lors de l\'initialisation.',
        fix: <p>Rechargez la page ou réessayez dans quelques instants.</p>,
      },
    }
    const e = errors[error] || errors.unknown
    return (
      <div style={{ minHeight: '100dvh', background: '#0f172a', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <div style={{ background: '#1e293b', borderRadius: 16, padding: 40, maxWidth: 480, width: '100%', textAlign: 'center' }}>
          <div style={{ fontSize: 56, marginBottom: 16 }}>{e.icon}</div>
          <h2 style={{ color: '#f1f5f9', fontFamily: 'Playfair Display, serif', marginBottom: 8 }}>{e.title}</h2>
          <p style={{ color: '#94a3b8', marginBottom: 24 }}>{e.msg}</p>
          <div style={{ background: '#0f172a', borderRadius: 10, padding: 20, textAlign: 'left', color: '#cbd5e1', fontSize: 14, lineHeight: 1.7, marginBottom: 24 }}>
            {e.fix}
          </div>
          <button onClick={() => navigate(-1)}
            style={{ background: '#3b82f6', border: 'none', borderRadius: 10, padding: '10px 28px', color: '#fff', fontWeight: 600, cursor: 'pointer', fontSize: 14 }}>
            ← Retour
          </button>
        </div>
      </div>
    )
  }

  // ── Interface principale ───────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100dvh', background: '#0f172a' }}>
      {/* Topbar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 20px', background: '#1e293b', borderBottom: '1px solid #334155' }}>
        <div style={{ fontFamily: 'Playfair Display, serif', color: '#f1f5f9', fontSize: 16, flex: 1 }}>
          {session?.title || 'Cours en ligne'}
        </div>
        <span style={{ fontSize: 12, color: status.startsWith('Connecté') ? '#4ade80' : '#94a3b8',
          background: '#0f172a', padding: '4px 12px', borderRadius: 20 }}>
          {status}
        </span>
        <span style={{ fontSize: 12, color: '#64748b' }}>
          {peers.length + 1} participant{peers.length > 0 ? 's' : ''}
        </span>
      </div>

      {/* Grille vidéo */}
      <div style={{
        flex: 1, display: 'grid', padding: 12, gap: 12, overflow: 'hidden',
        gridTemplateColumns: peers.length === 0 ? '1fr' : peers.length === 1 ? '1fr 1fr' : 'repeat(3, 1fr)',
      }}>
        {/* Ma vidéo */}
        <div style={{ position: 'relative', background: '#1e293b', borderRadius: 12, overflow: 'hidden' }}>
          <video ref={myVideoRef} autoPlay playsInline muted
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block',
              filter: camOn ? 'none' : 'brightness(0)' }} />
          {!camOn && (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div style={{ width: 56, height: 56, borderRadius: '50%', background: '#334155',
                display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontSize: 20, fontWeight: 700 }}>
                {user?.name?.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}
              </div>
            </div>
          )}
          <div style={{ position: 'absolute', bottom: 8, left: 12, fontSize: 12, color: '#f1f5f9',
            background: 'rgba(0,0,0,.5)', padding: '2px 8px', borderRadius: 20 }}>
            {user?.name} (Vous){isTeacher ? ' · Enseignant' : ''}
          </div>
        </div>

        {/* Vidéos des pairs */}
        {peers.map(p => (
          <div key={p.id} style={{ position: 'relative', background: '#1e293b', borderRadius: 12, overflow: 'hidden' }}>
            <video autoPlay playsInline
              ref={el => { if (el && p.stream) el.srcObject = p.stream }}
              style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
            <div style={{ position: 'absolute', bottom: 8, left: 12, fontSize: 12, color: '#f1f5f9',
              background: 'rgba(0,0,0,.5)', padding: '2px 8px', borderRadius: 20 }}>
              {p.name}
            </div>
          </div>
        ))}
      </div>

      {/* Chat */}
      {showChat && (
        <div style={{ position: 'fixed', right: 16, bottom: 90, width: 300, height: 360,
          background: '#1e293b', borderRadius: 12, border: '1px solid #334155',
          display: 'flex', flexDirection: 'column', overflow: 'hidden', zIndex: 10 }}>
          <div style={{ padding: '10px 14px', borderBottom: '1px solid #334155', fontSize: 13, color: '#f1f5f9', fontWeight: 600 }}>
            Chat
          </div>
          <div ref={chatRef} style={{ flex: 1, overflowY: 'auto', padding: 12 }}>
            {chatMessages.length === 0
              ? <div style={{ color: '#64748b', fontSize: 12, textAlign: 'center', marginTop: 20 }}>Aucun message</div>
              : chatMessages.map((m, i) => (
                <div key={i} style={{ marginBottom: 10 }}>
                  <div style={{ fontSize: 11, color: '#94a3b8' }}>{m.from} · {m.at}</div>
                  <div style={{ fontSize: 13, color: '#e2e8f0', marginTop: 2 }}>{m.text}</div>
                </div>
              ))
            }
          </div>
          <div style={{ display: 'flex', padding: 8, gap: 6, borderTop: '1px solid #334155' }}>
            <input
              style={{ flex: 1, background: '#0f172a', border: '1px solid #334155', borderRadius: 8,
                padding: '6px 10px', color: '#f1f5f9', fontSize: 13, outline: 'none' }}
              placeholder="Message…" value={chatInput}
              onChange={e => setChatInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && sendMessage()} />
            <button onClick={sendMessage}
              style={{ background: '#3b82f6', border: 'none', borderRadius: 8, padding: '6px 12px', color: '#fff', cursor: 'pointer', fontSize: 13 }}>
              →
            </button>
          </div>
        </div>
      )}

      {/* Barre de contrôle */}
      <div style={{ display: 'flex', justifyContent: 'center', gap: 12, padding: '16px 20px',
        background: '#1e293b', borderTop: '1px solid #334155' }}>
        <CtrlBtn active={micOn}    onClick={toggleMic}              label={micOn ? '🎤' : '🔇'} title="Micro" />
        <CtrlBtn active={camOn}    onClick={toggleCam}              label="📷"                   title="Caméra" />
        <CtrlBtn active={showChat} onClick={() => setShowChat(v=>!v)} label="💬"                title="Chat" />
        <button onClick={leave}
          style={{ background: '#ef4444', border: 'none', borderRadius: 12,
            padding: '10px 28px', color: '#fff', fontWeight: 600, cursor: 'pointer', fontSize: 14 }}>
          Quitter
        </button>
      </div>
    </div>
  )
}

function CtrlBtn({ active, onClick, label, title }) {
  return (
    <button onClick={onClick} title={title} style={{
      width: 48, height: 48, borderRadius: 12, border: 'none', cursor: 'pointer',
      fontSize: 20, background: active ? '#334155' : '#ef4444', transition: 'background .15s',
    }}>
      {label}
    </button>
  )
}