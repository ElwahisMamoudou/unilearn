import YouTubeLoginButton from '../components/YouTubeLoginButton'

export default function YouTubeSetupPage() {
  return (
    <div style={{
      padding: '40px',
      textAlign: 'center',
      maxWidth: '500px',
      margin: '0 auto'
    }}>
      <h1>🎬 Configuration YouTube</h1>
      <p>Cliquez pour connecter votre compte YouTube</p>
      
      <div style={{ marginTop: '30px' }}>
        <YouTubeLoginButton />
      </div>
    </div>
  )
}
