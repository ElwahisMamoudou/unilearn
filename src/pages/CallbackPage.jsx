import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

export default function CallbackPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState('⏳ Récupération du REFRESH_TOKEN...');
  const [token, setToken] = useState(null);

  useEffect(() => {
    const code = searchParams.get('code');
    const error = searchParams.get('error');

    if (error) {
      setStatus(`❌ Erreur Google : ${error}`);
      return;
    }

    if (code) {
      exchangeCode(code);
    }
  }, [searchParams]);

  const exchangeCode = async (code) => {
    try {
      const backendUrl = window.location.hostname === 'localhost' 
        ? 'http://localhost:8000'
        : 'printf-web-production-b7a3.up.railway.app';

      const response = await fetch(`${backendUrl}/auth/youtube/callback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code })
      });

      const data = await response.json();

      if (data.success) {
        setToken(data.refresh_token);
        setStatus('✅ REFRESH_TOKEN obtenu !');
      } else {
        setStatus(`❌ Erreur : ${data.error}`);
      }
    } catch (err) {
      setStatus(`❌ Erreur : ${err.message}`);
    }
  };

  return (
    <div style={{ 
      textAlign: 'center', 
      marginTop: '50px',
      padding: '20px',
      fontFamily: 'monospace'
    }}>
      <h1>{status}</h1>
      {token && (
        <div style={{ 
          backgroundColor: '#f0f0f0', 
          padding: '20px', 
          borderRadius: '5px',
          marginTop: '20px'
        }}>
          <p><strong>Copie ce REFRESH_TOKEN dans Railway :</strong></p>
          <code style={{ 
            display: 'block',
            wordBreak: 'break-all',
            padding: '10px',
            backgroundColor: '#fff',
            border: '1px solid #ccc'
          }}>
            {token}
          </code>
          <button 
            onClick={() => navigator.clipboard.writeText(token)}
            style={{
              marginTop: '10px',
              padding: '10px 20px',
              cursor: 'pointer'
            }}
          >
            📋 Copier
          </button>
        </div>
      )}
    </div>
  );
}
