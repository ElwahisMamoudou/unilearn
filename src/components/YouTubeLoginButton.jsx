export default function YouTubeLoginButton() {
  const handleConnect = () => {
    const CLIENT_ID = "137571445759-k338atdfh41f2q9ttc8t9s4qkn6433s7.apps.googleusercontent.com";
    const REDIRECT_URI = window.location.hostname === 'localhost'
      ? 'http://localhost:5173/callback'
      : 'https://unilearn-hrrk-7y08uq5tr-elwahismamoudous-projects.vercel.app/callback';

    const scope = [
      'https://www.googleapis.com/auth/youtube.upload',
      'https://www.googleapis.com/auth/youtube',
      'https://www.googleapis.com/auth/youtube.force-ssl'
    ].join(' ');

    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
      `client_id=${CLIENT_ID}&` +
      `redirect_uri=${encodeURIComponent(REDIRECT_URI)}&` +
      `response_type=code&` +
      `scope=${encodeURIComponent(scope)}&` +
      `access_type=offline&` +
      `prompt=consent`;

    window.location.href = authUrl;
  };

  return (
    <button 
      onClick={handleConnect}
      style={{
        padding: '10px 20px',
        fontSize: '16px',
        backgroundColor: '#FF0000',
        color: 'white',
        border: 'none',
        borderRadius: '4px',
        cursor: 'pointer'
      }}
    >
      🔴 Connecter YouTube
    </button>
  );
}
