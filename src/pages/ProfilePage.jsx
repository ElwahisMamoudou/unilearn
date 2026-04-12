import { useState } from 'react'
import useAuthStore from '../store/authStore'
import api from '../api/client'

export default function ProfilePage() {
  const { user, setUser } = useAuthStore()

  const [infoForm, setInfoForm] = useState({
    name:  user?.name  || '',
    email: user?.email || '',
  })
  const [pwdForm, setPwdForm] = useState({
    current_password: '',
    new_password:     '',
    confirm_password: '',
  })
  const [msg, setMsg]         = useState({ text: '', type: '' })
  const [loadingInfo, setLoadingInfo] = useState(false)
  const [loadingPwd, setLoadingPwd]   = useState(false)
  const [showPwd, setShowPwd]         = useState(false)

  const flash = (text, type = 'success') => {
    setMsg({ text, type })
    setTimeout(() => setMsg({ text: '', type: '' }), 4000)
  }

  const initials = user?.name?.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2) || 'U'
  const roleLabel =
    user?.role === 'admin'   ? 'Administrateur' :
    user?.role === 'teacher' ? 'Enseignant'      : 'Étudiant'
  const roleBg =
    user?.role === 'admin'   ? { background: '#fee2e2', color: '#991b1b' } :
    user?.role === 'teacher' ? { background: '#dbeafe', color: '#1e40af' } :
                               { background: '#d1fae5', color: '#065f46' }

  const saveInfo = async () => {
    if (!infoForm.name.trim()) return flash('Le nom est requis', 'error')
    if (!infoForm.email.trim()) return flash('L\'email est requis', 'error')
    setLoadingInfo(true)
    try {
      const { data } = await api.patch('/users/me', infoForm)
      setUser?.(data)
      flash('Informations mises à jour !')
    } catch (err) {
      flash(err.response?.data?.detail || 'Erreur lors de la mise à jour', 'error')
    } finally { setLoadingInfo(false) }
  }

  const savePassword = async () => {
    if (!pwdForm.current_password) return flash('Saisissez votre mot de passe actuel', 'error')
    if (pwdForm.new_password.length < 8) return flash('Le nouveau mot de passe doit contenir au moins 8 caractères', 'error')
    if (pwdForm.new_password !== pwdForm.confirm_password) return flash('Les mots de passe ne correspondent pas', 'error')
    setLoadingPwd(true)
    try {
      await api.post('/users/me/change-password', {
        current_password: pwdForm.current_password,
        new_password:     pwdForm.new_password,
      })
      flash('Mot de passe modifié avec succès !')
      setPwdForm({ current_password: '', new_password: '', confirm_password: '' })
    } catch (err) {
      flash(err.response?.data?.detail || 'Mot de passe actuel incorrect', 'error')
    } finally { setLoadingPwd(false) }
  }

  const pwdStrength = (pwd) => {
    if (!pwd) return null
    let score = 0
    if (pwd.length >= 8)  score++
    if (pwd.length >= 12) score++
    if (/[A-Z]/.test(pwd)) score++
    if (/[0-9]/.test(pwd)) score++
    if (/[^A-Za-z0-9]/.test(pwd)) score++
    if (score <= 1) return { label: 'Faible', color: '#dc2626', pct: 25 }
    if (score <= 2) return { label: 'Moyen',  color: '#f59e0b', pct: 50 }
    if (score <= 3) return { label: 'Bon',    color: '#3b82f6', pct: 75 }
    return { label: 'Fort', color: '#16a34a', pct: 100 }
  }

  const strength = pwdStrength(pwdForm.new_password)

  return (
    <div style={{ maxWidth: 560, margin: '0 auto', padding: '0 8px' }}>
      {msg.text && (
        <div className={`alert alert-${msg.type === 'error' ? 'error' : 'success'}`}
          style={{ marginBottom: 20 }}>
          {msg.text}
        </div>
      )}

      {/* ── Carte identité ── */}
      <div className="card" style={{ marginBottom: 24 }}>
        <div className="card-body" style={{ display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
          <div style={{
            width: 72, height: 72, borderRadius: '50%', flexShrink: 0,
            background: 'var(--navy)', color: '#fff',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 26, fontWeight: 700, letterSpacing: 1,
          }}>{initials}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: 'Playfair Display, serif', fontSize: 20, color: 'var(--navy)', fontWeight: 700, marginBottom: 4 }}>
              {user?.name}
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 8 }}>{user?.email}</div>
            <span style={{ fontSize: 12, padding: '3px 12px', borderRadius: 20, fontWeight: 600, ...roleBg }}>
              {roleLabel}
            </span>
          </div>
        </div>
      </div>

      {/* ── Informations personnelles ── */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-body">
          <div style={{ fontWeight: 700, color: 'var(--navy)', fontSize: 15, marginBottom: 16 }}>
            Informations personnelles
          </div>
          <div className="form-group">
            <label className="form-label">Nom complet</label>
            <input className="form-input" value={infoForm.name}
              onChange={e => setInfoForm(f => ({ ...f, name: e.target.value }))}
              placeholder="Votre nom complet" />
          </div>
          <div className="form-group">
            <label className="form-label">Adresse e-mail</label>
            <input className="form-input" type="email" value={infoForm.email}
              onChange={e => setInfoForm(f => ({ ...f, email: e.target.value }))}
              placeholder="votre@email.com" />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Rôle</label>
            <input className="form-input" value={roleLabel} disabled
              style={{ opacity: 0.6, cursor: 'not-allowed' }} />
          </div>
        </div>
        <div style={{ padding: '0 20px 16px', display: 'flex', justifyContent: 'flex-end' }}>
          <button className="btn btn-primary" onClick={saveInfo} disabled={loadingInfo}>
            {loadingInfo ? 'Enregistrement…' : 'Sauvegarder'}
          </button>
        </div>
      </div>

      {/* ── Sécurité / mot de passe ── */}
      <div className="card">
        <div className="card-body">
          <div style={{ fontWeight: 700, color: 'var(--navy)', fontSize: 15, marginBottom: 16 }}>
            Changer le mot de passe
          </div>
          <div className="form-group">
            <label className="form-label">Mot de passe actuel</label>
            <div style={{ position: 'relative' }}>
              <input className="form-input"
                type={showPwd ? 'text' : 'password'}
                value={pwdForm.current_password}
                onChange={e => setPwdForm(f => ({ ...f, current_password: e.target.value }))}
                placeholder="••••••••"
                style={{ paddingRight: 44 }} />
              <button onClick={() => setShowPwd(v => !v)}
                style={{
                  position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
                  background: 'none', border: 'none', cursor: 'pointer', fontSize: 18,
                  color: 'var(--text-muted)',
                }}>{showPwd ? '🙈' : '👁️'}</button>
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Nouveau mot de passe</label>
            <input className="form-input"
              type={showPwd ? 'text' : 'password'}
              value={pwdForm.new_password}
              onChange={e => setPwdForm(f => ({ ...f, new_password: e.target.value }))}
              placeholder="Min. 8 caractères" />
            {/* Indicateur de force */}
            {pwdForm.new_password && strength && (
              <div style={{ marginTop: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>
                  <span>Force du mot de passe</span>
                  <span style={{ color: strength.color, fontWeight: 700 }}>{strength.label}</span>
                </div>
                <div style={{ height: 4, background: 'var(--border)', borderRadius: 2, overflow: 'hidden' }}>
                  <div style={{
                    height: '100%', width: `${strength.pct}%`,
                    background: strength.color, borderRadius: 2, transition: 'all 0.3s',
                  }} />
                </div>
              </div>
            )}
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Confirmer le nouveau mot de passe</label>
            <input className="form-input"
              type={showPwd ? 'text' : 'password'}
              value={pwdForm.confirm_password}
              onChange={e => setPwdForm(f => ({ ...f, confirm_password: e.target.value }))}
              placeholder="Répétez le mot de passe"
              style={{
                borderColor: pwdForm.confirm_password && pwdForm.confirm_password !== pwdForm.new_password ? '#fca5a5' : undefined,
              }} />
            {pwdForm.confirm_password && pwdForm.confirm_password !== pwdForm.new_password && (
              <div style={{ fontSize: 12, color: '#dc2626', marginTop: 4 }}>Les mots de passe ne correspondent pas</div>
            )}
          </div>
        </div>
        <div style={{ padding: '0 20px 16px', display: 'flex', justifyContent: 'flex-end' }}>
          <button className="btn btn-primary" onClick={savePassword} disabled={loadingPwd}>
            {loadingPwd ? 'Modification…' : 'Changer le mot de passe'}
          </button>
        </div>
      </div>
    </div>
  )
}
