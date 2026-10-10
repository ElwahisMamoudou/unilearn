import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import api from '../api/client'

const SECTIONS = [
  { key: 'courses',   icon: '📚', label: 'Cours' },
  { key: 'lessons',   icon: '📄', label: 'Leçons' },
  { key: 'exams',     icon: '📋', label: 'Examens' },
  { key: 'homeworks', icon: '📝', label: 'Devoirs' },
  { key: 'forum',     icon: '💬', label: 'Forum' },
  { key: 'users',     icon: '👤', label: 'Utilisateurs' },
]

/** Résultats de la recherche globale (barre du haut). */
export default function SearchPage() {
  const [params, setParams] = useSearchParams()
  const q = params.get('q') || ''
  const [text, setText] = useState(q)
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => { setText(q) }, [q])

  useEffect(() => {
    if (q.trim().length < 2) { setData(null); return }
    setLoading(true)
    setError('')
    api.get('/search', { params: { q: q.trim(), limit: 10 } })
      .then(r => setData(r.data))
      .catch(err => setError(err.response?.data?.detail?.[0]?.msg || err.response?.data?.detail || 'Recherche impossible'))
      .finally(() => setLoading(false))
  }, [q])

  const submit = e => { e.preventDefault(); setParams({ q: text.trim() }) }

  return (
    <div style={{ maxWidth: 900 }}>
      <form onSubmit={submit} className="search-bar" style={{ marginBottom: 20 }}>
        <span aria-hidden="true">🔍</span>
        <input value={text} onChange={e => setText(e.target.value)} placeholder="Rechercher un cours, une leçon, un devoir…" autoFocus aria-label="Recherche" />
        <button className="btn btn-primary btn-sm" type="submit">Rechercher</button>
      </form>

      {q.trim().length < 2 && <p style={{ color: 'var(--text-muted)' }}>Saisissez au moins 2 caractères.</p>}
      {loading && <div className="spinner" />}
      {error && <div className="alert alert-error">{String(error)}</div>}

      {data && !loading && (
        <>
          <p style={{ color: 'var(--text-muted)', marginBottom: 16 }}>
            {data.total} résultat{data.total !== 1 ? 's' : ''} pour « {data.q} »
          </p>
          {data.total === 0 && (
            <div className="empty-state"><div className="icon">🔍</div><h3>Aucun résultat</h3><p>Essayez d'autres mots-clés.</p></div>
          )}
          {SECTIONS.filter(s => data[s.key]?.length).map(s => (
            <div className="card" key={s.key} style={{ marginBottom: 16 }}>
              <div className="card-header"><span className="card-title">{s.icon} {s.label} ({data[s.key].length})</span></div>
              <div>
                {data[s.key].map(item => (
                  <div key={`${s.key}-${item.id}`} style={{ padding: '10px 20px', borderBottom: '1px solid var(--border)' }}>
                    {item.link
                      ? <Link to={item.link} style={{ color: 'var(--blue)', fontWeight: 600 }}>{item.title}</Link>
                      : <span style={{ fontWeight: 600 }}>{item.title}</span>}
                    {item.course && <span style={{ color: 'var(--text-muted)', fontSize: 13 }}> — {item.course}</span>}
                    {s.key === 'courses' && item.published === false && <span className="pill" style={{ marginLeft: 8 }}>Non publié</span>}
                    {s.key === 'courses' && item.enrolled && <span className="pill" style={{ marginLeft: 8 }}>Inscrit</span>}
                    {item.snippet && <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 2 }}>{item.snippet}</div>}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  )
}
