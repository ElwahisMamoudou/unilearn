const THUMB_BG = ['#e0f2fe', '#fef9c3', '#dcfce7', '#ede9fe', '#fee2e2', '#f0fdf4']
const THUMB_ICON = ['📘', '📙', '📗', '📓', '📕', '📔']

export default function CourseCard({ course, onClick }) {
  const idx = (course.id - 1) % THUMB_BG.length

  return (
    <div className="course-card" onClick={onClick} style={{ cursor: 'pointer' }}>

      {/* ── Thumbnail : image réelle OU fond coloré ── */}
      <div className="course-thumb" style={{
        background: course.thumbnail ? 'transparent' : THUMB_BG[idx],
        position: 'relative',
        overflow: 'hidden',
        height: 140,
        borderRadius: '12px 12px 0 0',
      }}>
        {course.thumbnail ? (
          <img
            src={course.thumbnail}
            alt={course.title}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              display: 'block',
            }}
            onError={e => {
              // Si l'image échoue à charger, afficher le fond coloré
              e.target.style.display = 'none'
              e.target.parentElement.style.background = THUMB_BG[idx]
            }}
          />
        ) : (
          <div style={{
            width: '100%',
            height: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 48,
          }}>
            {THUMB_ICON[idx]}
          </div>
        )}

        {/* Badge catégorie positionné sur l'image */}
        {course.category && (
          <span style={{
            position: 'absolute',
            top: 10,
            left: 10,
            background: `${course.category.color}dd`,
            color: '#fff',
            fontSize: 11,
            fontWeight: 700,
            padding: '3px 10px',
            borderRadius: 20,
            backdropFilter: 'blur(4px)',
          }}>
            {course.category.name}
          </span>
        )}

        {/* Badge publié/brouillon */}
        {course.is_published === false && (
          <span style={{
            position: 'absolute',
            top: 10,
            right: 10,
            background: '#fef9c3',
            color: '#854d0e',
            fontSize: 10,
            fontWeight: 700,
            padding: '2px 8px',
            borderRadius: 20,
          }}>
            Brouillon
          </span>
        )}
      </div>

      {/* ── Corps ── */}
      <div className="course-body" style={{ padding: '14px 16px' }}>
        <div className="course-name" style={{
          fontWeight: 700,
          fontSize: 14,
          color: 'var(--navy)',
          marginBottom: 4,
          lineHeight: 1.3,
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
        }}>
          {course.title}
        </div>

        <div className="course-teacher" style={{
          fontSize: 12,
          color: 'var(--text-muted)',
          marginBottom: 10,
        }}>
          👨‍🏫 {course.teacher_name}
        </div>

        {/* Barre de progression */}
        <div className="progress-bar" style={{
          height: 5,
          background: '#e2e8f0',
          borderRadius: 10,
          overflow: 'hidden',
          marginBottom: 6,
        }}>
          <div className="progress-fill" style={{
            width: `${course.progress_pct || 0}%`,
            height: '100%',
            background: 'linear-gradient(90deg, var(--blue), #60a5fa)',
            borderRadius: 10,
            transition: 'width .4s ease',
          }} />
        </div>

        <div className="progress-info" style={{
          display: 'flex',
          justifyContent: 'space-between',
          fontSize: 11,
          color: 'var(--text-muted)',
        }}>
          <span>📄 {course.lesson_count || 0} leçon{(course.lesson_count || 0) !== 1 ? 's' : ''}</span>
          <span style={{ fontWeight: 600, color: (course.progress_pct || 0) > 0 ? 'var(--blue)' : 'var(--text-muted)' }}>
            {course.progress_pct || 0}%
          </span>
        </div>
      </div>
    </div>
  )
}
