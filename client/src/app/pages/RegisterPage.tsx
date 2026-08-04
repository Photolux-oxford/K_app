import { useState, FormEvent, ChangeEvent } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Header } from '../components/Header';
import { GoogleSignInButton } from '../components/GoogleSignInButton';
import { api } from '../lib/api';
import type { AuthUser } from '../context/AuthContext';

interface RegisterPendingResponse {
  requires_verification: true;
  email: string;
  message: string;
  email_sent: boolean;
  debug_code?: string;
}

interface AuthTokensResponse {
  access: string;
  refresh: string;
  user: AuthUser;
}

const FONT = "'Helvetica Neue', Arial, sans-serif";

export function RegisterPage() {
  const [form, setForm] = useState({
    first_name: '', last_name: '', email: '', password: '',
  });
  const [step, setStep] = useState<'details' | 'verify'>('details');
  const [code, setCode] = useState('');
  const [pendingEmail, setPendingEmail] = useState('');
  const [hint, setHint] = useState('');
  const [debugCode, setDebugCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const set = (field: keyof typeof form) =>
    (e: ChangeEvent<HTMLInputElement>) =>
      setForm(f => ({ ...f, [field]: e.target.value }));

  const handleRegister = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setHint('');
    setLoading(true);
    try {
      const res = await api.post<RegisterPendingResponse>('/auth/register/', form);
      setPendingEmail(res.email);
      setHint(res.message);
      setDebugCode(res.debug_code ?? '');
      setStep('verify');
    } catch (err: unknown) {
      const e = err as { data?: { error?: string } };
      setError(e.data?.error ?? 'Registration failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await api.post<AuthTokensResponse>('/auth/verify/', {
        email: pendingEmail,
        code: code.trim(),
      });
      login(res.access, res.refresh, res.user);
      // Replace so the back button doesn't return to the register / verify screen.
      navigate(res.user.is_staff ? '/admin' : '/dashboard', { replace: true });
    } catch (err: unknown) {
      const e = err as { data?: { error?: string } };
      setError(e.data?.error ?? 'Verification failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    setError('');
    setHint('');
    setLoading(true);
    try {
      const res = await api.post<RegisterPendingResponse>('/auth/resend-verification/', {
        email: pendingEmail,
      });
      setHint(res.message);
      setDebugCode(res.debug_code ?? '');
    } catch (err: unknown) {
      const e = err as { data?: { error?: string } };
      setError(e.data?.error ?? 'Could not resend code.');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = async (credential: string) => {
    setError('');
    setLoading(true);
    try {
      const res = await api.post<AuthTokensResponse>('/auth/google/', { credential });
      login(res.access, res.refresh, res.user);
      navigate(res.user.is_staff ? '/admin' : '/dashboard', { replace: true });
    } catch (err: unknown) {
      const e = err as { data?: { error?: string } };
      setError(e.data?.error ?? 'Google sign-in failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '12px 14px',
    border: '1px solid #ddd', fontSize: 14,
    outline: 'none', fontFamily: 'inherit',
    boxSizing: 'border-box',
  };
  const labelStyle: React.CSSProperties = {
    display: 'block', fontSize: 11,
    letterSpacing: 1, textTransform: 'uppercase',
    color: '#555', marginBottom: 6,
  };

  const fields: { field: keyof typeof form; label: string; type: string; autocomplete: string }[] = [
    { field: 'first_name', label: 'First name',  type: 'text',     autocomplete: 'given-name' },
    { field: 'last_name',  label: 'Last name',   type: 'text',     autocomplete: 'family-name' },
    { field: 'email',      label: 'Email',        type: 'email',    autocomplete: 'email' },
    { field: 'password',   label: 'Password',     type: 'password', autocomplete: 'new-password' },
  ];

  return (
    <div className="auth-page" style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fff', paddingTop: 64, fontFamily: FONT }}>
      <Header />
      <div style={{ width: '100%', maxWidth: 400, padding: '48px 32px' }}>
        {step === 'details' ? (
          <>
            <h1 style={{ fontSize: 28, fontWeight: 300, letterSpacing: '-0.5px', marginBottom: 8 }}>Create account</h1>
            <p style={{ color: '#888', fontSize: 13, marginBottom: 32 }}>Photolux Oxford</p>

            <form onSubmit={handleRegister}>
              {fields.map(({ field, label, type, autocomplete }) => (
                <div key={field} style={{ marginBottom: 16 }}>
                  <label style={labelStyle}>{label}</label>
                  <input
                    type={type} value={form[field]} required
                    autoComplete={autocomplete}
                    onChange={set(field)} style={inputStyle}
                  />
                </div>
              ))}

              {error && (
                <p style={{ color: '#b91c1c', fontSize: 13, marginBottom: 16 }}>{error}</p>
              )}

              <button
                type="submit" disabled={loading}
                style={{
                  width: '100%', padding: 14, marginTop: 8,
                  background: loading ? '#555' : '#111', color: '#fff',
                  fontSize: 12, fontWeight: 700, letterSpacing: 2,
                  textTransform: 'uppercase', border: 'none', cursor: loading ? 'default' : 'pointer',
                }}
              >
                {loading ? 'Sending code…' : 'Continue'}
              </button>
            </form>

            <GoogleSignInButton onCredential={handleGoogle} disabled={loading} />
          </>
        ) : (
          <>
            <h1 style={{ fontSize: 28, fontWeight: 300, letterSpacing: '-0.5px', marginBottom: 8 }}>Check your email</h1>
            <p style={{ color: '#888', fontSize: 13, marginBottom: 12, lineHeight: 1.5 }}>
              We sent a 6-digit code to <strong style={{ color: '#111' }}>{pendingEmail}</strong>.
              Enter it below to verify your account.
            </p>
            {hint && (
              <p style={{ color: '#666', fontSize: 12, marginBottom: 20, lineHeight: 1.5 }}>{hint}</p>
            )}
            {debugCode && (
              <p style={{
                color: '#92400e', fontSize: 12, marginBottom: 16, padding: '10px 12px',
                background: '#fffbeb', border: '1px solid #fcd34d', lineHeight: 1.4,
              }}>
                Dev mode: code is <strong>{debugCode}</strong> (shown because DEBUG=True — not shown in production).
              </p>
            )}

            <form onSubmit={handleVerify}>
              <div style={{ marginBottom: 16 }}>
                <label style={labelStyle}>Verification code</label>
                <input
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="[0-9]{6}"
                  maxLength={6}
                  value={code}
                  required
                  onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  style={{ ...inputStyle, letterSpacing: '0.35em', fontSize: 20, textAlign: 'center' }}
                  placeholder="000000"
                />
              </div>

              {error && (
                <p style={{ color: '#b91c1c', fontSize: 13, marginBottom: 16 }}>{error}</p>
              )}

              <button
                type="submit" disabled={loading || code.length !== 6}
                style={{
                  width: '100%', padding: 14, marginTop: 8,
                  background: loading || code.length !== 6 ? '#555' : '#111', color: '#fff',
                  fontSize: 12, fontWeight: 700, letterSpacing: 2,
                  textTransform: 'uppercase', border: 'none',
                  cursor: loading || code.length !== 6 ? 'default' : 'pointer',
                }}
              >
                {loading ? 'Verifying…' : 'Verify & continue'}
              </button>
            </form>

            <p style={{ fontSize: 13, color: '#888', marginTop: 20, textAlign: 'center' }}>
              Didn’t get it?{' '}
              <button
                type="button"
                onClick={handleResend}
                disabled={loading}
                style={{
                  background: 'none', border: 'none', padding: 0,
                  color: '#111', fontWeight: 600, cursor: 'pointer', fontSize: 13,
                }}
              >
                Resend code
              </button>
            </p>
            <p style={{ fontSize: 13, color: '#888', marginTop: 12, textAlign: 'center' }}>
              <button
                type="button"
                onClick={() => { setStep('details'); setCode(''); setError(''); setHint(''); }}
                style={{
                  background: 'none', border: 'none', padding: 0,
                  color: '#888', cursor: 'pointer', fontSize: 13, textDecoration: 'underline',
                }}
              >
                Back to details
              </button>
            </p>
          </>
        )}

        <p style={{ fontSize: 13, color: '#888', marginTop: 24, textAlign: 'center' }}>
          Already have an account?{' '}
          <Link to="/login" replace style={{ color: '#111', fontWeight: 600 }}>Log in</Link>
        </p>
      </div>
    </div>
  );
}
