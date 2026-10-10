import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import api from '../api/client'
import useAuthStore from '../store/authStore'
import { downloadFile } from '../utils/download'

const fmtDate = iso => (iso ? new Date(iso + (iso.endsWith('Z') ? '' : 'Z')).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }) : '—')
const ROLE = { admin: 'Administrateur', teacher: 'Enseignant', student: 'Étudiant' }

/** Rapports et journaux d'activité (style Moodle : vue d'ensemble, journaux, rapport de cours). */
export default function ReportsPage() {
  const { user } = useAuthStore()
  const isAdmin = user?.role === 'admin'
  const [params, setParams] = useSearchParams()
  const tab = params.get('tab') || (params.get('course') ? 'course' : isAdmin ? 'overview' : 'logs')
  const setTab = t => setParams({ tab: t })

  const tabs = [
    ...(isAdmin ? [{ key: 'overview', label: 'Vue d\'ensemble' }] : []),
    { key: 'logs', label: 'Journal d\'activité' },
    { key: 'course', label: 'Rapport de cours' },
  ]

  return (
    <div>
      <div className="tabs-moodle" role="tablist">
        {tabs.map(t => (
          <button key={t.key} role="tab" aria-selected={tab === t.key} className={tab === t.key ? 'active' : ''} onClick={() => setTab(t.key)}>{t.label}</button>
        ))}
      </div>
      {tab === 'overview' && isAdmin && <Overview />}
      {tab === 'logs' && <Logs />}
      {tab === 'course' && <CourseReport initialCourse={params.get('course')} />}
    </div>
  )
}

/* ───────────── Vue d'ensemble ───────────── */
function Overview() {
  const [d, setD] = useState(null)
  const [error, setError] = useState('')
  useEffect(() => { api.get('/reports/overview').then(r => setD(r.data)).catch(e => setError(e.response?.data?.detail || 'Erreur')) }, [])
  if (error) return <div className="alert alert-error">{error}</div>
  if (!d) return <div className="spinner" />
  const max = Math.max(1, ...d.logins_per_day.map(x => x.count))
  const stat = (label, value, sub) => (
    <div className="stat-card"><div className="stat-label">{label}</div><div className="stat-value">{value}</div>{sub && <div className="stat-sub">{sub}</div>}</div>
  )
  return (
    <>
      <div className="stats-grid">
        {stat('Étudiants', d.users.student)}
        {stat('Enseignants', d.users.teacher)}
        {stat('Cours', d.courses.total, `${d.courses.published} publiés`)}
        {stat('Inscriptions', d.enrollments)}
        {stat('Actifs (7 jours)', d.active_users.last_7_days, `${d.active_users.last_30_days} sur 30 jours`)}
        {stat('Connexions échouées (7 j)', d.failed_logins_7_days)}
      </div>

      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-header"><span className="card-title">Connexions par jour (14 derniers jours)</span></div>
        <div className="card-body" style={{ paddingBottom: 36 }}>
          <div className="bar-chart" role="img" aria-label="Graphique des connexions par jour">
            {d.logins_per_day.map(x => (
              <div key={x.day} style={{ height: `${(x.count / max) * 100}%` }} title={`${x.day} : ${x.count}`}><span>{x.day.slice(8)}</span></div>
            ))}
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gap: 20, gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))' }}>
        <div className="card">
          <div className="card-header"><span className="card-title">Activité (30 jours)</span></div>
          <table className="data-table"><tbody>
            {d.activity_by_action.length === 0 && <tr><td>Aucune activité enregistrée pour le moment.</td></tr>}
            {d.activity_by_action.map(a => <tr key={a.action}><td>{a.label}</td><td style={{ textAlign: 'right' }}>{a.count}</td></tr>)}
          </tbody></table>
        </div>
        <div className="card">
          <div className="card-header"><span className="card-title">Cours les plus actifs</span></div>
          <table className="data-table"><tbody>
            {d.top_courses.length === 0 && <tr><td>Aucune donnée.</td></tr>}
            {d.top_courses.map(c => <tr key={c.id}><td>{c.title}</td><td style={{ textAlign: 'right' }}>{c.events} événements</td></tr>)}
          </tbody></table>
        </div>
      </div>

      <div className="card" style={{ marginTop: 20 }}>
        <div className="card-header"><span className="card-title">Dernières connexions</span></div>
        <div className="table-wrap"><table className="data-table">
          <thead><tr><th>Date</th><th>Utilisateur</th><th>Résultat</th><th>Adresse IP</th></tr></thead>
          <tbody>{d.recent_logins.map((l, i) => (
            <tr key={i}><td>{fmtDate(l.date)}</td><td>{l.user}</td>
              <td>{l.success ? <span className="badge-done lesson-badge">Réussie</span> : <span className="badge-pdf lesson-badge">Échec</span>}</td><td>{l.ip || '—'}</td></tr>
          ))}</tbody>
        </table></div>
      </div>
    </>
  )
}

