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
  const [status, setStatus]       = useState('Connexion...')
  const [error, setError]         = useState(null)
  const [micOn, setMicOn]         = useState(true)
  const [camOn, setCamOn]         = useState(true)
  const [chatMessages, setChat]   = useState([])
  const [chatInput, setChatInput] = useState('')
  const [showChat, setShowChat]   = useState(false)
  const [peerReady, setPeerReady] = useState(false)

  /* ── Enregistrement ── */
  const [recording, setRecording]       = useState(false)
  const [saving, setSaving]             = useState(false)
  const [saveMsg, setSaveMsg]           = useState('')
  const mediaRecorderRef                = useRef(null)
  const recordedChunksRef               = useRef([])

  const myVideoRef = useRef()
  const peersRef   = useRef([])
  const peerObj    = useRef(null)
  const connRef    = useRef({})
  const chatRef    = useRef()

  const isTeacher = user?.role === 'teacher' || user?.role === 'admin'

  /* ── Verification HTTPS ── */
  useEffect(() => {
    const isSecure = location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1'
    if (!isSecure) { setError('https'); return }
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { setError('no_media'); return }
    const script = document.createElement('script')
    script.src = 'https://unpkg.com/peerjs@1.5.2/dist/peerjs.min.js'
    script.onload = () => setPeerReady(true)
    script.onerror = () => setError('peerjs')
    document.head.appendChild(script)
    return () => { cleanup(); if (document.head.contains(script)) document.head.removeChild(script) }
  }, [])

  /* ── Trouver la session ── */
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

  useEffect(() => { if (peerReady) initPeer() }, [peerReady])

  const initPeer = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true })
      setMyStream(stream)
      if (myVideoRef.current) { myVideoRef.current.srcObject = stream; myVideoRef.current.muted = true }

      const myPeerId = isTeacher
        ? `teacher_${roomId}`
        : `student_${roomId}_${user.id}_${Date.now()}`

      const p = new window.Peer(myPeerId, {
        host: '0.peerjs.com', port: 443, path: '/', secure: true,
        config: { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] },
      })
      peerObj.current = p

      p.on('open', () => {
        setStatus('Connecte')
        if (!isTeacher) {
          setTimeout(() => {
            const call = p.call(`teacher_${roomId}`, stream)
            if (call) {
              call.on('stream', remote => addPeer({ id: 'teacher', stream: remote, name: 'Enseignant' }))
              call.on('error', () => setStatus("En attente de l'enseignant..."))
            }
            const conn = p.connect(`teacher_${roomId}`)
            if (conn) { connRef.current['teacher'] = conn; conn.on('data', receiveMessage) }
          }, 1000)
        }
      })

      p.on('call', call => {
        call.answer(stream)
        call.on('stream', remote => addPeer({ id: call.peer, stream: remote, name: 'Etudiant' }))
        call.on('close', () => removePeer(call.peer))
      })

      p.on('connection', conn => {
        connRef.current[conn.peer] = conn
        conn.on('data', receiveMessage)
        conn.on('close', () => removePeer(conn.peer))
      })

      p.on('error', err => {
        if (err.type === 'peer-unavailable') setStatus("En attente de l'enseignant...")
        else if (err.type === 'network') setStatus('Probleme reseau...')
        else setStatus(`Erreur: ${err.message}`)
      })

    } catch (err) {
      if (err.name === 'NotAllowedError') setError('permission')
      else if (err.name === 'NotFoundError') setError('no_device')
      else setError('unknown')
    }
  }

  /* ── Enregistrement MediaRecorder ── */
  const startRecording = () => {
    if (!myStream) return
    recordedChunksRef.current = []

    // Combiner ma video + audio local (les pairs ne sont pas inclus cote MediaRecorder)
    const mr = new MediaRecorder(myStream, { mimeType: getSupportedMimeType() })

    mr.ondataavailable = e => {
      if (e.data && e.data.size > 0) recordedChunksRef.current.push(e.data)
    }

    mr.onstop = async () => {
      await saveRecording()
    }

    mr.start(1000) // chunk toutes les secondes
    mediaRecorderRef.current = mr
    setRecording(true)
    setSaveMsg('')
  }

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop()
    }
    setRecording(false)
  }

  const getSupportedMimeType = () => {
    const types = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4']
    for (const t of types) { if (MediaRecorder.isTypeSupported(t)) return t }
    return ''
  }

  const saveRecording = async () => {
    if (!recordedChunksRef.current.length || !session) return
    setSaving(true)
    setSaveMsg('Sauvegarde en cours...')

    try {
      const mimeType = getSupportedMimeType()
      const ext      = mimeType.includes('mp4') ? 'mp4' : 'webm'
      const blob     = new Blob(recordedChunksRef.current, { type: mimeType })
      const fileName = `cours_${session.title.replace(/\s+/g, '_')}_${Date.now()}.${ext}`
      const file     = new File([blob], fileName, { type: mimeType })

      const fd = new FormData()
      fd.append('course_id', session.course_id)
      fd.append('title',     session.title)
      fd.append('duration',  formatDuration(blob.size))
      fd.append('order',     999)
      fd.append('file',      file)

      await api.post('/lessons/upload', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
      setSaveMsg('Cours enregistre comme lecon !')
    } catch (err) {
      setSaveMsg('Erreur lors de la sauvegarde')
      console.error(err)
    } finally {
      setSaving(false)
    }
  }

  const formatDuration = (sizeBytes) => {
    // Estimation approximative basee sur la taille
    const minutes = Math.round(sizeBytes / (1024 * 1024) * 0.5)
    return minutes > 0 ? `${minutes} min` : '< 1 min'
  }

  const addPeer    = ({ id, stream, name }) => { peersRef.current = peersRef.current.filter(p => p.id !== id); peersRef.current.push({ id, stream, name }); setPeers([...peersRef.current]) }
  const removePeer = id => { peersRef.current = peersRef.current.filter(p => p.id !== id); setPeers([...peersRef.current]) }

  const receiveMessage = data => {
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

  const toggleMic = () => { if (!myStream) return; myStream.getAudioTracks().forEach(t => { t.enabled = !t.enabled }); setMicOn(v => !v) }
  const toggleCam = () => { if (!myStream) return; myStream.getVideoTracks().forEach(t => { t.enabled = !t.enabled }); setCamOn(v => !v) }

  const cleanup = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop()
    }
    if (myStream) myStream.getTracks().forEach(t => t.stop())
    if (peerObj.current) { try { peerObj.current.destroy() } catch {} }
  }

  const leave = async () => {
    // Stopper l'enregistrement si actif — sauvegarde automatique
    if (recording) stopRecording()
    cleanup()
    if (isTeacher && session) {
      try { await api.post(`/sessions/${session.id}/end`) } catch {}
    }
    navigate(-1)
  }

  /* ── Pages d'erreur ── */
  if (error) {
    const errors = {
      https:      { title: 'HTTPS requis',             msg: 'La videoconference necessite HTTPS.', fix: <p>Activez HTTPS ou utilisez localhost.</p> },
      permission: { title: 'Acces camera/micro refuse', msg: 'Le navigateur a bloque votre camera.', fix: <p>Autorisez la camera dans les parametres du navigateur.</p> },
      no_device:  { title: 'Aucune camera detectee',   msg: 'Aucune camera trouvee.',              fix: <p>Branchez une camera et rechargez.</p> },
      no_media:   { title: 'Navigateur incompatible',  msg: 'Utilisez Chrome ou Firefox.',         fix: <p>Mettez a jour votre navigateur.</p> },
      peerjs:     { title: 'Chargement impossible',    msg: 'Verifiez votre connexion.',           fix: <p>Rechargez la page.</p> },
      unknown:    { title: 'Erreur inattendue',         msg: 'Une erreur est survenue.',            fix: <p>Rechargez la page.</p> },
    }
    const e = errors[error] || errors.unknown
    return (
      <div style={{ minHeight: '100dvh', background: '#0f172a', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <div style={{ background: '#1e293b', borderRadius: 16, padding: 40, maxWidth: 480, width: '100%', textAlign: 'center' }}>
          <h2 style={{ color: '#f1f5f9', marginBottom: 8 }}>{e.title}</h2>
          <p style={{ color: '#94a3b8', marginBottom: 24 }}>{e.msg}</p>
          <div style={{ background: '#0f172a', borderRadius: 10, padding: 20, textAlign: 'left', color: '#cbd5e1', fontSize: 14, marginBottom: 24 }}>{e.fix}</div>
          <button onClick={() => navigate(-1)} style={{ background: '#3b82f6', border: 'none', borderRadius: 10, padding: '10px 28px', color: '#fff', fontWeight: 600, cursor: 'pointer' }}>
            Retour
          </button>
        </div>
      </div>
    )
  }

  /* ── Interface principale ── */
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100dvh', background: '#0f172a' }}>

      {/* Topbar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 20px', background: '#1e293b', borderBottom: '1px solid #334155' }}>
        <div style={{ fontFamily: 'Playfair Display, serif', color: '#f1f5f9', fontSize: 16, flex: 1 }}>
          {session?.title || 'Cours en ligne'}
        </div>
        <span style={{ fontSize: 12, color: status === 'Connecte' ? '#4ade80' : '#94a3b8', background: '#0f172a', padding: '4px 12px', borderRadius: 20 }}>
          {status}
        </span>
        {recording && (
          <span style={{ fontSize: 12, color: '#ef4444', background: '#0f172a', padding: '4px 12px', borderRadius: 20, fontWeight: 700 }}>
            Enregistrement en cours
          </span>
        )}
        {saveMsg && (
          <span style={{ fontSize: 12, color: saveMsg.includes('Erreur') ? '#f87171' : '#4ade80', background: '#0f172a', padding: '4px 12px', borderRadius: 20 }}>
            {saveMsg}
          </span>
        )}
        <span style={{ fontSize: 12, color: '#64748b' }}>
          {peers.length + 1} participant{peers.length > 0 ? 's' : ''}
        </span>
      </div>

      {/* Grille video */}
      <div style={{
        flex: 1, display: 'grid', padding: 12, gap: 12, overflow: 'hidden',
        gridTemplateColumns: peers.length === 0 ? '1fr' : peers.length === 1 ? '1fr 1fr' : 'repeat(3, 1fr)',
      }}>
        <div style={{ position: 'relative', background: '#1e293b', borderRadius: 12, overflow: 'hidden' }}>
          <video ref={myVideoRef} autoPlay playsInline muted
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', filter: camOn ? 'none' : 'brightness(0)' }} />
          {!camOn && (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div style={{ width: 56, height: 56, borderRadius: '50%', background: '#334155', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontSize: 20, fontWeight: 700 }}>
                {user?.name?.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}
              </div>
            </div>
          )}
          <div style={{ position: 'absolute', bottom: 8, left: 12, fontSize: 12, color: '#f1f5f9', background: 'rgba(0,0,0,.5)', padding: '2px 8px', borderRadius: 20 }}>
            {user?.name} (Vous){isTeacher ? ' · Enseignant' : ''}
          </div>
        </div>
        {peers.map(p => (
          <div key={p.id} style={{ position: 'relative', background: '#1e293b', borderRadius: 12, overflow: 'hidden' }}>
            <video autoPlay playsInline ref={el => { if (el && p.stream) el.srcObject = p.stream }}
              style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
            <div style={{ position: 'absolute', bottom: 8, left: 12, fontSize: 12, color: '#f1f5f9', background: 'rgba(0,0,0,.5)', padding: '2px 8px', borderRadius: 20 }}>
              {p.name}
            </div>
          </div>
        ))}
      </div>

      {/* Chat */}
      {showChat && (
        <div style={{ position: 'fixed', right: 16, bottom: 90, width: 300, height: 360, background: '#1e293b', borderRadius: 12, border: '1px solid #334155', display: 'flex', flexDirection: 'column', overflow: 'hidden', zIndex: 10 }}>
          <div style={{ padding: '10px 14px', borderBottom: '1px solid #334155', fontSize: 13, color: '#f1f5f9', fontWeight: 600 }}>Chat</div>
          <div ref={chatRef} style={{ flex: 1, overflowY: 'auto', padding: 12 }}>
            {chatMessages.length === 0
              ? <div style={{ color: '#64748b', fontSize: 12, textAlign: 'center', marginTop: 20 }}>Aucun message</div>
              : chatMessages.map((m, i) => (
                <div key={i} style={{ marginBottom: 10 }}>
                  <div style={{ fontSize: 11, color: '#94a3b8' }}>{m.from} · {m.at}</div>
                  <div style={{ fontSize: 13, color: '#e2e8f0', marginTop: 2 }}>{m.text}</div>
                </div>
              ))}
          </div>
          <div style={{ display: 'flex', padding: 8, gap: 6, borderTop: '1px solid #334155' }}>
            <input style={{ flex: 1, background: '#0f172a', border: '1px solid #334155', borderRadius: 8, padding: '6px 10px', color: '#f1f5f9', fontSize: 13, outline: 'none' }}
              placeholder="Message..." value={chatInput}
              onChange={e => setChatInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && sendMessage()} />
            <button onClick={sendMessage} style={{ background: '#3b82f6', border: 'none', borderRadius: 8, padding: '6px 12px', color: '#fff', cursor: 'pointer', fontSize: 13 }}>
              Envoyer
            </button>
          </div>
        </div>
      )}

      {/* Barre de controle */}
      <div style={{ display: 'flex', justifyContent: 'center', gap: 12, padding: '16px 20px', background: '#1e293b', borderTop: '1px solid #334155', flexWrap: 'wrap' }}>
        <CtrlBtn active={micOn}    onClick={toggleMic}               label={micOn ? 'Micro ON' : 'Micro OFF'} />
        <CtrlBtn active={camOn}    onClick={toggleCam}               label="Camera" />
        <CtrlBtn active={showChat} onClick={() => setShowChat(v=>!v)} label="Chat" />

        {/* Bouton enregistrement — enseignant/admin seulement */}
        {isTeacher && !recording && (
          <button onClick={startRecording} disabled={saving}
            style={{ background: '#16a34a', border: 'none', borderRadius: 12, padding: '10px 20px', color: '#fff', fontWeight: 600, cursor: 'pointer', fontSize: 14 }}>
            Enregistrer le cours
          </button>
        )}
        {isTeacher && recording && (
          <button onClick={stopRecording}
            style={{ background: '#dc2626', border: 'none', borderRadius: 12, padding: '10px 20px', color: '#fff', fontWeight: 600, cursor: saving ? 'wait' : 'pointer', fontSize: 14, animation: 'pulse 1.5s infinite' }}>
            Arreter et sauvegarder
          </button>
        )}

        <button onClick={leave}
          style={{ background: '#ef4444', border: 'none', borderRadius: 12, padding: '10px 28px', color: '#fff', fontWeight: 600, cursor: 'pointer', fontSize: 14 }}>
          Quitter
        </button>
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: .6; }
        }
      `}</style>
    </div>
  )
}

function CtrlBtn({ active, onClick, label }) {
  return (
    <button onClick={onClick} style={{
      minWidth: 48, height: 48, borderRadius: 12, border: 'none', cursor: 'pointer',
      fontSize: 13, fontWeight: 600, padding: '0 14px',
      background: active ? '#334155' : '#ef4444',
      color: '#fff', transition: 'background .15s',
    }}>
      {label}
    </button>
  )
}
