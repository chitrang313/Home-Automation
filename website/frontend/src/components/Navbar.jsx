import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export default function Navbar() {
  const { firebaseUser, person, isAdmin, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);

  // Auto-close drawer when the route changes (e.g. user tapped a link inside)
  useEffect(() => setMenuOpen(false), [location.pathname]);

  // Lock body scroll while the drawer is open
  useEffect(() => {
    if (menuOpen) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => { document.body.style.overflow = prev; };
    }
  }, [menuOpen]);

  // Close on Escape for keyboard users
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e) => { if (e.key === 'Escape') setMenuOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [menuOpen]);

  const onLogout = async () => {
    setMenuOpen(false);
    await logout();
    navigate('/');
  };

  return (
    <>
      <header className="sticky top-0 z-30 bg-white/55 backdrop-blur-xl border-b border-white/40 shadow-sm">
        <div className="max-w-6xl mx-auto px-3 sm:px-5 py-2 sm:py-3 flex items-center justify-between gap-2">
          {/* Left: hamburger (mobile only, when logged in) + logo */}
          <div className="flex items-center gap-2 min-w-0">
            {firebaseUser && (
              <button
                onClick={() => setMenuOpen(true)}
                className="sm:hidden p-2 -ml-2 rounded-md hover:bg-slate1 active:bg-slate2 transition-colors"
                aria-label="Open menu"
                aria-expanded={menuOpen}
              >
                <BurgerIcon />
              </button>
            )}

            <Link to="/" className="flex items-center gap-2 shrink-0 min-w-0">
              <div className="h-7 w-7 rounded-md bg-ink text-paper flex items-center justify-center font-bold text-sm shrink-0">
                H
              </div>
              <span className="font-semibold tracking-tight text-sm sm:text-base truncate">
                <span className="hidden xs:inline">HomeAutomation</span>
                <span className="xs:hidden">Home</span>
              </span>
            </Link>
          </div>

          {/* Right nav — for logged-in users, hidden on mobile (use burger instead) */}
          <nav
            className={
              'items-center gap-1.5 sm:gap-2 text-sm ' +
              (firebaseUser ? 'hidden sm:flex' : 'flex')
            }
          >
            {firebaseUser ? (
              <>
                {isAdmin && (
                  <Link
                    to="/admin"
                    className="btn-sm bg-slate1 text-ink hover:bg-slate2 border border-slate3"
                  >
                    Admin Panel
                  </Link>
                )}
                <Link
                  to="/dashboard"
                  className="btn-sm bg-slate1 text-ink hover:bg-slate2 border border-slate3"
                >
                  Dashboard
                </Link>
                <Link
                  to="/profile"
                  className="hidden md:inline text-ink/60 hover:text-ink ml-2 truncate max-w-[160px]"
                  title="View profile"
                >
                  {person?.name || person?.email}
                </Link>
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

      {/* ── Mobile slide-out drawer (only rendered for logged-in users) ─────── */}
      {firebaseUser && (
        <>
          {/* Backdrop */}
          <div
            onClick={() => setMenuOpen(false)}
            aria-hidden="true"
            className={
              'sm:hidden fixed inset-0 z-40 bg-black/40 transition-opacity duration-200 ' +
              (menuOpen ? 'opacity-100' : 'opacity-0 pointer-events-none')
            }
          />

          {/* Drawer panel */}
          <aside
            role="dialog"
            aria-modal="true"
            aria-label="Navigation menu"
            className={
              'sm:hidden fixed inset-y-0 left-0 z-50 w-72 max-w-[85vw] bg-white/80 backdrop-blur-2xl shadow-2xl ' +
              'flex flex-col transform transition-transform duration-200 ease-out ' +
              (menuOpen ? 'translate-x-0' : '-translate-x-full')
            }
          >
            {/* Drawer header */}
            <div className="flex items-center justify-between p-4 border-b border-slate2">
              <div className="flex items-center gap-2">
                <div className="h-7 w-7 rounded-md bg-ink text-paper flex items-center justify-center font-bold text-sm">
                  H
                </div>
                <span className="font-semibold">Menu</span>
              </div>
              <button
                onClick={() => setMenuOpen(false)}
                className="p-2 -mr-2 rounded-md hover:bg-slate1 active:bg-slate2"
                aria-label="Close menu"
              >
                <CloseIcon />
              </button>
            </div>

            {/* Current user identity — tap to open Profile */}
            <Link
              to="/profile"
              onClick={() => setMenuOpen(false)}
              className="block px-4 py-3 border-b border-slate2 text-sm hover:bg-slate1 active:bg-slate2 transition-colors"
            >
              <div className="font-medium text-ink truncate">{person?.name || 'User'}</div>
              <div className="text-ink/60 text-xs truncate">{person?.email}</div>
              {isAdmin && (
                <span className="inline-block mt-1.5 text-[10px] uppercase font-semibold tracking-wide bg-ink text-paper px-1.5 py-0.5 rounded">
                  Admin
                </span>
              )}
            </Link>

            {/* Menu items */}
            <nav className="px-2 py-3 space-y-1 flex-1 overflow-y-auto">
              {isAdmin && (
                <Link
                  to="/admin"
                  onClick={() => setMenuOpen(false)}
                  className="flex items-center gap-3 px-3 py-3 rounded-lg text-ink hover:bg-slate1 active:bg-slate2 transition-colors"
                >
                  <ShieldIcon />
                  <span className="font-medium">Admin</span>
                </Link>
              )}
              <Link
                to="/dashboard"
                onClick={() => setMenuOpen(false)}
                className="flex items-center gap-3 px-3 py-3 rounded-lg text-ink hover:bg-slate1 active:bg-slate2 transition-colors"
              >
                <HomeIcon />
                <span className="font-medium">Home</span>
              </Link>
              <Link
                to="/profile"
                onClick={() => setMenuOpen(false)}
                className="flex items-center gap-3 px-3 py-3 rounded-lg text-ink hover:bg-slate1 active:bg-slate2 transition-colors"
              >
                <UserIcon />
                <span className="font-medium">Profile</span>
              </Link>

              <div className="my-2 border-t border-slate2" />

              <button
                onClick={onLogout}
                className="w-full flex items-center gap-3 px-3 py-3 rounded-lg text-danger hover:bg-danger/5 active:bg-danger/10 transition-colors"
              >
                <LogoutIcon />
                <span className="font-medium">Logout</span>
              </button>
            </nav>

            <div className="px-4 py-3 border-t border-slate2 text-[10px] text-ink/40 uppercase tracking-wide">
              HomeAutomation
            </div>
          </aside>
        </>
      )}
    </>
  );
}

// ─── Icons (inline SVG, no external lib) ───────────────────────────────────────
function BurgerIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="w-6 h-6">
      <line x1="3" y1="6" x2="21" y2="6" />
      <line x1="3" y1="12" x2="21" y2="12" />
      <line x1="3" y1="18" x2="21" y2="18" />
    </svg>
  );
}
function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="w-6 h-6">
      <line x1="6" y1="6" x2="18" y2="18" />
      <line x1="6" y1="18" x2="18" y2="6" />
    </svg>
  );
}
function HomeIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <path d="M9 22V12h6v10" />
    </svg>
  );
}
function ShieldIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  );
}
function UserIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}
function LogoutIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  );
}
