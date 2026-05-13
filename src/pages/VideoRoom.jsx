import { useEffect, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import api from '../api/client'
import useAuthStore from '../store/authStore'

const DARK = {
  bg: '#070d1a',
  surface: '#0e1829',
  panel: '#131f33',
  border: '#1e2d47',
  text: '#e2eaf6',
  muted: '#5a7299',
  accent: '#3b82f6',
  green: '#22c55e',
  red: '#ef4444',
  orange: '#f59e0b',
}

export default function VideoRoom() {
  const { roomId } = useParams()
  const navigate = useNavigate()
  const { user } = useAuthStore()

  const [session, setSession] = useState(null)
  const [peers, setPeers] = useState([])
  const [myStream, setMyStream] = useState(null)
  const [status, setStatus] = useState('Connexion...')
  const [error, setError] = useState(null)

  const [micOn, setMicOn] = useState(true)
  const [camOn, setCamOn] = useState(true)

  const [chatMessages, setChatMessages] = useState([])
  const [chatInput, setChatInput] = useState('')
  const [showChat, setShowChat] = useState(false)

  const [duration, setDuration] = useState(0)
  const [recording, setRecording] = useState(false)
  const [recordingTime, setRecordingTime] = useState(0)
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState({ text: '', ok: true })

  const [showSaveModal, setShowSaveModal] = useState(false)
  const [myCourses, setMyCourses] = useState([])
  const [saveForm, setSaveForm] = useState({
    course_id: '',
    title: '',
    order: 0,
  })

  const isTeacher = user?.role === 'teacher' || user?.role === 'admin'

  const myVideoRef = useRef(null)
  const chatRef = useRef(null)

  const peerObjRef = useRef(null)
  const localStreamRef = useRef(null)
  const peersRef = useRef([])
  const connRef = useRef({})
  const callsRef = useRef({})

  const mediaRecorderRef = useRef(null)
  const recordedChunksRef = useRef([])
  const recordingStartedAtRef = useRef(null)
  const lastRecordingDurationRef = useRef(0)

  const meetingCanvasRef = useRef(null)
  const recordingAnimationRef = useRef(null)
  const mixedStreamRef = useRef(null)
  const audioContextRef = useRef(null)
  const audioDestinationRef = useRef(null)
  const recordedAudioIdsRef = useRef(new Set())

  const durationTimerRef = useRef(null)
  const recordingTimerRef = useRef(null)

  const fmtTime = seconds => {
    const s = Math.max(0, Number(seconds) || 0)
    return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
  }

  useEffect(() => {
    durationTimerRef.current = setInterval(() => {
      setDuration(value => value + 1)
    }, 1000)

    return () => clearInterval(durationTimerRef.current)
  }, [])

  useEffect(() => {
    if (!recording) {
      clearInterval(recordingTimerRef.current)
      return
    }

    recordingTimerRef.current = setInterval(() => {
      setRecordingTime(value => value + 1)
    }, 1000)

    return () => clearInterval(recordingTimerRef.current)
  }, [recording])

  useEffect(() => {
    const loadSession = async () => {
      try {
        const coursesRes = await api.get('/courses/my')
        setMyCourses(coursesRes.data || [])

        for (const course of coursesRes.data || []) {
          const sessionsRes = await api.get(`/sessions/course/${course.id}`)
          const found = sessionsRes.data?.find(item => item.room_id === roomId)

          if (found) {
            setSession(found)
            setSaveForm(prev => ({
              ...prev,
              course_id: String(found.course_id),
              title: found.title || 'Cours enregistré',
            }))
            return
          }
        }
      } catch {
        setSaveMsg({
          text: "Impossible de charger les informations de la session.",
          ok: false,
        })
      }
    }

    loadSession()
  }, [roomId])

  useEffect(() => {
    const isSecure =
      window.location.protocol === 'https:' ||
      window.location.hostname === 'localhost' ||
      window.location.hostname === '127.0.0.1'

    if (!isSecure) {
      setError('https')
      return
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      setError('no_media')
      return
    }

    const script = document.createElement('script')
    script.src = 'https://unpkg.com/peerjs@1.5.2/dist/peerjs.min.js'
    script.onload = initPeer
    script.onerror = () => setError('peerjs')

    document.head.appendChild(script)

    return () => {
      cleanup()
      if (document.head.contains(script)) {
        document.head.removeChild(script)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const initPeer = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      })

      localStreamRef.current = stream
      setMyStream(stream)

      if (myVideoRef.current) {
        myVideoRef.current.srcObject = stream
        myVideoRef.current.muted = true
      }

      const peerId = isTeacher
        ? `teacher_${roomId}`
        : `student_${roomId}_${user?.id || 'guest'}_${Date.now()}`

      const peer = new window.Peer(peerId, {
        host: '0.peerjs.com',
        port: 443,
        path: '/',
        secure: true,
        config: {
          iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
          ],
        },
      })

      peerObjRef.current = peer

      peer.on('open', () => {
        setStatus('Connecté')

        if (!isTeacher) {
          setTimeout(() => {
            connectToPeer(`teacher_${roomId}`, 'Enseignant')
          }, 1000)
        }
      })

      peer.on('call', call => {
        callsRef.current[call.peer] = call
        call.answer(stream)

        call.on('stream', remoteStream => {
          addPeer({
            id: call.peer,
            stream: remoteStream,
            name: getPeerName(call.peer, call.metadata?.name),
          })

          if (isTeacher) {
            setTimeout(broadcastPeerList, 300)
          }
        })

        call.on('close', () => {
          removePeer(call.peer)
          delete callsRef.current[call.peer]
          if (isTeacher) broadcastPeerList()
        })

        call.on('error', () => {
          removePeer(call.peer)
          delete callsRef.current[call.peer]
          if (isTeacher) broadcastPeerList()
        })
      })

      peer.on('connection', setupConnection)

      peer.on('error', err => {
        if (err.type === 'peer-unavailable') {
          setStatus("En attente de l'enseignant...")
        } else if (err.type === 'network') {
          setStatus('Problème réseau...')
        } else {
          setStatus(`Erreur : ${err.message}`)
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

  const getPeerName = (peerId, fallback) => {
    if (fallback) return fallback
    if (peerId?.startsWith('teacher_')) return 'Enseignant'
    return 'Étudiant'
  }

  const setupConnection = conn => {
    connRef.current[conn.peer] = conn

    conn.on('open', () => {
      if (isTeacher) broadcastPeerList()
    })

    conn.on('data', receiveMessage)

    conn.on('close', () => {
      removePeer(conn.peer)
      delete connRef.current[conn.peer]
      if (isTeacher) broadcastPeerList()
    })

    conn.on('error', () => {
      delete connRef.current[conn.peer]
    })
  }

  const connectToPeer = (peerId, name) => {
    if (!peerId || !peerObjRef.current || !localStreamRef.current) return
    if (peerId === peerObjRef.current.id) return
    if (callsRef.current[peerId]) return

    const call = peerObjRef.current.call(peerId, localStreamRef.current, {
      metadata: {
        name: user?.name || 'Participant',
      },
    })

    if (call) {
      callsRef.current[peerId] = call

      call.on('stream', remoteStream => {
        addPeer({
          id: peerId,
          stream: remoteStream,
          name: getPeerName(peerId, name),
        })
      })

      call.on('close', () => {
        removePeer(peerId)
        delete callsRef.current[peerId]
      })

      call.on('error', () => {
        delete callsRef.current[peerId]
        setStatus(
          peerId.startsWith('teacher_')
            ? "En attente de l'enseignant..."
            : 'Participant indisponible'
        )
      })
    }

    if (!connRef.current[peerId]) {
      const conn = peerObjRef.current.connect(peerId, {
        metadata: {
          name: user?.name || 'Participant',
        },
      })

      if (conn) setupConnection(conn)
    }
  }

  const broadcastPeerList = () => {
    if (!isTeacher || !peerObjRef.current?.id) return

    const participants = [
      {
        id: peerObjRef.current.id,
        name: user?.name || 'Enseignant',
      },
      ...peersRef.current.map(peer => ({
        id: peer.id,
        name: peer.name || 'Participant',
      })),
    ]

    Object.values(connRef.current).forEach(conn => {
      try {
        conn.send({
          type: 'peer-list',
          participants,
        })
      } catch {}
    })
  }

  const addPeer = ({ id, stream, name }) => {
    peersRef.current = peersRef.current.filter(peer => peer.id !== id)
    peersRef.current.push({ id, stream, name })

    addStreamToRecordingAudio(id, stream)
    setPeers([...peersRef.current])
  }

  const removePeer = id => {
    peersRef.current = peersRef.current.filter(peer => peer.id !== id)
    setPeers([...peersRef.current])
  }

  const receiveMessage = data => {
    if (data?.type === 'peer-list') {
      data.participants
        ?.filter(participant => participant.id !== peerObjRef.current?.id)
        .forEach(participant => {
          connectToPeer(participant.id, participant.name)
        })

      return
    }

    const message = data?.type === 'chat' ? data.message : data
    if (!message?.text) return

    setChatMessages(prev => [...prev, message])

    setTimeout(() => {
      if (chatRef.current) {
        chatRef.current.scrollTop = chatRef.current.scrollHeight
      }
    }, 100)
  }

  const sendMessage = () => {
    if (!chatInput.trim()) return

    const message = {
      from: user?.name || 'Moi',
      text: chatInput.trim(),
      at: new Date().toLocaleTimeString(),
    }

    Object.values(connRef.current).forEach(conn => {
      try {
        conn.send({
          type: 'chat',
          message,
        })
      } catch {}
    })

    receiveMessage(message)
    setChatInput('')
  }

  const getSupportedMimeType = () => {
    const types = [
      'video/webm;codecs=vp9,opus',
      'video/webm;codecs=vp8,opus',
      'video/webm',
      'video/mp4',
    ]

    for (const type of types) {
      if (window.MediaRecorder?.isTypeSupported(type)) return type
    }

    return ''
  }

  const makeVideoElement = stream => {
    const video = document.createElement('video')
    video.srcObject = stream
    video.muted = true
    video.playsInline = true
    video.autoplay = true
    video.play().catch(() => {})
    return video
  }

  const cleanupRecordingStreams = () => {
    if (recordingAnimationRef.current) {
      cancelAnimationFrame(recordingAnimationRef.current)
    }

    recordingAnimationRef.current = null

    mixedStreamRef.current?.getTracks().forEach(track => track.stop())
    mixedStreamRef.current = null

    if (audioContextRef.current?.state !== 'closed') {
      audioContextRef.current?.close().catch(() => {})
    }

    audioContextRef.current = null
    audioDestinationRef.current = null
    recordedAudioIdsRef.current = new Set()
  }

  const addStreamToRecordingAudio = (id, stream) => {
    if (!id) return
    if (!stream?.getAudioTracks().length) return
    if (!audioContextRef.current || !audioDestinationRef.current) return
    if (recordedAudioIdsRef.current.has(id)) return

    try {
      const source = audioContextRef.current.createMediaStreamSource(stream)
      source.connect(audioDestinationRef.current)
      recordedAudioIdsRef.current.add(id)
    } catch {}
  }

  const createMeetingRecordingStream = () => {
    const canvas = document.createElement('canvas')
    canvas.width = 1280
    canvas.height = 720

    meetingCanvasRef.current = canvas

    const ctx = canvas.getContext('2d')
    const videoElements = new Map()

    const getVideo = (id, stream) => {
      if (!videoElements.has(id)) {
        videoElements.set(id, makeVideoElement(stream))
      }

      return videoElements.get(id)
    }

    const drawAvatar = (x, y, width, height, label) => {
      ctx.fillStyle = '#0a1120'
      ctx.fillRect(x, y, width, height)

      ctx.fillStyle = '#1e3a5f'
      ctx.beginPath()
      ctx.arc(
        x + width / 2,
        y + height / 2 - 18,
        Math.min(width, height) * 0.12,
        0,
        Math.PI * 2
      )
      ctx.fill()

      ctx.fillStyle = '#e2eaf6'
      ctx.font = '700 28px sans-serif'
      ctx.textAlign = 'center'

      const initials = (label || '?')
        .split(' ')
        .map(part => part[0])
        .join('')
        .slice(0, 2)
        .toUpperCase()

      ctx.fillText(initials, x + width / 2, y + height / 2 - 8)
    }

    const draw = () => {
      const tiles = [
        {
          id: 'me',
          stream: localStreamRef.current,
          label: `${user?.name || 'Vous'} (Vous)`,
        },
        ...peersRef.current.map(peer => ({
          id: peer.id,
          stream: peer.stream,
          label: peer.name || 'Participant',
        })),
      ].filter(tile => tile.stream)

      ctx.fillStyle = DARK.bg
      ctx.fillRect(0, 0, canvas.width, canvas.height)

      const count = Math.max(tiles.length, 1)
      const cols = count <= 1 ? 1 : count <= 4 ? 2 : 3
      const rows = Math.ceil(count / cols)
      const gap = 12

      const tileWidth = (canvas.width - gap * (cols + 1)) / cols
      const tileHeight = (canvas.height - gap * (rows + 1)) / rows

      tiles.forEach((tile, index) => {
        const col = index % cols
        const row = Math.floor(index / cols)

        const x = gap + col * (tileWidth + gap)
        const y = gap + row * (tileHeight + gap)

        const video = getVideo(tile.id, tile.stream)

        ctx.fillStyle = '#0a1120'
        ctx.fillRect(x, y, tileWidth, tileHeight)

        if (video.readyState >= 2 && video.videoWidth > 0) {
          const scale = Math.max(
            tileWidth / video.videoWidth,
            tileHeight / video.videoHeight
          )

          const sourceWidth = tileWidth / scale
          const sourceHeight = tileHeight / scale
          const sourceX = (video.videoWidth - sourceWidth) / 2
          const sourceY = (video.videoHeight - sourceHeight) / 2

          ctx.drawImage(
            video,
            sourceX,
            sourceY,
            sourceWidth,
            sourceHeight,
            x,
            y,
            tileWidth,
            tileHeight
          )
        } else {
          drawAvatar(x, y, tileWidth, tileHeight, tile.label)
        }

        const gradient = ctx.createLinearGradient(
          0,
          y + tileHeight - 70,
          0,
          y + tileHeight
        )

        gradient.addColorStop(0, 'rgba(0,0,0,0)')
        gradient.addColorStop(1, 'rgba(0,0,0,.75)')

        ctx.fillStyle = gradient
        ctx.fillRect(x, y + tileHeight - 70, tileWidth, 70)

        ctx.fillStyle = '#e2eaf6'
        ctx.font = '600 18px sans-serif'
        ctx.textAlign = 'left'
        ctx.fillText(tile.label, x + 18, y + tileHeight - 20)
      })

      recordingAnimationRef.current = requestAnimationFrame(draw)
    }

    draw()

    const canvasStream = canvas.captureStream(30)

    const audioContext = new AudioContext()
    const destination = audioContext.createMediaStreamDestination()

    audioContextRef.current = audioContext
    audioDestinationRef.current = destination
    recordedAudioIdsRef.current = new Set()

    addStreamToRecordingAudio('me', localStreamRef.current)
    peersRef.current.forEach(peer => {
      addStreamToRecordingAudio(peer.id, peer.stream)
    })

    const mixedStream = new MediaStream([
      ...canvasStream.getVideoTracks(),
      ...destination.stream.getAudioTracks(),
    ])

    mixedStreamRef.current = mixedStream
    return mixedStream
  }

  const startRecording = () => {
    if (!myStream) return

    cleanupRecordingStreams()

    recordedChunksRef.current = []
    lastRecordingDurationRef.current = 0
    setRecordingTime(0)

    const streamToRecord = createMeetingRecordingStream()
    const mimeType = getSupportedMimeType()
    const options = mimeType ? { mimeType } : undefined

    const recorder = new MediaRecorder(streamToRecord, options)

    recorder.ondataavailable = event => {
      if (event.data?.size > 0) {
        recordedChunksRef.current.push(event.data)
      }
    }

    recorder.onstop = () => {
      lastRecordingDurationRef.current = Math.max(
        1,
        Math.round((Date.now() - recordingStartedAtRef.current) / 1000)
      )

      cleanupRecordingStreams()
      setShowSaveModal(true)
    }

    recorder.start(1000)

    recordingStartedAtRef.current = Date.now()
    mediaRecorderRef.current = recorder

    setRecording(true)
    setSaveMsg({ text: '', ok: true })
  }

  const stopRecording = () => {
    if (recordingStartedAtRef.current) {
      lastRecordingDurationRef.current = Math.max(
        1,
        Math.round((Date.now() - recordingStartedAtRef.current) / 1000)
      )
    }

    if (mediaRecorderRef.current?.state !== 'inactive') {
      mediaRecorderRef.current.stop()
    } else {
      cleanupRecordingStreams()
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
      const ext = mimeType.includes('mp4') ? 'mp4' : 'webm'

      const blob = new Blob(recordedChunksRef.current, {
        type: mimeType || 'video/webm',
      })

      const safeTitle = saveForm.title
        .trim()
        .replace(/[^\w-]+/g, '_')
        .replace(/_+/g, '_')

      const file = new File(
        [blob],
        `${safeTitle || 'cours_enregistre'}_${Date.now()}.${ext}`,
        { type: mimeType || 'video/webm' }
      )

      const formData = new FormData()
      formData.append('course_id', saveForm.course_id)
      formData.append('title', saveForm.title)
      formData.append(
        'duration',
        fmtTime(lastRecordingDurationRef.current || recordingTime)
      )
      formData.append('order', saveForm.order || 999)
      formData.append('file', file)

      await api.post('/lessons/upload', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      })

      setSaveMsg({
        text: '✓ Enregistrement sauvegardé comme leçon !',
        ok: true,
      })

      setShowSaveModal(false)
      recordedChunksRef.current = []
    } catch {
      setSaveMsg({
        text: 'Erreur lors de la sauvegarde',
        ok: false,
      })
    } finally {
      setSaving(false)
    }
  }

  const toggleMic = () => {
    if (!myStream) return

    myStream.getAudioTracks().forEach(track => {
      track.enabled = !track.enabled
    })

    setMicOn(value => !value)
  }

  const toggleCam = () => {
    if (!myStream) return

    myStream.getVideoTracks().forEach(track => {
      track.enabled = !track.enabled
    })

    setCamOn(value => !value)
  }

  const cleanup = () => {
    if (mediaRecorderRef.current?.state !== 'inactive') {
      mediaRecorderRef.current?.stop()
    }

    cleanupRecordingStreams()

    Object.values(callsRef.current).forEach(call => {
      try {
        call.close()
      } catch {}
    })

    Object.values(connRef.current).forEach(conn => {
      try {
        conn.close()
      } catch {}
    })

    localStreamRef.current?.getTracks().forEach(track => track.stop())
    myStream?.getTracks().forEach(track => track.stop())

    try {
      peerObjRef.current?.destroy()
    } catch {}
  }

  const leave = async () => {
    if (recording) stopRecording()

    cleanup()

    if (isTeacher && session) {
      try {
        await api.post(`/sessions/${session.id}/end`)
      } catch {}
    }

    navigate(-1)
  }

  if (error) {
    const errors = {
      https: {
        icon: '🔒',
        title: 'HTTPS requis',
        msg: 'La vidéoconférence nécessite HTTPS ou localhost.',
      },
      permission: {
        icon: '📷',
        title: 'Accès caméra/micro refusé',
        msg: 'Autorisez la caméra et le micro dans les paramètres du navigateur.',
      },
      no_device: {
        icon: '🎥',
        title: 'Aucune caméra détectée',
        msg: 'Branchez une caméra et rechargez la page.',
      },
      no_media: {
        icon: '🌐',
        title: 'Navigateur incompatible',
        msg: 'Utilisez une version récente de Chrome, Edge ou Firefox.',
      },
      peerjs: {
        icon: '⚡',
        title: 'Chargement impossible',
        msg: 'Impossible de charger PeerJS. Vérifiez votre connexion internet.',
      },
      unknown: {
        icon: '⚠️',
        title: 'Erreur inattendue',
        msg: 'Rechargez la page et réessayez.',
      },
    }

    const currentError = errors[error] || errors.unknown

    return (
      <div style={{
        minHeight: '100dvh',
        background: DARK.bg,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        fontFamily: "'DM Sans', sans-serif",
      }}>
        <div style={{
          background: DARK.surface,
          borderRadius: 20,
          padding: '48px 40px',
          maxWidth: 440,
          width: '100%',
          textAlign: 'center',
          border: `1px solid ${DARK.border}`,
        }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>
            {currentError.icon}
          </div>

          <h2 style={{
            color: DARK.text,
            fontSize: 22,
            fontWeight: 700,
            marginBottom: 8,
          }}>
            {currentError.title}
          </h2>

          <p style={{
            color: DARK.muted,
            fontSize: 14,
            marginBottom: 32,
            lineHeight: 1.6,
          }}>
            {currentError.msg}
          </p>

          <button onClick={() => navigate(-1)} style={{
            background: DARK.accent,
            border: 'none',
            borderRadius: 12,
            padding: '12px 32px',
            color: '#fff',
            fontWeight: 700,
            cursor: 'pointer',
            fontSize: 15,
          }}>
            ← Retour
          </button>
        </div>
      </div>
    )
  }

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100dvh',
      background: DARK.bg,
      fontFamily: "'DM Sans', sans-serif",
    }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '10px 20px',
        background: DARK.surface,
        borderBottom: `1px solid ${DARK.border}`,
        flexWrap: 'wrap',
      }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            color: DARK.text,
            fontSize: 15,
            fontWeight: 700,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}>
            {session?.title || 'Cours en ligne'}
          </div>

          <div style={{
            fontSize: 11,
            color: DARK.muted,
            marginTop: 1,
          }}>
            {fmtTime(duration)} · {peers.length + 1} participant
            {peers.length !== 0 ? 's' : ''}
          </div>
        </div>

        <StatusPill
          color={status === 'Connecté' ? DARK.green : DARK.orange}
          label={status}
        />

        {recording && (
          <StatusPill
            color={DARK.red}
            label={`⏺ ${fmtTime(recordingTime)}`}
            pulse
          />
        )}

        {saveMsg.text && !recording && (
          <StatusPill
            color={saveMsg.ok ? DARK.green : DARK.red}
            label={saveMsg.text}
          />
        )}
      </div>

      <div style={{
        flex: 1,
        display: 'grid',
        padding: 12,
        gap: 10,
        overflow: 'hidden',
        gridTemplateColumns:
          peers.length === 0
            ? '1fr'
            : peers.length === 1
              ? '1fr 1fr'
              : peers.length <= 3
                ? 'repeat(2, 1fr)'
                : 'repeat(3, 1fr)',
        gridTemplateRows: peers.length > 3 ? 'repeat(2, 1fr)' : '1fr',
      }}>
        <VideoTile
          videoRef={myVideoRef}
          label={`${user?.name || 'Vous'} (Vous)${isTeacher ? ' · Enseignant' : ''}`}
          muted
          camOn={camOn}
          initials={user?.name
            ?.split(' ')
            .map(word => word[0])
            .join('')
            .slice(0, 2)
            .toUpperCase()}
          isMe
        />

        {peers.map(peer => (
          <VideoTile
            key={peer.id}
            stream={peer.stream}
            label={peer.name}
            camOn
          />
        ))}
      </div>

      {showChat && (
        <div style={{
          position: 'fixed',
          right: 16,
          bottom: 100,
          width: 320,
          height: 380,
          background: DARK.surface,
          borderRadius: 16,
          border: `1px solid ${DARK.border}`,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          zIndex: 20,
          boxShadow: '0 20px 60px rgba(0,0,0,.5)',
        }}>
          <div style={{
            padding: '12px 16px',
            borderBottom: `1px solid ${DARK.border}`,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}>
            <span style={{
              fontSize: 13,
              color: DARK.text,
              fontWeight: 700,
            }}>
              💬 Chat
            </span>

            <button onClick={() => setShowChat(false)} style={{
              background: 'none',
              border: 'none',
              color: DARK.muted,
              cursor: 'pointer',
              fontSize: 18,
              lineHeight: 1,
            }}>
              ×
            </button>
          </div>

          <div ref={chatRef} style={{
            flex: 1,
            overflowY: 'auto',
            padding: '12px 14px',
          }}>
            {chatMessages.length === 0 ? (
              <div style={{
                color: DARK.muted,
                fontSize: 12,
                textAlign: 'center',
                marginTop: 32,
              }}>
                Aucun message pour l’instant
              </div>
            ) : (
              chatMessages.map((message, index) => (
                <div key={index} style={{ marginBottom: 12 }}>
                  <div style={{
                    fontSize: 10,
                    color: DARK.muted,
                    marginBottom: 2,
                  }}>
                    {message.from} · {message.at}
                  </div>

                  <div style={{
                    fontSize: 13,
                    color: DARK.text,
                    background: DARK.panel,
                    borderRadius: 8,
                    padding: '6px 10px',
                    lineHeight: 1.5,
                  }}>
                    {message.text}
                  </div>
                </div>
              ))
            )}
          </div>

          <div style={{
            display: 'flex',
            padding: 10,
            gap: 6,
            borderTop: `1px solid ${DARK.border}`,
          }}>
            <input
              style={{
                flex: 1,
                background: DARK.panel,
                border: `1px solid ${DARK.border}`,
                borderRadius: 10,
                padding: '8px 12px',
                color: DARK.text,
                fontSize: 13,
                outline: 'none',
              }}
              placeholder="Votre message..."
              value={chatInput}
              onChange={event => setChatInput(event.target.value)}
              onKeyDown={event => {
                if (event.key === 'Enter') sendMessage()
              }}
            />

            <button onClick={sendMessage} style={{
              background: DARK.accent,
              border: 'none',
              borderRadius: 10,
              padding: '8px 14px',
              color: '#fff',
              cursor: 'pointer',
              fontSize: 13,
              fontWeight: 600,
            }}>
              →
            </button>
          </div>
        </div>
      )}

      {showSaveModal && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,.75)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 50,
          padding: 20,
        }}>
          <div style={{
            background: DARK.surface,
            borderRadius: 20,
            padding: 32,
            maxWidth: 480,
            width: '100%',
            border: `1px solid ${DARK.border}`,
            boxShadow: '0 40px 100px rgba(0,0,0,.6)',
          }}>
            <h3 style={{
              color: DARK.text,
              fontSize: 18,
              fontWeight: 700,
              marginBottom: 6,
            }}>
              Sauvegarder l’enregistrement
            </h3>

            <p style={{
              color: DARK.muted,
              fontSize: 13,
              marginBottom: 24,
              lineHeight: 1.5,
            }}>
              Choisissez le cours où conserver cette vidéo comme leçon.
            </p>

            <div style={{ marginBottom: 16 }}>
              <label style={{
                display: 'block',
                color: DARK.text,
                fontSize: 13,
                fontWeight: 600,
                marginBottom: 8,
              }}>
                Cours
              </label>

              <select
                value={saveForm.course_id}
                onChange={event => {
                  setSaveForm(prev => ({
                    ...prev,
                    course_id: event.target.value,
                  }))
                }}
                style={{
                  width: '100%',
                  background: DARK.panel,
                  border: `1px solid ${DARK.border}`,
                  borderRadius: 10,
                  padding: '10px 14px',
                  color: DARK.text,
                  fontSize: 14,
                  outline: 'none',
                }}
              >
                <option value="">Sélectionner un cours</option>
                {myCourses.map(course => (
                  <option key={course.id} value={course.id}>
                    {course.title}
                  </option>
                ))}
              </select>
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{
                display: 'block',
                color: DARK.text,
                fontSize: 13,
                fontWeight: 600,
                marginBottom: 8,
              }}>
                Titre de la leçon
              </label>

              <input
                value={saveForm.title}
                onChange={event => {
                  setSaveForm(prev => ({
                    ...prev,
                    title: event.target.value,
                  }))
                }}
                placeholder="Ex : Cours enregistré"
                style={{
                  width: '100%',
                  background: DARK.panel,
                  border: `1px solid ${DARK.border}`,
                  borderRadius: 10,
                  padding: '10px 14px',
                  color: DARK.text,
                  fontSize: 14,
                  outline: 'none',
                }}
              />
            </div>

            <div style={{ marginBottom: 20 }}>
              <label style={{
                display: 'block',
                color: DARK.text,
                fontSize: 13,
                fontWeight: 600,
                marginBottom: 8,
              }}>
                Ordre
              </label>

              <input
                type="number"
                value={saveForm.order}
                onChange={event => {
                  setSaveForm(prev => ({
                    ...prev,
                    order: Number(event.target.value),
                  }))
                }}
                style={{
                  width: '100%',
                  background: DARK.panel,
                  border: `1px solid ${DARK.border}`,
                  borderRadius: 10,
                  padding: '10px 14px',
                  color: DARK.text,
                  fontSize: 14,
                  outline: 'none',
                }}
              />
            </div>

            {saveMsg.text && (
              <div style={{
                padding: '10px 14px',
                borderRadius: 10,
                background: saveMsg.ok ? '#14532d22' : '#7f1d1d22',
                border: `1px solid ${saveMsg.ok ? DARK.green : DARK.red}`,
                color: saveMsg.ok ? DARK.green : DARK.red,
                fontSize: 13,
                marginBottom: 20,
              }}>
                {saveMsg.text}
              </div>
            )}

            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={() => {
                  setShowSaveModal(false)
                  recordedChunksRef.current = []
                }}
                style={{
                  flex: 1,
                  background: DARK.panel,
                  border: `1px solid ${DARK.border}`,
                  borderRadius: 12,
                  padding: '12px',
                  color: DARK.muted,
                  cursor: 'pointer',
                  fontSize: 14,
                  fontWeight: 600,
                }}
              >
                Annuler
              </button>

              <button
                onClick={saveRecording}
                disabled={saving}
                style={{
                  flex: 2,
                  background: saving ? DARK.muted : DARK.accent,
                  border: 'none',
                  borderRadius: 12,
                  padding: '12px',
                  color: '#fff',
                  cursor: saving ? 'wait' : 'pointer',
                  fontSize: 14,
                  fontWeight: 700,
                }}
              >
                {saving ? 'Sauvegarde...' : '💾 Sauvegarder comme leçon'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        gap: 10,
        padding: '14px 20px',
        background: DARK.surface,
        borderTop: `1px solid ${DARK.border}`,
        flexWrap: 'wrap',
      }}>
        <CtrlBtn
          onClick={toggleMic}
          icon={micOn ? '🎤' : '🔇'}
          label={micOn ? 'Micro' : 'Muet'}
          color={micOn ? DARK.panel : DARK.red}
        />

        <CtrlBtn
          onClick={toggleCam}
          icon={camOn ? '📷' : '🚫'}
          label={camOn ? 'Caméra' : 'Caméra OFF'}
          color={camOn ? DARK.panel : DARK.red}
        />

        <CtrlBtn
          onClick={() => setShowChat(value => !value)}
          icon="💬"
          label="Chat"
          color={showChat ? DARK.accent : DARK.panel}
          badge={chatMessages.length > 0 ? chatMessages.length : null}
        />

        {isTeacher && (
          <div style={{
            width: 1,
            height: 36,
            background: DARK.border,
            margin: '0 4px',
          }} />
        )}

        {isTeacher && !recording && (
          <button onClick={startRecording} disabled={saving} style={{
            background: 'linear-gradient(135deg, #16a34a, #15803d)',
            border: 'none',
            borderRadius: 12,
            padding: '10px 22px',
            color: '#fff',
            fontWeight: 700,
            cursor: 'pointer',
            fontSize: 14,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            boxShadow: '0 4px 14px rgba(22,163,74,.4)',
          }}>
            <span style={{ fontSize: 16 }}>⏺</span>
            Enregistrer
          </button>
        )}

        {isTeacher && recording && (
          <button onClick={stopRecording} style={{
            background: 'linear-gradient(135deg, #dc2626, #b91c1c)',
            border: 'none',
            borderRadius: 12,
            padding: '10px 22px',
            color: '#fff',
            fontWeight: 700,
            cursor: 'pointer',
            fontSize: 14,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            boxShadow: '0 4px 14px rgba(220,38,38,.4)',
          }}>
            <span style={{ fontSize: 16 }}>⏹</span>
            Arrêter — {fmtTime(recordingTime)}
          </button>
        )}

        <button onClick={leave} style={{
          background: 'linear-gradient(135deg, #ef4444, #dc2626)',
          border: 'none',
          borderRadius: 12,
          padding: '10px 24px',
          color: '#fff',
          fontWeight: 700,
          cursor: 'pointer',
          fontSize: 14,
          boxShadow: '0 4px 14px rgba(239,68,68,.3)',
        }}>
          ✕ Quitter
        </button>
      </div>

      <style>{`
        * {
          box-sizing: border-box;
        }

        select option {
          background: #0e1829;
          color: #e2eaf6;
        }

        input::placeholder {
          color: #5a7299;
        }

        ::-webkit-scrollbar {
          width: 4px;
        }

        ::-webkit-scrollbar-track {
          background: transparent;
        }

        ::-webkit-scrollbar-thumb {
          background: #1e2d47;
          border-radius: 4px;
        }
      `}</style>
    </div>
  )
}