/* ───────────── Journal d'activité ───────────── */
function Logs() {
  const [courses, setCourses] = useState([])
  const [actions, setActions] = useState([])
  const [f, setF] = useState({ course_id: '', action: '', date_from: '', date_to: '' })
  const [page, setPage] = useState(1)
  const [data, setData] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    api.get('/reports/courses').then(r => setCourses(r.data)).catch(() => {})
    api.get('/reports/actions').then(r => setActions(r.data)).catch(() => {})
  }, [])

  const query = () => Object.fromEntries(Object.entries(f).filter(([, v]) => v))
  const load = p => {
    setError('')
    api.get('/reports/logs', { params: { ...query(), page: p, page_size: 50 } })
      .then(r => { setData(r.data); setPage(p) })
      .catch(e => setError(e.response?.data?.detail || 'Erreur'))
  }
  useEffect(() => { load(1) }, []) // eslint-disable-line

  const set = k => e => setF({ ...f, [k]: e.target.value })
  const pages = data ? Math.max(1, Math.ceil(data.total / data.page_size)) : 1

  return (
    <>
      <form className="filters" onSubmit={e => { e.preventDefault(); load(1) }}>
        <div className="form-group"><label className="form-label" htmlFor="f-course">Cours</label>
          <select id="f-course" className="form-select" value={f.course_id} onChange={set('course_id')}>
            <option value="">Tous</option>{courses.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
          </select></div>
        <div className="form-group"><label className="form-label" htmlFor="f-action">Action</label>
          <select id="f-action" className="form-select" value={f.action} onChange={set('action')}>
            <option value="">Toutes</option>{actions.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
          </select></div>
        <div className="form-group"><label className="form-label" htmlFor="f-from">Du</label>
          <input id="f-from" className="form-input" type="date" value={f.date_from} onChange={set('date_from')} /></div>
        <div className="form-group"><label className="form-label" htmlFor="f-to">Au</label>
          <input id="f-to" className="form-input" type="date" value={f.date_to} onChange={set('date_to')} /></div>
        <button className="btn btn-primary" type="submit">Afficher</button>
        <button className="btn btn-outline" type="button" onClick={() => downloadFile('/reports/logs.csv', query(), 'journal-activite.csv').catch(() => setError('Export impossible'))}>⬇ Exporter en CSV</button>
      </form>

      {error && <div className="alert alert-error">{error}</div>}
      {!data ? <div className="spinner" /> : (
        <>
          <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 8 }}>{data.total} événement{data.total !== 1 ? 's' : ''}</p>
          <div className="table-wrap"><table className="data-table">
            <thead><tr><th>Date</th><th>Utilisateur</th><th>Action</th><th>Cours</th><th>Adresse IP</th></tr></thead>
            <tbody>
              {data.items.length === 0 && <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--text-muted)' }}>Aucun événement pour ces critères.</td></tr>}
              {data.items.map(i => (
                <tr key={i.id}>
                  <td style={{ whiteSpace: 'nowrap' }}>{fmtDate(i.date)}</td>
                  <td>{i.user ? <>{i.user.name} <span className="pill">{ROLE[i.user.role] || i.user.role}</span></> : '—'}</td>
                  <td>{i.label}</td><td>{i.course?.title || '—'}</td><td>{i.ip || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table></div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', justifyContent: 'center', marginTop: 16 }}>
            <button className="btn btn-outline btn-sm" disabled={page <= 1} onClick={() => load(page - 1)}>← Précédent</button>
            <span style={{ fontSize: 13 }}>Page {page} / {pages}</span>
            <button className="btn btn-outline btn-sm" disabled={page >= pages} onClick={() => load(page + 1)}>Suivant →</button>
          </div>
        </>
      )}
    </>
  )
}

/* ───────────── Rapport d'un cours ───────────── */
function CourseReport({ initialCourse }) {
  const [courses, setCourses] = useState([])
  const [courseId, setCourseId] = useState(initialCourse || '')
  const [groups, setGroups] = useState([])
  const [groupId, setGroupId] = useState('')
  const [data, setData] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => { api.get('/reports/courses').then(r => setCourses(r.data)).catch(() => {}) }, [])

  useEffect(() => {
    setData(null); setError('')
    if (!courseId) { setGroups([]); return }
    api.get(`/courses/${courseId}/groups`).then(r => setGroups(r.data.groups || [])).catch(() => setGroups([]))
  }, [courseId])

  useEffect(() => {
    if (!courseId) return
    api.get(`/reports/course/${courseId}`, { params: groupId ? { group_id: groupId } : {} })
      .then(r => setData(r.data)).catch(e => setError(e.response?.data?.detail || 'Erreur'))
  }, [courseId, groupId])

  return (
    <>
      <div className="filters">
        <div className="form-group"><label className="form-label" htmlFor="r-course">Cours</label>
          <select id="r-course" className="form-select" value={courseId} onChange={e => { setCourseId(e.target.value); setGroupId('') }}>
            <option value="">Choisir un cours…</option>{courses.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
          </select></div>
        {groups.length > 0 && (
          <div className="form-group"><label className="form-label" htmlFor="r-group">Groupe</label>
            <select id="r-group" className="form-select" value={groupId} onChange={e => setGroupId(e.target.value)}>
              <option value="">Tous les étudiants</option>{groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select></div>
        )}
        {data && <button className="btn btn-outline" onClick={() => downloadFile(`/reports/course/${courseId}/export.csv`, groupId ? { group_id: groupId } : {}, 'rapport-cours.csv').catch(() => setError('Export impossible'))}>⬇ Exporter en CSV</button>}
      </div>

      {error && <div className="alert alert-error">{error}</div>}
      {!courseId && <p style={{ color: 'var(--text-muted)' }}>Choisissez un cours pour voir la progression de ses étudiants.</p>}
      {courseId && !data && !error && <div className="spinner" />}
      {data && (
        <>
          <div className="stats-grid">
            <div className="stat-card"><div className="stat-label">Étudiants</div><div className="stat-value">{data.totals.students}</div></div>
            <div className="stat-card"><div className="stat-label">Leçons</div><div className="stat-value">{data.totals.lessons}</div></div>
            <div className="stat-card"><div className="stat-label">Progression moyenne</div><div className="stat-value">{data.totals.avg_progress_pct}%</div></div>
          </div>
          <div className="table-wrap"><table className="data-table">
            <thead><tr><th>Étudiant</th><th>Groupes</th><th>Progression</th><th>Dernière activité</th><th>Examens</th><th>Devoirs</th></tr></thead>
            <tbody>
              {data.students.length === 0 && <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--text-muted)' }}>Aucun étudiant.</td></tr>}
              {data.students.map(s => (
                <tr key={s.id}>
                  <td><strong>{s.name}</strong><div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{s.email}</div></td>
                  <td>{s.groups.length ? s.groups.map(g => <span key={g} className="pill">{g}</span>) : '—'}</td>
                  <td style={{ minWidth: 150 }}>
                    <div className="progress-bar"><div className="progress-fill" style={{ width: `${s.progress_pct}%` }} /></div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{s.completed_lessons}/{s.total_lessons} leçons · {s.progress_pct}%</div>
                  </td>
                  <td>{fmtDate(s.last_activity)}</td>
                  <td>{s.exams_taken} passé{s.exams_taken !== 1 ? 's' : ''}{s.exams_avg_pct != null && ` · moy. ${s.exams_avg_pct}%`}</td>
                  <td>{s.homeworks_submitted} rendu{s.homeworks_submitted !== 1 ? 's' : ''}{s.homeworks_avg_pct != null && ` · moy. ${s.homeworks_avg_pct}%`}</td>
                </tr>
              ))}
            </tbody>
          </table></div>
        </>
      )}
    </>
  )
}
