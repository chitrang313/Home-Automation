import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

/** Redirects unauthenticated users to /login. Optionally requires admin. */
export default function ProtectedRoute({ children, adminOnly = false }) {
  const { firebaseUser, isAdmin, loading } = useAuth();
  if (loading) return <FullScreenSpinner />;
  if (!firebaseUser) return <Navigate to="/login" replace />;
  if (adminOnly && !isAdmin) return <Navigate to="/dashboard" replace />;
  return children;
}

export function FullScreenSpinner() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-paper">
      <div className="h-8 w-8 rounded-full border-2 border-ink/20 border-t-ink animate-spin" />
    </div>
  );
}
