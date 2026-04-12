const THUMB_BG = ['#e0f2fe','#fef9c3','#dcfce7','#ede9fe','#fee2e2','#f0fdf4']

export default function CourseCard({ course, onClick }) {
  const idx = (course.id - 1) % THUMB_BG.length

  return (
    <div className="course-card" onClick={onClick}>
      <div className="course-thumb" style={{ background: THUMB_BG[idx] }} />
      <div className="course-body">
        {course.category && (
          <span className="course-tag"
            style={{ background: `${course.category.color}22`, color: course.category.color }}>
            {course.category.name}
          </span>
        )}
        <div className="course-name">{course.title}</div>
        <div className="course-teacher">{course.teacher_name}</div>
        <div className="progress-bar">
          <div className="progress-fill" style={{ width: `${course.progress_pct}%` }} />
        </div>
        <div className="progress-info">
          <span>{course.lesson_count} lecon{course.lesson_count !== 1 ? 's' : ''}</span>
          <span>{course.progress_pct}%</span>
        </div>
      </div>
    </div>
  )
}