function VideoTile({
  videoRef,
  stream,
  label,
  muted,
  camOn = true,
  initials,
  isMe,
}) {
  const localRef = useRef(null)
  const ref = videoRef || localRef

  useEffect(() => {
    if (!videoRef && stream && ref.current) {
      ref.current.srcObject = stream
    }
  }, [stream, videoRef, ref])

  return (
    <div style={{
      position: 'relative',
      background: '#0a1120',
      borderRadius: 14,
      overflow: 'hidden',
      border: `1px solid ${isMe ? '#3b82f633' : '#1e2d47'}`,
      boxShadow: isMe ? '0 0 0 2px #3b82f622' : 'none',
    }}>
      <video
        ref={ref}
        autoPlay
        playsInline
        muted={muted}
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          display: 'block',
          filter: camOn === false ? 'brightness(0)' : 'none',
          minHeight: 120,
        }}
      />

      {camOn === false && (
        <div style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'column',
          gap: 8,
        }}>
          <div style={{
            width: 56,
            height: 56,
            borderRadius: '50%',
            background: 'linear-gradient(135deg, #1e3a5f, #0e1829)',
            border: '2px solid #1e2d47',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#5a7299',
            fontSize: 18,
            fontWeight: 700,
          }}>
            {initials || '?'}
          </div>

          <span style={{
            fontSize: 11,
            color: '#5a7299',
          }}>
            Caméra désactivée
          </span>
        </div>
      )}

      <div style={{
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        background: 'linear-gradient(transparent, rgba(0,0,0,.7))',
        padding: '20px 12px 8px',
      }}>
        <span style={{
          fontSize: 11,
          color: '#e2eaf6',
          fontWeight: 600,
        }}>
          {label}
        </span>
      </div>
    </div>
  )
}

