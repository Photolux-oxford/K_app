import { useNavigate } from 'react-router-dom';

const FONT = "'Helvetica Neue', Arial, sans-serif";

interface PageBackButtonProps {
  /** Optional override when history is empty (default `/`). */
  fallbackTo?: string;
}

/** Navigates to the previous page, or `fallbackTo` when there is no history. */
export function PageBackButton({ fallbackTo = '/' }: PageBackButtonProps) {
  const navigate = useNavigate();

  return (
    <button
      type="button"
      aria-label="Go back"
      onClick={() => {
        if (window.history.length > 1) navigate(-1);
        else navigate(fallbackTo);
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
