import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../api/client'

/** Bouton « Restaurer un cours » : on choisit une sauvegarde .zip, un nouveau cours est créé. */
export default function RestoreCourseButton({ style }) {
  const input = useRef(null)
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const onFile = async e => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setBusy(true)
    setError('')
    try {
      const form = new FormData()
      form.append('file', file)
      const { data } = await api.post('/courses/restore', form, { headers: { 'Content-Type': 'multipart/form-data' } })
      navigate(`/courses/${data.id}`)
    } catch (err) {
      setError(err.response?.data?.detail || 'Restauration impossible')
    } finally { setBusy(false) }
  }

  return (
    <>
      <input ref={input} type="file" accept=".zip,application/zip" hidden onChange={onFile} />
      <button onClick={() => input.current?.click()} disabled={busy} style={style}>
        {busy ? 'Restauration…' : '⬆ Restaurer un cours'}
      </button>
      {error && <div className="alert alert-error" role="alert" style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 600, maxWidth: 380 }}>{error}</div>}
    </>
  )
}
