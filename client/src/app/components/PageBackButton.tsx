import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const FONT = "'Helvetica Neue', Arial, sans-serif";

const AUTH_PATHS = ['/login', '/register'];

interface PageBackButtonProps {
  /** Optional override when history is empty (default `/`). */
  fallbackTo?: string;
}

/** Navigates to the previous page, or `fallbackTo` when there is no history. */
export function PageBackButton({ fallbackTo = '/' }: PageBackButtonProps) {
  const navigate = useNavigate();
  const { user } = useAuth();

  return (
    <button
      type="button"
      aria-label="Go back"
      onClick={() => {
        const idx = (window.history.state as { idx?: number } | null)?.idx;

        // After login/register with replace, stack is shallow — go home instead of auth.
        if (user && (idx == null || idx <= 0)) {
          navigate(fallbackTo);
          return;
        }

        if (window.history.length > 1) {
          navigate(-1);
          // Guard: if history still had an auth screen, bounce to fallback.
          if (user) {
            window.setTimeout(() => {
              const path = window.location.pathname;
              if (AUTH_PATHS.some(p => path === p || path.startsWith(`${p}/`))) {
                navigate(fallbackTo, { replace: true });
              }
            }, 0);
          }
          return;
        }

        navigate(fallbackTo);
      }}
      style={{
        background: 'none',
        border: 'none',
        padding: '6px 4px',
        cursor: 'pointer',
        fontFamily: FONT,
        fontSize: 18,
        lineHeight: 1,
        color: '#111',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      ←
    </button>
  );
}
