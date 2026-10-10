import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../api/client'
import useAuthStore from '../store/authStore'
import { downloadFile } from '../utils/download'

const btn = {
  background: 'rgba(255,255,255,.18)', border: 'none', color: '#fff', borderRadius: 8, padding: '6px 14px',
  cursor: 'pointer', fontSize: 13, backdropFilter: 'blur(6px)',
}

/** Outils du cours affichés dans son en-tête : groupes, rapport, copie, sauvegarde. */
export default function CourseToolsBar({ course }) {
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const isStaff = user?.role === 'admin' || user?.role === 'teacher'
  const [busy, setBusy] = useState('')
  const [toast, setToast] = useState(null)

  const say = (type, text) => { setToast({ type, text }); setTimeout(() => setToast(null), 5000) }
  const errText = err => err.response?.status === 403 ? 'Vous n\'avez pas les droits sur ce cours.' : (err.response?.data?.detail || 'Une erreur est survenue')

  const duplicate = async () => {
    if (!window.confirm('Copier ce cours ? La copie (contenu, leçons, examens, devoirs) sera créée non publiée.')) return
    setBusy('copy')
    try {
      const { data } = await api.post(`/courses/${course.id}/duplicate`)
      say('success', `Copie créée : « ${data.title} »`)
      navigate(`/courses/${data.id}`)
    } catch (err) { say('error', errText(err)) } finally { setBusy('') }
  }

  const backup = async () => {
    setBusy('backup')
    try { await downloadFile(`/courses/${course.id}/backup`, {}, 'sauvegarde-cours.zip'); say('success', 'Sauvegarde téléchargée') }
    catch (err) { say('error', err.response?.status === 403 ? 'Vous n\'avez pas les droits sur ce cours.' : 'Sauvegarde impossible') }
    finally { setBusy('') }
  }

  return (
    <>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button style={btn} onClick={() => navigate(`/courses/${course.id}/groups`)}>👥 Groupes</button>
        {isStaff && <>
          <button style={btn} onClick={() => navigate(`/reports?course=${course.id}`)}>📊 Rapport</button>
          <button style={btn} onClick={duplicate} disabled={!!busy}>{busy === 'copy' ? 'Copie…' : '⧉ Copier'}</button>
          <button style={btn} onClick={backup} disabled={!!busy}>{busy === 'backup' ? 'Préparation…' : '⬇ Sauvegarder'}</button>
        </>}
      </div>
      {toast && (
        <div className={`alert alert-${toast.type === 'error' ? 'error' : 'success'}`} role="status"
             style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 600, maxWidth: 380, boxShadow: 'var(--shadow-lg)' }}>
          {toast.text}
        </div>
      )}
    </>
  )
}
