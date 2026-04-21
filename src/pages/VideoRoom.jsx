import { useEffect, useRef, useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import api from '../api/client'
import useAuthStore from '../store/authStore'

/* ─────────────────────────────────────────────
   CONSTANTES DESIGN
───────────────────────────────────────────── */
const DARK = {
  bg:       '#070d1a',
  surface:  '#0e1829',
  panel:    '#131f33',
  border:   '#1e2d47',
  text:     '#e2eaf6',
  muted:    '#5a7299',
  accent:   '#3b82f6',
  green:    '#22c55e',
  red:      '#ef4444',
  orange:   '#f59e0b',
}

/* ─────────────────────────────────────────────
   COMPOSANT PRINCIPAL
───────────────────────────────────────────── */
export default function VideoRoom() {
  const { roomId } = useParams()
  const navigate   = useNavigate()
  const { user }   = useAuthStore()

  const [session,      setSession]      = useState(null)
  const [peers,        setPeers]        = useState([])
  const [myStream,     setMyStream]     = useState(null)
  const [status,       setStatus]       = useState('Connexion...')
  const [error,        setError]        = useState(null)
  const [micOn,        setMicOn]        = useState(true)
  const [camOn,        setCamOn]        = useState(true)
  const [chatMessages, setChat]         = useState([])
  const [chatInput,    setChatInput]    = useState('')
  const [showChat,     setShowChat]     = useState(false)
  const [peerReady,    setPeerReady]    = useState(false)
  const [duration,     setDuration]     = useState(0)

  /* ── Enregistrement ── */
  const [recording,    setRecording]    = useState(false)
  const [saving,       setSaving]       = useState(false)
  const [saveMsg,      setSaveMsg]      = useState({ text: '', ok: true })
  const [recordingTime, setRecordingTime] = useState(0)

  /* ── Modal choix cours/leçon ── */
  const [showSaveModal, setShowSaveModal] = useState(false)
  const [myCourses,     setMyCourses]     = useState([])
  const [saveForm,      setSaveForm]      = useState({
    course_id: '', title: '', order: 0
  })

  const mediaRecorderRef  = useRef(null)
  const recordedChunksRef = useRef([])
  const recordTimerRef    = useRef(null)
  const durationTimerRef  = useRef(null)
  const myVideoRef        = useRef()
  const peersRef          = useRef([])
  const peerObj           = useRef(null)
  const connRef           = useRef({})
  const chatRef           = useRef()

  const isTeacher = user?.role === 'teacher' || user?.role === 'admin'

  /* ── Timer durée session ── */
  useEffect(() => {
    durationTimerRef.current = setInterval(() => setDuration(d => d + 1), 1000)
    return () => clearInterval(durationTimerRef.current)
  }, [])

  /* ── Timer enregistrement ── */
  useEffect(() => {
    if (recording) {
      recordTimerRef.current = setInterval(() => setRecordingTime(t => t + 1), 1000)
    } else {
      clearInterval(recordTimerRef.current)
      setRecordingTime(0)
    }
    return () => clearInterval(recordTimerRef.current)
  }, [recording])

  const fmtTime = s => `${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`

  /* ── Init ── */
  useEffect(() => {
    const isSecure = location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1'
    if (!isSecure) { setError('https'); return }
    if (!navigator.mediaDevices?.getUserMedia) { setError('no_media'); return }

    const script = document.createElement('script')
    script.src = 'https://unpkg.com/peerjs@1.5.2/dist/peerjs.min.js'
    script.onload = () => setPeerReady(true)
    script.onerror = () => setError('peerjs')
    document.head.appendChild(script)
    return () => { cleanup(); if (document.head.contains(script)) document.head.removeChild(script) }
  }, [])

  /* ── Trouver la session + charger mes cours ── */
  useEffect(() => {
    const init = async () => {
      try {
        const coursesRes = await api.get('/courses/my')
        setMyCourses(coursesRes.data)
        for (const c of coursesRes.data) {
          const r = await api.get(`/sessions/course/${c.id}`)
          const found = r.data.find(s => s.room_id === roomId)
          if (found) {
            setSession(found)
            setSaveForm(f => ({
              ...f,
              course_id: String(found.course_id),
              title: found.title,
            }))
            return
          }
        }
      } catch {}
    }
    init()
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
        setStatus('Connecté')
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
        call.on('stream', remote => addPeer({ id: call.peer, stream: remote, name: 'Étudiant' }))
        call.on('close', () => removePeer(call.peer))
      })

      p.on('connection', conn => {
        connRef.current[conn.peer] = conn
        conn.on('data', receiveMessage)
        conn.on('close', () => removePeer(conn.peer))
      })

      p.on('error', err => {
        if (err.type === 'peer-unavailable') setStatus("En attente de l'enseignant...")
        else if (err.type === 'network') setStatus('Problème réseau...')
        else setStatus(`Erreur: ${err.message}`)
      })

    } catch (err) {
      if (err.name === 'NotAllowedError') setError('permission')
      else if (err.name === 'NotFoundError') setError('no_device')
      else setError('unknown')
    }
  }

  /* ── Enregistrement ── */
  const getSupportedMimeType = () => {
    const types = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4']
    for (const t of types) { if (MediaRecorder.isTypeSupported(t)) return t }
    return ''
  }

  const startRecording = () => {
    if (!myStream) return
    recordedChunksRef.current = []
    const mr = new MediaRecorder(myStream, { mimeType: getSupportedMimeType() })
    mr.ondataavailable = e => { if (e.data?.size > 0) recordedChunksRef.current.push(e.data) }
    mr.onstop = () => {
      // Ouvrir modal pour choisir où sauvegarder
      setShowSaveModal(true)
    }
    mr.start(1000)
    mediaRecorderRef.current = mr
    setRecording(true)
    setSaveMsg({ text: '', ok: true })
  }

  const stopRecording = () => {
    if (mediaRecorderRef.current?.state !== 'inactive') {
      mediaRecorderRef.current.stop()
    }
    setRecording(false)
  }

  const saveRecording = async () => {
    if (!recordedChunksRef.current.length) return
    if (!saveForm.course_id) {
      setSaveMsg({ text: 'Sélectionnez un cours', ok: false })
      return
    }
    if (!saveForm.title.trim()) {
      setSaveMsg({ text: 'Le titre est requis', ok: false })
      return
    }

    setSaving(true)
    setSaveMsg({ text: 'Sauvegarde en cours...', ok: true })

    try {
      const mimeType = getSupportedMimeType()
      const ext      = mimeType.includes('mp4') ? 'mp4' : 'webm'
      const blob     = new Blob(recordedChunksRef.current, { type: mimeType })
      const fileName = `${saveForm.title.replace(/\s+/g, '_')}_${Date.now()}.${ext}`
      const file     = new File([blob], fileName, { type: mimeType })

      const fd = new FormData()
      fd.append('course_id', saveForm.course_id)
      fd.append('title',     saveForm.title)
      fd.append('duration',  `${fmtTime(recordingTime)} min`)
      fd.append('order',     saveForm.order || 999)
      fd.append('file',      file)

      await api.post('/lessons/upload', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
      setSaveMsg({ text: `✓ Enregistrement sauvegardé comme leçon !`, ok: true })
      setShowSaveModal(false)
      recordedChunksRef.current = []
    } catch (err) {
      setSaveMsg({ text: 'Erreur lors de la sauvegarde', ok: false })
    } finally {
      setSaving(false)
    }
  }

  const addPeer    = ({ id, stream, name }) => {
    peersRef.current = peersRef.current.filter(p => p.id !== id)
    peersRef.current.push({ id, stream, name })
    setPeers([...peersRef.current])
  }
  const removePeer = id => {
    peersRef.current = peersRef.current.filter(p => p.id !== id)
    setPeers([...peersRef.current])
  }

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
    if (mediaRecorderRef.current?.state !== 'inactive') mediaRecorderRef.current?.stop()
    myStream?.getTracks().forEach(t => t.stop())
    try { peerObj.current?.destroy() } catch {}
  }

  const leave = async () => {
    if (recording) stopRecording()
    cleanup()
    if (isTeacher && session) {
      try { await api.post(`/sessions/${session.id}/end`) } catch {}
    }
    navigate(-1)
  }

  /* ── Erreurs ── */
  if (error) {
    const errors = {
      https:      { icon: '🔒', title: 'HTTPS requis',              msg: 'La vidéoconférence nécessite HTTPS ou localhost.' },
      permission: { icon: '📷', title: 'Accès caméra/micro refusé', msg: 'Autorisez la caméra dans les paramètres du navigateur.' },
      no_device:  { icon: '🎥', title: 'Aucune caméra détectée',    msg: 'Branchez une caméra et rechargez la page.' },
      no_media:   { icon: '🌐', title: 'Navigateur incompatible',   msg: 'Utilisez Chrome ou Firefox récent.' },
      peerjs:     { icon: '⚡', title: 'Chargement impossible',     msg: 'Vérifiez votre connexion internet.' },
      unknown:    { icon: '⚠️', title: 'Erreur inattendue',         msg: 'Rechargez la page.' },
    }
    const e = errors[error] || errors.unknown
    return (
      <div style={{ minHeight: '100dvh', background: DARK.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, fontFamily: "'DM Sans', sans-serif" }}>
        <div style={{ background: DARK.surface, borderRadius: 20, padding: '48px 40px', maxWidth: 440, width: '100%', textAlign: 'center', border: `1px solid ${DARK.border}` }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>{e.icon}</div>
          <h2 style={{ color: DARK.text, fontSize: 22, fontWeight: 700, marginBottom: 8, fontFamily: "'Playfair Display', serif" }}>{e.title}</h2>
          <p style={{ color: DARK.muted, fontSize: 14, marginBottom: 32, lineHeight: 1.6 }}>{e.msg}</p>
          <button onClick={() => navigate(-1)} style={{ background: DARK.accent, border: 'none', borderRadius: 12, padding: '12px 32px', color: '#fff', fontWeight: 700, cursor: 'pointer', fontSize: 15, letterSpacing: .3 }}>
            ← Retour
          </button>
        </div>
      </div>
    )
  }

  const selectedCourse = myCourses.find(c => String(c.id) === String(saveForm.course_id))

  /* ── Interface principale ── */
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100dvh', background: DARK.bg, fontFamily: "'DM Sans', sans-serif" }}>

      {/* ── Topbar ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 20px', background: DARK.surface, borderBottom: `1px solid ${DARK.border}`, flexWrap: 'wrap' }}>
        {/* Logo / titre */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: "'Playfair Display', serif", color: DARK.text, fontSize: 15, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {session?.title || 'Cours en ligne'}
          </div>
          <div style={{ fontSize: 11, color: DARK.muted, marginTop: 1 }}>
            {fmtTime(duration)} · {peers.length + 1} participant{peers.length !== 0 ? 's' : ''}
          </div>
        </div>

        {/* Statut connexion */}
        <StatusPill color={status === 'Connecté' ? DARK.green : DARK.orange} label={status} />

        {/* Indicateur enregistrement */}
        {recording && (
          <StatusPill color={DARK.red} label={`⏺ ${fmtTime(recordingTime)}`} pulse />
        )}

        {/* Message sauvegarde */}
        {saveMsg.text && !recording && (
          <StatusPill color={saveMsg.ok ? DARK.green : DARK.red} label={saveMsg.text} />
        )}
      </div>

      {/* ── Grille vidéo ── */}
      <div style={{
        flex: 1, display: 'grid', padding: 12, gap: 10, overflow: 'hidden',
        gridTemplateColumns: peers.length === 0 ? '1fr'
          : peers.length === 1 ? '1fr 1fr'
          : peers.length <= 3 ? 'repeat(2, 1fr)'
          : 'repeat(3, 1fr)',
        gridTemplateRows: peers.length > 3 ? 'repeat(2, 1fr)' : '1fr',
      }}>

        {/* Ma vidéo */}
        <VideoTile
          videoRef={myVideoRef}
          label={`${user?.name} (Vous)${isTeacher ? ' · Enseignant' : ''}`}
          muted
          camOn={camOn}
          initials={user?.name?.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}
          isMe
        />

        {/* Pairs */}
        {peers.map(p => (
          <VideoTile
            key={p.id}
            stream={p.stream}
            label={p.name}
            camOn
          />
        ))}
      </div>

      {/* ── Chat ── */}
      {showChat && (
        <div style={{
          position: 'fixed', right: 16, bottom: 100, width: 320, height: 380,
          background: DARK.surface, borderRadius: 16, border: `1px solid ${DARK.border}`,
          display: 'flex', flexDirection: 'column', overflow: 'hidden', zIndex: 20,
          boxShadow: '0 20px 60px rgba(0,0,0,.5)',
        }}>
          <div style={{ padding: '12px 16px', borderBottom: `1px solid ${DARK.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 13, color: DARK.text, fontWeight: 700 }}>💬 Chat</span>
            <button onClick={() => setShowChat(false)} style={{ background: 'none', border: 'none', color: DARK.muted, cursor: 'pointer', fontSize: 18, lineHeight: 1 }}>×</button>
          </div>
          <div ref={chatRef} style={{ flex: 1, overflowY: 'auto', padding: '12px 14px' }}>
            {chatMessages.length === 0
              ? <div style={{ color: DARK.muted, fontSize: 12, textAlign: 'center', marginTop: 32 }}>Aucun message pour l'instant</div>
              : chatMessages.map((m, i) => (
                <div key={i} style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 10, color: DARK.muted, marginBottom: 2 }}>{m.from} · {m.at}</div>
                  <div style={{ fontSize: 13, color: DARK.text, background: DARK.panel, borderRadius: 8, padding: '6px 10px', lineHeight: 1.5 }}>{m.text}</div>
                </div>
              ))}
          </div>
          <div style={{ display: 'flex', padding: 10, gap: 6, borderTop: `1px solid ${DARK.border}` }}>
            <input
              style={{ flex: 1, background: DARK.panel, border: `1px solid ${DARK.border}`, borderRadius: 10, padding: '8px 12px', color: DARK.text, fontSize: 13, outline: 'none' }}
              placeholder="Votre message..."
              value={chatInput}
              onChange={e => setChatInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && sendMessage()}
            />
            <button onClick={sendMessage} style={{ background: DARK.accent, border: 'none', borderRadius: 10, padding: '8px 14px', color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
              →
            </button>
          </div>
        </div>
      )}

      {/* ── Modal sauvegarde enregistrement ── */}
      {showSaveModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: 20 }}>
          <div style={{ background: DARK.surface, borderRadius: 20, padding: 32, maxWidth: 480, width: '100%', border: `1px solid ${DARK.border}`, boxShadow: '0 40px 100px rgba(0,0,0,.6)' }}>
            <h3 style={{ color: DARK.text, fontSize: 18, fontWeight: 700, marginBottom: 6, fontFamily: "'Playfair Display', serif" }}>
              💾 Sauvegarder l'enregistrement
            </h3>
            <p style={{ color: DARK.muted, fontSize: 13, marginBottom: 24 }}>
              Choisissez le cours où ajouter cette leçon vidéo.
            </p>

            {/* Sélection cours */}
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 12, color: DARK.muted, marginBottom: 6, textTransform: 'uppercase', letterSpacing: .5 }}>Cours *</label>
              <select
                value={saveForm.course_id}
                onChange={e => setSaveForm(f => ({ ...f, course_id: e.target.value }))}
                style={{ width: '100%', background: DARK.panel, border: `1px solid ${DARK.border}`, borderRadius: 10, padding: '10px 14px', color: DARK.text, fontSize: 14, outline: 'none', cursor: 'pointer' }}
              >
                <option value="">-- Choisir un cours --</option>
                {myCourses.map(c => (
                  <option key={c.id} value={c.id}>{c.title}</option>
                ))}
              </select>
            </div>

            {/* Titre de la leçon */}
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 12, color: DARK.muted, marginBottom: 6, textTransform: 'uppercase', letterSpacing: .5 }}>Titre de la leçon *</label>
              <input
                value={saveForm.title}
                onChange={e => setSaveForm(f => ({ ...f, title: e.target.value }))}
                placeholder="Ex : Cours du 15 avril — Introduction"
                style={{ width: '100%', background: DARK.panel, border: `1px solid ${DARK.border}`, borderRadius: 10, padding: '10px 14px', color: DARK.text, fontSize: 14, outline: 'none', boxSizing: 'border-box' }}
              />
            </div>

            {/* Ordre */}
            <div style={{ marginBottom: 24 }}>
              <label style={{ display: 'block', fontSize: 12, color: DARK.muted, marginBottom: 6, textTransform: 'uppercase', letterSpacing: .5 }}>Position dans le cours</label>
              <input
                type="number" min={0}
                value={saveForm.order}
                onChange={e => setSaveForm(f => ({ ...f, order: parseInt(e.target.value) || 0 }))}
                placeholder="0 = début, 999 = fin"
                style={{ width: '100%', background: DARK.panel, border: `1px solid ${DARK.border}`, borderRadius: 10, padding: '10px 14px', color: DARK.text, fontSize: 14, outline: 'none', boxSizing: 'border-box' }}
              />
            </div>

            {/* Message erreur */}
            {saveMsg.text && (
              <div style={{ padding: '10px 14px', borderRadius: 10, background: saveMsg.ok ? '#14532d22' : '#7f1d1d22', border: `1px solid ${saveMsg.ok ? DARK.green : DARK.red}`, color: saveMsg.ok ? DARK.green : DARK.red, fontSize: 13, marginBottom: 20 }}>
                {saveMsg.text}
              </div>
            )}

            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={() => { setShowSaveModal(false); recordedChunksRef.current = [] }}
                style={{ flex: 1, background: DARK.panel, border: `1px solid ${DARK.border}`, borderRadius: 12, padding: '12px', color: DARK.muted, cursor: 'pointer', fontSize: 14, fontWeight: 600 }}
              >
                Annuler
              </button>
              <button
                onClick={saveRecording}
                disabled={saving}
                style={{ flex: 2, background: saving ? DARK.muted : DARK.accent, border: 'none', borderRadius: 12, padding: '12px', color: '#fff', cursor: saving ? 'wait' : 'pointer', fontSize: 14, fontWeight: 700 }}
              >
                {saving ? 'Sauvegarde...' : '💾 Sauvegarder comme leçon'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Barre de contrôle ── */}
      <div style={{
        display: 'flex', justifyContent: 'center', alignItems: 'center',
        gap: 10, padding: '14px 20px',
        background: DARK.surface, borderTop: `1px solid ${DARK.border}`,
        flexWrap: 'wrap',
      }}>
        {/* Micro */}
        <CtrlBtn
          active={micOn}
          onClick={toggleMic}
          icon={micOn ? '🎤' : '🔇'}
          label={micOn ? 'Micro' : 'Muet'}
          color={micOn ? DARK.panel : DARK.red}
        />

        {/* Caméra */}
        <CtrlBtn
          active={camOn}
          onClick={toggleCam}
          icon={camOn ? '📷' : '🚫'}
          label={camOn ? 'Caméra' : 'Caméra OFF'}
          color={camOn ? DARK.panel : DARK.red}
        />

        {/* Chat */}
        <CtrlBtn
          active={showChat}
          onClick={() => setShowChat(v => !v)}
          icon="💬"
          label="Chat"
          color={showChat ? DARK.accent : DARK.panel}
          badge={chatMessages.length > 0 ? chatMessages.length : null}
        />

        {/* Séparateur */}
        {isTeacher && <div style={{ width: 1, height: 36, background: DARK.border, margin: '0 4px' }} />}

        {/* Enregistrement — enseignant seulement */}
        {isTeacher && !recording && (
          <button onClick={startRecording} disabled={saving} style={{
            background: 'linear-gradient(135deg, #16a34a, #15803d)',
            border: 'none', borderRadius: 12, padding: '10px 22px',
            color: '#fff', fontWeight: 700, cursor: 'pointer', fontSize: 14,
            display: 'flex', alignItems: 'center', gap: 8,
            boxShadow: '0 4px 14px rgba(22,163,74,.4)',
          }}>
            <span style={{ fontSize: 16 }}>⏺</span> Enregistrer
          </button>
        )}

        {isTeacher && recording && (
          <button onClick={stopRecording} style={{
            background: 'linear-gradient(135deg, #dc2626, #b91c1c)',
            border: 'none', borderRadius: 12, padding: '10px 22px',
            color: '#fff', fontWeight: 700, cursor: 'pointer', fontSize: 14,
            display: 'flex', alignItems: 'center', gap: 8,
            boxShadow: '0 4px 14px rgba(220,38,38,.4)',
            animation: 'recPulse 1.5s ease-in-out infinite',
          }}>
            <span style={{ fontSize: 16 }}>⏹</span> Arrêter — {fmtTime(recordingTime)}
          </button>
        )}

        {/* Quitter */}
        <button onClick={leave} style={{
          background: 'linear-gradient(135deg, #ef4444, #dc2626)',
          border: 'none', borderRadius: 12, padding: '10px 24px',
          color: '#fff', fontWeight: 700, cursor: 'pointer', fontSize: 14,
          boxShadow: '0 4px 14px rgba(239,68,68,.3)',
        }}>
          ✕ Quitter
        </button>
      </div>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Playfair+Display:wght@700&display=swap');
        @keyframes recPulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: .85; transform: scale(.98); }
        }
        @keyframes statusPulse {
          0%, 100% { opacity: 1; }
          50% { opacity: .4; }
        }
        * { box-sizing: border-box; }
        select option { background: #0e1829; color: #e2eaf6; }
        input::placeholder { color: #5a7299; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #1e2d47; border-radius: 4px; }
      `}</style>
    </div>
  )
}

/* ─────────────────────────────────────────────
   SOUS-COMPOSANTS
───────────────────────────────────────────── */

function VideoTile({ videoRef, stream, label, muted, camOn = true, initials, isMe }) {
  const localRef = useRef()
  const ref = videoRef || localRef

  useEffect(() => {
    if (!videoRef && stream && ref.current) {
      ref.current.srcObject = stream
    }
  }, [stream])

  return (
    <div style={{
      position: 'relative', background: '#0a1120',
      borderRadius: 14, overflow: 'hidden',
      border: `1px solid ${isMe ? '#3b82f633' : '#1e2d47'}`,
      boxShadow: isMe ? '0 0 0 2px #3b82f622' : 'none',
    }}>
      <video
        ref={ref}
        autoPlay playsInline
        muted={muted}
        style={{
          width: '100%', height: '100%',
          objectFit: 'cover', display: 'block',
          filter: camOn === false ? 'brightness(0)' : 'none',
          minHeight: 120,
        }}
      />
      {camOn === false && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 8 }}>
          <div style={{
            width: 56, height: 56, borderRadius: '50%',
            background: 'linear-gradient(135deg, #1e3a5f, #0e1829)',
            border: '2px solid #1e2d47',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#5a7299', fontSize: 18, fontWeight: 700,
          }}>
            {initials || '?'}
          </div>
          <span style={{ fontSize: 11, color: '#5a7299' }}>Caméra désactivée</span>
        </div>
      )}
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0,
        background: 'linear-gradient(transparent, rgba(0,0,0,.7))',
        padding: '20px 12px 8px',
      }}>
        <span style={{ fontSize: 11, color: '#e2eaf6', fontWeight: 600 }}>{label}</span>
      </div>
    </div>
  )
}

