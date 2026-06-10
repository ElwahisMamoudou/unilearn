/**
 * utils/videoSessions.jsx
 *
 * Utilitaires partagés pour les sessions de cours en ligne.
 *
 * Exports :
 *   - openLiveRoom(navigate, session)  → redirige vers la salle Jitsi
 *   - LiveReplayPlayer({ session })    → lecteur de rediffusion inline
 *
 * Utilisé par : CourseDetail.jsx, et tout composant affichant des sessions.
 */

import { useState } from 'react'

// Construit l'URL absolue pour un recording_url relatif venant du backend
function buildRecordingUrl(url) {
  if (!url) return null
  if (url.startsWith('http')) return url
  const base = (import.meta.env.VITE_API_URL || 'http://localhost:8000/api')
    .replace(/\/api\/?$/, '')
  return `${base}${url}`
}

/* ════════════════════════════════════════════════════════════════
   openLiveRoom
   Navigue vers la page /live/:roomId?session=:id
   Appelé quand le prof démarre ou qu'un étudiant rejoint un live.
════════════════════════════════════════════════════════════════ */
export function openLiveRoom(navigate, session) {
  if (!session?.room_id) return
  navigate(`/room/${session.room_id}?session=${session.id}`)
}


/* ════════════════════════════════════════════════════════════════
   LiveReplayPlayer
   Affiché sous une carte de session quand une rediffusion existe.

   - Si recording_url pointe vers /api/sessions/recordings/...
     → player vidéo HTML5 natif (enregistrement local MediaRecorder)
   - Si recording_url est une URL YouTube
     → iframe YouTube embed
   - Bouton "Voir la rediffusion" pour afficher/masquer le player
════════════════════════════════════════════════════════════════ */
export function LiveReplayPlayer({ session }) {
  const [show, setShow] = useState(false)

  if (!session?.recording_url) return null

  const recordingUrl = buildRecordingUrl(session.recording_url)
  const isYouTube = session.recording_url.includes('youtube.com') ||
                    session.recording_url.includes('youtu.be')

  return (
    <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border)' }}>
      {!show ? (
        <button
          onClick={() => setShow(true)}
          style={{
            background: '#eff6ff',
            border: '1px solid #bfdbfe',
            color: '#1d4ed8',
            borderRadius: 8,
            padding: '7px 16px',
            fontSize: 13,
            fontWeight: 600,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 7,
          }}
        >
          🎬 Voir la rediffusion
        </button>
      ) : (
        <div>
          {/* En-tête player */}
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 8,
          }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--navy)' }}>
              🎬 Rediffusion
            </span>
            <button
              onClick={() => setShow(false)}
              style={{
                background: 'none', border: 'none',
                color: 'var(--text-muted)', fontSize: 18,
                cursor: 'pointer', lineHeight: 1,
              }}
            >×</button>
          </div>

          {/* Player selon le type de source */}
          {isYouTube ? (
            <YouTubeEmbed url={session.recording_url} />
          ) : (
            <video
              controls
              style={{
                width: '100%',
                maxHeight: 420,
                borderRadius: 10,
                background: '#000',
                display: 'block',
              }}
              src={recordingUrl}
            >
              Votre navigateur ne supporte pas la lecture vidéo.
            </video>
          )}
        </div>
      )}
    </div>
  )
}


/* ════════════════════════════════════════════════════════════════
   YouTubeEmbed (interne)
   Extrait le video_id et affiche l'iframe officielle YouTube.
════════════════════════════════════════════════════════════════ */
function YouTubeEmbed({ url }) {
  const videoId = extractYouTubeId(url)

  if (!videoId) {
    return (
      <div style={{
        padding: '20px', textAlign: 'center',
        color: 'var(--text-muted)', fontSize: 13,
        background: '#f8fafc', borderRadius: 10,
      }}>
        ⚠️ URL YouTube invalide
      </div>
    )
  }

  return (
    <div style={{ position: 'relative', paddingTop: '56.25%', borderRadius: 10, overflow: 'hidden' }}>
      <iframe
        src={`https://www.youtube.com/embed/${videoId}?rel=0&modestbranding=1`}
        style={{
          position: 'absolute', top: 0, left: 0,
          width: '100%', height: '100%',
          border: 'none',
        }}
        title="Rediffusion YouTube"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
      />
    </div>
  )
}

function extractYouTubeId(url) {
  try {
    const u = new URL(url)
    if (u.hostname === 'youtu.be') return u.pathname.slice(1).split('?')[0]
    if (u.pathname.startsWith('/embed/')) return u.pathname.split('/embed/')[1].split('?')[0]
    if (u.pathname.startsWith('/shorts/')) return u.pathname.split('/shorts/')[1].split('?')[0]
    return u.searchParams.get('v') || ''
  } catch {
    return ''
  }
}
