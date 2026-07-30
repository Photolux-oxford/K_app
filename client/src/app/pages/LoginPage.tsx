import { useState, FormEvent } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api } from '../lib/api';
import type { AuthUser } from '../context/AuthContext';

/** Only allow same-origin relative paths (no protocol-relative //…). */
function resolveNextPath(raw: string | null, isStaff: boolean): string {
  if (!raw) return isStaff ? '/admin' : '/dashboard';
  const decoded = decodeURIComponent(raw);
  if (!decoded.startsWith('/') || decoded.startsWith('//')) {
    return isStaff ? '/admin' : '/dashboard';
  }
  return decoded;
}

export function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const tokens = await api.post<{ access: string; refresh: string }>(
        '/auth/token/',
        { username: email, password }
      );
      // Temporarily set token so the /me call is authenticated
      localStorage.setItem('access_token', tokens.access);
      const user = await api.get<AuthUser>('/auth/me/');
      login(tokens.access, tokens.refresh, user);
      navigate(resolveNextPath(searchParams.get('next'), user.is_staff));
    } catch {
      localStorage.removeItem('access_token');
      setError('Invalid email or password.');
    } finally {
      setLoading(false);
    }
  };

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '12px 14px',
    border: '1px solid #ddd', fontSize: 14,
    outline: 'none', fontFamily: 'inherit',
  };
  const labelStyle: React.CSSProperties = {
    display: 'block', fontSize: 11,
    letterSpacing: 1, textTransform: 'uppercase',
    color: '#555', marginBottom: 6,
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fff' }}>
      <div style={{ width: '100%', maxWidth: 400, padding: '48px 32px' }}>
        <h1 style={{ fontSize: 28, fontWeight: 300, letterSpacing: '-0.5px', marginBottom: 8 }}>Log in</h1>
        <p style={{ color: '#888', fontSize: 13, marginBottom: 32 }}>Kay Tubillla Photography</p>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>Email or username</label>
            <input
              type="text" value={email} required autoComplete="username"
              onChange={e => setEmail(e.target.value)} style={inputStyle}
            />
          </div>
          <div style={{ marginBottom: 24 }}>
            <label style={labelStyle}>Password</label>
            <input
              type="password" value={password} required autoComplete="current-password"
              onChange={e => setPassword(e.target.value)} style={inputStyle}
            />
          </div>

          {error && (
            <p style={{ color: '#b91c1c', fontSize: 13, marginBottom: 16 }}>{error}</p>
          )}

          <button
            type="submit" disabled={loading}
            style={{
              width: '100%', padding: 14,
              background: loading ? '#555' : '#111', color: '#fff',
              fontSize: 12, fontWeight: 700, letterSpacing: 2,
              textTransform: 'uppercase', border: 'none', cursor: loading ? 'default' : 'pointer',
            }}
          >
            {loading ? 'Logging in…' : 'Log In'}
          </button>
        </form>

        <p style={{ fontSize: 13, color: '#888', marginTop: 24, textAlign: 'center' }}>
          No account?{' '}
          <Link to="/register" style={{ color: '#111', fontWeight: 600 }}>Register</Link>
        </p>
      </div>
    </div>
  );
}