function StatusPill({ color, label, pulse }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 6,
      background: `${color}18`, border: `1px solid ${color}44`,
      borderRadius: 20, padding: '4px 12px',
    }}>
      <div style={{
        width: 6, height: 6, borderRadius: '50%', background: color, flexShrink: 0,
        animation: pulse ? 'statusPulse 1s ease-in-out infinite' : 'none',
      }} />
      <span style={{ fontSize: 12, color, fontWeight: 600, whiteSpace: 'nowrap' }}>{label}</span>
    </div>
  )
}

function CtrlBtn({ active, onClick, icon, label, color, badge }) {
  return (
    <button onClick={onClick} style={{
      position: 'relative',
      background: color || '#131f33',
      border: '1px solid #1e2d47',
      borderRadius: 12, padding: '8px 16px',
      color: '#e2eaf6', cursor: 'pointer',
      display: 'flex', alignItems: 'center', gap: 6,
      fontSize: 13, fontWeight: 600,
      transition: 'all .15s',
    }}>
      <span style={{ fontSize: 16 }}>{icon}</span>
      <span style={{ fontSize: 13 }}>{label}</span>
      {badge && (
        <span style={{
          position: 'absolute', top: -4, right: -4,
          background: '#ef4444', color: '#fff',
          borderRadius: '50%', width: 16, height: 16,
          fontSize: 10, fontWeight: 700,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>{badge > 9 ? '9+' : badge}</span>
      )}
    </button>
  )
}
