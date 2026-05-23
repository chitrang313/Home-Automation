import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const onSubmit = async (e) => {
    e.preventDefault();
    setErr('');
    setBusy(true);
    try {
      await login(email, password);
      // AuthContext will reload profile; redirect happens via ProtectedRoute logic
      navigate('/dashboard');
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="max-w-md mx-auto px-5 py-14">
      <div className="card">
        <h1 className="text-2xl font-bold mb-1">Welcome back</h1>
        <p className="text-ink/60 text-sm mb-6">Sign in to your dashboard.</p>

        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label className="label">Email</label>
            <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div>
            <label className="label">Password</label>
            <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </div>
          {err && <div className="text-sm text-danger">{err}</div>}
          <button disabled={busy} className="btn-primary w-full">{busy ? 'Signing in…' : 'Sign in'}</button>
        </form>

        <div className="mt-5 flex items-center justify-between text-sm">
          <Link to="/forgot-password" className="text-ink/60 hover:text-ink">Forgot password?</Link>
          <Link to="/signup" className="text-ink/60 hover:text-ink">Create account</Link>
        </div>
      </div>
    </main>
  );
}
