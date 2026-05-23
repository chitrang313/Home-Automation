import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export default function Welcome() {
  const { firebaseUser, isAdmin } = useAuth();
  return (
    <main className="max-w-3xl mx-auto px-4 sm:px-5 py-12 sm:py-20 text-center">
      <div className="inline-block px-3 py-1 rounded-full bg-slate1 text-xs text-ink/60 mb-5 sm:mb-6">
        ESP32 · Firebase · Real-time
      </div>
      <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight leading-tight">
        Control your home, room by room.
      </h1>
      <p className="mt-4 sm:mt-5 text-ink/60 leading-relaxed max-w-xl mx-auto text-sm sm:text-base">
        A clean, fast dashboard for every house — lights, fans, AC, and more.
        Each household has its own login. Admins manage everything from one place.
      </p>

      <div className="mt-8 sm:mt-10 flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-2 sm:gap-3 max-w-sm sm:max-w-none mx-auto">
        {firebaseUser ? (
          <>
            <Link to="/dashboard" className="btn-primary">Open Dashboard</Link>
            {isAdmin && <Link to="/admin" className="btn-secondary">Admin Panel</Link>}
          </>
        ) : (
          <>
            <Link to="/login" className="btn-primary">Login</Link>
            <Link to="/signup" className="btn-secondary">Create Account</Link>
          </>
        )}
      </div>
    </main>
  );
}
