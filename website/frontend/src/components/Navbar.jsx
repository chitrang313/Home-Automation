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
      <div className="max-w-6xl mx-auto px-3 sm:px-5 py-2 sm:py-3 flex items-center justify-between gap-2">
        {/* Logo — compact on mobile */}
        <Link to="/" className="flex items-center gap-2 shrink-0 min-w-0">
          <div className="h-7 w-7 rounded-md bg-ink text-paper flex items-center justify-center font-bold text-sm shrink-0">
            H
          </div>
          <span className="font-semibold tracking-tight text-sm sm:text-base truncate">
            <span className="hidden xs:inline">HomeAutomation</span>
            <span className="xs:hidden">Home</span>
          </span>
        </Link>

        {/* Right side nav */}
        <nav className="flex items-center gap-1.5 sm:gap-2 text-sm">
          {firebaseUser ? (
            <>
              {isAdmin && (
                <Link
                  to="/admin"
                  className="btn-sm bg-slate1 text-ink hover:bg-slate2 border border-slate3"
                >
                  <span className="hidden sm:inline">Admin Panel</span>
                  <span className="sm:hidden">Admin</span>
                </Link>
              )}
              <Link
                to="/dashboard"
                className="btn-sm bg-slate1 text-ink hover:bg-slate2 border border-slate3"
              >
                <span className="hidden sm:inline">Dashboard</span>
                <span className="sm:hidden">Home</span>
              </Link>
              <span className="hidden md:inline text-ink/60 ml-2 truncate max-w-[160px]">
                {person?.name || person?.email}
              </span>
              <button
                onClick={onLogout}
                className="btn-sm bg-ink text-paper hover:bg-ink/90"
              >
                Logout
              </button>
            </>
          ) : (
            <>
              <Link
                to="/login"
                className="btn-sm bg-slate1 text-ink hover:bg-slate2 border border-slate3"
              >
                Login
              </Link>
              <Link to="/signup" className="btn-sm bg-ink text-paper hover:bg-ink/90">
                <span className="hidden sm:inline">Sign Up</span>
                <span className="sm:hidden">Join</span>
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
