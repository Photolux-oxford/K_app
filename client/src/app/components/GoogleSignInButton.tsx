import { useEffect, useRef, useState } from 'react';

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID ?? '';

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: {
            client_id: string;
            callback: (response: { credential: string }) => void;
            auto_select?: boolean;
            cancel_on_tap_outside?: boolean;
          }) => void;
          renderButton: (
            parent: HTMLElement,
            options: Record<string, string | number | boolean>,
          ) => void;
        };
      };
    };
  }
}

interface GoogleSignInButtonProps {
  onCredential: (credential: string) => void | Promise<void>;
  disabled?: boolean;
}

let scriptPromise: Promise<void> | null = null;

function loadGoogleScript(): Promise<void> {
  if (window.google?.accounts?.id) return Promise.resolve();
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-google-gsi]');
    if (existing) {
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', () => reject(new Error('Google script failed')));
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.dataset.googleGsi = '1';
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Google script failed'));
    document.head.appendChild(script);
  });
  return scriptPromise;
}

/** Official Google button; hidden when VITE_GOOGLE_CLIENT_ID is unset. */
export function GoogleSignInButton({ onCredential, disabled }: GoogleSignInButtonProps) {
  const btnRef = useRef<HTMLDivElement>(null);
  const callbackRef = useRef(onCredential);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);

  callbackRef.current = onCredential;

  useEffect(() => {
    if (!CLIENT_ID || disabled) return;
    let cancelled = false;

    loadGoogleScript()
      .then(() => {
        if (cancelled || !btnRef.current || !window.google?.accounts?.id) return;
        window.google.accounts.id.initialize({
          client_id: CLIENT_ID,
          callback: (response) => {
            if (response.credential) void callbackRef.current(response.credential);
          },
          auto_select: false,
          cancel_on_tap_outside: true,
        });
        btnRef.current.innerHTML = '';
        window.google.accounts.id.renderButton(btnRef.current, {
          type: 'standard',
          theme: 'outline',
          size: 'large',
          text: 'continue_with',
          shape: 'rectangular',
          logo_alignment: 'left',
          width: 336,
        });
        setReady(true);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });

    return () => {
      cancelled = true;
    };
  }, [disabled]);

  if (!CLIENT_ID) return null;

  if (failed) {
    return (
      <p style={{ fontSize: 12, color: '#888', textAlign: 'center', margin: '16px 0 0' }}>
        Google sign-in could not load. Use email instead.
      </p>
    );
  }

  return (
    <div style={{ marginTop: 20 }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12,
        marginBottom: 16, color: '#bbb', fontSize: 11,
        letterSpacing: '0.08em', textTransform: 'uppercase',
      }}>
        <div style={{ flex: 1, height: 1, background: '#eee' }} />
        or
        <div style={{ flex: 1, height: 1, background: '#eee' }} />
      </div>
      <div
        ref={btnRef}
        style={{
          display: 'flex',
          justifyContent: 'center',
          minHeight: 44,
          opacity: ready && !disabled ? 1 : 0.5,
          pointerEvents: disabled ? 'none' : 'auto',
        }}
      />
    </div>
  );
}
