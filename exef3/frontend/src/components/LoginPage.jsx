import React, { useState } from 'react';
import { COLORS, API_URL } from '../constants.js';
import { useAuth } from '../context/AuthContext.jsx';

export default function LoginPage() {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [message, setMessage] = useState('');
  const [mode, setMode] = useState('password'); // 'password' | 'magic'
  const [isCodeSent, setIsCodeSent] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handlePasswordLogin = async (e) => {
    e.preventDefault();
    setMessage('');
    setSubmitting(true);
    try {
      const body = new URLSearchParams({ username: email, password });
      const response = await fetch(`${API_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
      });
      if (response.ok) {
        const tokenData = await response.json();
        login(tokenData.access_token);
      } else {
        setMessage('Nieprawidłowy email lub hasło.');
      }
    } catch (err) {
      setMessage('Wystąpił błąd połączenia.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleMagicLink = async (e) => {
    e.preventDefault();
    setMessage('');
    setSubmitting(true);
    try {
      if (!isCodeSent) {
        const response = await fetch(`${API_URL}/auth/magic-link/request`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email }),
        });
        if (response.ok) {
          const data = await response.json();
          setIsCodeSent(true);
          setMessage(data.message || 'Link logowania został wysłany.');
        } else {
          setMessage('Wystąpił błąd. Spróbuj ponownie.');
        }
      } else {
        const response = await fetch(`${API_URL}/auth/magic-link/login-code`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, code }),
        });
        if (response.ok) {
          const tokenData = await response.json();
          login(tokenData.access_token);
        } else {
          setMessage('Nieprawidłowy kod.');
        }
      }
    } catch (err) {
      setMessage('Wystąpił błąd połączenia.');
    } finally {
      setSubmitting(false);
    }
  };

  const DEMO_ACCOUNTS = [
    { email: 'biuro@exef.pl', label: '🏢 Biuro Rachunkowe', desc: 'widok księgowego z delegacjami' },
    { email: 'jan.kowalski@example.pl', label: '👤 Jan Kowalski', desc: 'JDG - klient biura' },
    { email: 'kontakt@techstartup.pl', label: '🏢 TechStartup', desc: 'Sp. z o.o. - klient biura' },
  ];

  return (
    <div style={{
      minHeight: '100vh',
      background: `linear-gradient(135deg, ${COLORS.bg} 0%, #1a1333 100%)`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: "'Inter', -apple-system, sans-serif", color: COLORS.text,
    }}>
      <div style={{
        width: '420px', background: COLORS.bgSecondary,
        borderRadius: '16px', padding: '32px',
        border: `1px solid ${COLORS.border}`,
      }}>
        <div style={{ textAlign: 'center', marginBottom: '24px' }}>
          <div style={{
            fontSize: '28px', fontWeight: '800',
            background: `linear-gradient(135deg, ${COLORS.primary}, ${COLORS.secondary})`,
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
            marginBottom: '8px',
          }}>EXEF</div>
          <div style={{ color: COLORS.textMuted, fontSize: '13px' }}>Document Flow Engine</div>
        </div>

        {/* Mode tabs */}
        <div style={{
          display: 'flex', marginBottom: '20px', background: COLORS.bgTertiary,
          borderRadius: '8px', border: `1px solid ${COLORS.border}`, overflow: 'hidden',
        }}>
          {[
            { id: 'password', label: '🔑 Hasło' },
            { id: 'magic', label: '✉️ Magic Link' },
          ].map(m => (
            <button key={m.id} onClick={() => { setMode(m.id); setMessage(''); setIsCodeSent(false); }}
              style={{
                flex: 1, padding: '10px', border: 'none',
                background: mode === m.id ? COLORS.primary : 'transparent',
                color: mode === m.id ? '#fff' : COLORS.textMuted,
                cursor: 'pointer', fontSize: '13px', fontWeight: '500',
              }}
            >{m.label}</button>
          ))}
        </div>

        {mode === 'password' ? (
          <form onSubmit={handlePasswordLogin}>
            <input
              type="email" placeholder="Email" value={email}
              onChange={(e) => setEmail(e.target.value)} required
              style={{
                width: '100%', padding: '12px', marginBottom: '12px',
                background: COLORS.bgTertiary, border: `1px solid ${COLORS.border}`,
                borderRadius: '8px', color: COLORS.text, fontSize: '14px', boxSizing: 'border-box',
              }}
            />
            <input
              type="password" placeholder="Hasło" value={password}
              onChange={(e) => setPassword(e.target.value)} required
              style={{
                width: '100%', padding: '12px', marginBottom: '16px',
                background: COLORS.bgTertiary, border: `1px solid ${COLORS.border}`,
                borderRadius: '8px', color: COLORS.text, fontSize: '14px', boxSizing: 'border-box',
              }}
            />
            {message && (
              <div style={{
                padding: '10px', marginBottom: '12px', borderRadius: '8px',
                background: `${COLORS.danger}20`, color: COLORS.danger,
                fontSize: '13px', textAlign: 'center',
              }}>{message}</div>
            )}
            <button type="submit" disabled={submitting || !email || !password}
              style={{
                width: '100%', padding: '14px',
                background: `linear-gradient(135deg, ${COLORS.primary}, ${COLORS.secondary})`,
                border: 'none', borderRadius: '8px', color: '#fff',
                fontSize: '14px', fontWeight: '600',
                cursor: submitting ? 'wait' : 'pointer', opacity: submitting ? 0.7 : 1,
              }}
            >{submitting ? '...' : 'Zaloguj'}</button>
          </form>
        ) : (
          <form onSubmit={handleMagicLink}>
            <input
              type="email" placeholder="Email" value={email}
              onChange={(e) => setEmail(e.target.value)}
              required disabled={isCodeSent}
              style={{
                width: '100%', padding: '12px', marginBottom: '12px',
                background: COLORS.bgTertiary, border: `1px solid ${COLORS.border}`,
                borderRadius: '8px', color: COLORS.text, fontSize: '14px',
                boxSizing: 'border-box', opacity: isCodeSent ? 0.6 : 1,
              }}
            />
            {isCodeSent && (
              <input
                type="text" placeholder="Kod jednorazowy" value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                required maxLength={8}
                style={{
                  width: '100%', padding: '12px', marginBottom: '16px',
                  background: COLORS.bgTertiary, border: `1px solid ${COLORS.border}`,
                  borderRadius: '8px', color: COLORS.text, fontSize: '14px',
                  fontWeight: 'bold', letterSpacing: '2px', textAlign: 'center', boxSizing: 'border-box',
                }}
              />
            )}
            {message && (
              <div style={{
                padding: '10px', marginBottom: '12px', borderRadius: '8px',
                background: isCodeSent ? `${COLORS.success}20` : `${COLORS.warning}20`,
                color: isCodeSent ? COLORS.success : COLORS.warning,
                fontSize: '13px', textAlign: 'center',
              }}>{message}</div>
            )}
            <button type="submit" disabled={submitting || !email || (isCodeSent && !code)}
              style={{
                width: '100%', padding: '14px',
                background: `linear-gradient(135deg, ${COLORS.primary}, ${COLORS.secondary})`,
                border: 'none', borderRadius: '8px', color: '#fff',
                fontSize: '14px', fontWeight: '600',
                cursor: submitting ? 'wait' : 'pointer', opacity: submitting ? 0.7 : 1,
              }}
            >{submitting ? '...' : !isCodeSent ? 'Wyślij link logowania' : 'Zaloguj kodem'}</button>
          </form>
        )}

        {/* Demo accounts */}
        <div style={{
          marginTop: '24px', paddingTop: '20px',
          borderTop: `1px solid ${COLORS.border}`,
        }}>
          <div style={{ fontSize: '11px', color: COLORS.textMuted, textTransform: 'uppercase', marginBottom: '10px', textAlign: 'center' }}>
            Konta demo (hasło: demo123)
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {DEMO_ACCOUNTS.map(acc => (
              <button key={acc.email}
                onClick={() => { setEmail(acc.email); setPassword('demo123'); setMode('password'); setMessage(''); }}
                style={{
                  padding: '10px 12px', background: COLORS.bgTertiary,
                  border: `1px solid ${COLORS.border}`, borderRadius: '8px',
                  color: COLORS.text, cursor: 'pointer', textAlign: 'left',
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                }}
              >
                <span style={{ fontSize: '13px' }}>{acc.label}</span>
                <span style={{ fontSize: '11px', color: COLORS.textMuted }}>{acc.desc}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
