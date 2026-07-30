import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

interface Props {
  children: React.ReactNode;
  requireStaff?: boolean;
}

function safeNextPath(pathname: string, search: string): string {
  const full = `${pathname}${search}`;
  return encodeURIComponent(full);
}

export function ProtectedRoute({ children, requireStaff = false }: Props) {
  const { user, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) return <div style={{ padding: 40, textAlign: 'center', color: '#888' }}>Loading…</div>;
  if (!user) {
    return <Navigate to={`/login?next=${safeNextPath(location.pathname, location.search)}`} replace />;
  }
  if (requireStaff && !user.is_staff) return <Navigate to="/dashboard" replace />;

  return <>{children}</>;
}
