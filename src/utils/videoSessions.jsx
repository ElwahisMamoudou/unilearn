export const youtubeEmbedUrl = session => {
  const videoId = session?.youtube_video_id || getYouTubeVideoId(session?.recording_url || session?.youtube_live_url)
  return videoId ? `https://www.youtube.com/embed/${videoId}?autoplay=1&rel=0` : ''
}

export const getYouTubeVideoId = url => {
  if (!url) return ''
  const patterns = [/[?&]v=([^&#]+)/, /youtu\.be\/([^?&#]+)/, /embed\/([^?&#]+)/]
  for (const pattern of patterns) {
    const match = String(url).match(pattern)
    if (match?.[1]) return match[1]
  }
  return ''
}

export const openLiveRoom = (navigate, session) => {
  navigate(`/room/${session.room_id}`, { state: { session } })
}

export function LiveReplayPlayer({ session, compact = false }) {
  const src = youtubeEmbedUrl(session)
  if (!src) return null

  return (
    <div style={{ marginTop: 12 }}>
      <div style={{
        display: 'inline-flex', alignItems: 'center', gap: 6, marginBottom: 8,
        padding: '3px 10px', borderRadius: 999, fontSize: 12, fontWeight: 700,
        background: session.is_active ? '#fee2e2' : '#e0f2fe',
        color: session.is_active ? '#b91c1c' : '#075985',
      }}>
        {session.is_active ? '🔴 LIVE' : '▶ Rediffusion'}
      </div>
      <div style={{
        position: 'relative', width: '100%', paddingTop: compact ? '45%' : '56.25%',
        overflow: 'hidden', borderRadius: 14, background: '#0f172a',
        boxShadow: '0 12px 32px rgba(15, 23, 42, 0.16)',
      }}>
        <iframe
          title={session.is_active ? `Live ${session.title}` : `Rediffusion ${session.title}`}
          src={src}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 0 }}
        />
      </div>
    </div>
  )
}