function StatusPill({ color, label, pulse }) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 6,
      background: `${color}18`,
      border: `1px solid ${color}44`,
      borderRadius: 20,
      padding: '4px 12px',
    }}>
      <div style={{
        width: 6,
        height: 6,
        borderRadius: '50%',
        background: color,
        flexShrink: 0,
        animation: pulse ? 'statusPulse 1s ease-in-out infinite' : 'none',
      }} />

      <span style={{
        fontSize: 12,
        color,
        fontWeight: 600,
        whiteSpace: 'nowrap',
      }}>
        {label}
      </span>
    </div>
  )
}

function CtrlBtn({ onClick, icon, label, color, badge }) {
  return (
    <button onClick={onClick} style={{
      position: 'relative',
      background: color || '#131f33',
      border: '1px solid #1e2d47',
      borderRadius: 12,
      padding: '8px 16px',
      color: '#e2eaf6',
      cursor: 'pointer',
      display: 'flex',
      alignItems: 'center',
      gap: 6,
      fontSize: 13,
      fontWeight: 600,
    }}>
      <span style={{ fontSize: 16 }}>
        {icon}
      </span>

      <span style={{ fontSize: 13 }}>
        {label}
      </span>

      {badge && (
        <span style={{
          position: 'absolute',
          top: -4,
          right: -4,
          background: '#ef4444',
          color: '#fff',
          borderRadius: '50%',
          width: 16,
          height: 16,
          fontSize: 10,
          fontWeight: 700,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
          {badge > 9 ? '9+' : badge}
        </span>
      )}
    </button>
  )
}
