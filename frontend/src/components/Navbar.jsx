import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export default function Navbar() {
  const { firebaseUser, person, isAdmin, logout } = useAuth();
  const navigate = useNavigate();

  const onLogout = async () => {
    await logout();
    navigate('/');
  };

  return (
    <header className="sticky top-0 z-30 bg-paper/85 backdrop-blur border-b border-slate2">
      <div className="max-w-6xl mx-auto px-5 py-3 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2">
          <div className="h-7 w-7 rounded-md bg-ink text-paper flex items-center justify-center font-bold text-sm">H</div>
          <span className="font-semibold tracking-tight">HomeAutomation</span>
        </Link>

        <nav className="flex items-center gap-2 text-sm">
          {firebaseUser ? (
            <>
              {isAdmin && <Link to="/admin" className="btn-secondary">Admin Panel</Link>}
              <Link to="/dashboard" className="btn-secondary">Dashboard</Link>
              <span className="hidden sm:inline text-ink/60 ml-3">{person?.name || person?.email}</span>
              <button onClick={onLogout} className="btn-primary ml-2">Logout</button>
            </>
          ) : (
            <>
              <Link to="/login" className="btn-secondary">Login</Link>
              <Link to="/signup" className="btn-primary">Sign Up</Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
